const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = path.join(DATA_DIR, 'sandbox.db')

let db

function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
  }
  return db
}

function migrate(db) {
  // ─── Ensure base tables exist ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      slug        TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS versions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_slug    TEXT NOT NULL REFERENCES branches(slug) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      json_data      TEXT NOT NULL,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_versions_branch ON versions(branch_slug);

    CREATE TABLE IF NOT EXISTS comments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id     INTEGER,
      branch_slug   TEXT NOT NULL REFERENCES branches(slug) ON DELETE CASCADE,
      version_id    INTEGER,
      node_id       TEXT,
      x             REAL,
      y             REAL,
      text          TEXT NOT NULL,
      author        TEXT NOT NULL DEFAULT 'Аноним',
      role          TEXT NOT NULL DEFAULT 'designer',
      status        TEXT NOT NULL DEFAULT 'open',
      reject_reason TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_comments_branch ON comments(branch_slug);

    CREATE TABLE IF NOT EXISTS shares (
      token       TEXT PRIMARY KEY,
      branch_slug TEXT NOT NULL REFERENCES branches(slug) ON DELETE CASCADE,
      version_id  INTEGER NOT NULL,
      created_by  TEXT NOT NULL DEFAULT 'designer',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // ─── Migrate old schema: branches.json_data → versions ───────────────────
  const branchCols = db.pragma('table_info(branches)').map(c => c.name)
  if (branchCols.includes('json_data')) {
    // Migrate existing json_data to versions table
    const rows = db.prepare(
      'SELECT slug, json_data, created_at FROM branches WHERE json_data IS NOT NULL'
    ).all()
    const insertVer = db.prepare(
      'INSERT OR IGNORE INTO versions (branch_slug, version_number, json_data, created_at) VALUES (?, 1, ?, ?)'
    )
    for (const r of rows) {
      const exists = db.prepare('SELECT id FROM versions WHERE branch_slug = ? LIMIT 1').get(r.slug)
      if (!exists && r.json_data) insertVer.run(r.slug, r.json_data, r.created_at)
    }
    // Recreate branches table without json_data column
    db.exec(`
      CREATE TABLE branches_new (
        slug        TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO branches_new (slug, title, created_at) SELECT slug, title, created_at FROM branches;
      DROP TABLE branches;
      ALTER TABLE branches_new RENAME TO branches;
    `)
  }

  // ─── Add new columns to comments if upgrading from old schema ────────────
  const commentCols = db.pragma('table_info(comments)').map(c => c.name)
  if (!commentCols.includes('version_id')) {
    db.exec('ALTER TABLE comments ADD COLUMN version_id INTEGER')
    db.exec(`
      UPDATE comments SET version_id = (
        SELECT id FROM versions WHERE branch_slug = comments.branch_slug
        ORDER BY version_number ASC LIMIT 1
      ) WHERE version_id IS NULL
    `)
  }
  if (!commentCols.includes('status')) {
    db.exec("ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'open'")
  }
  if (!commentCols.includes('reject_reason')) {
    db.exec('ALTER TABLE comments ADD COLUMN reject_reason TEXT')
  }
  if (!commentCols.includes('parent_id')) {
    db.exec('ALTER TABLE comments ADD COLUMN parent_id INTEGER')
  }
  if (!commentCols.includes('updated_at')) {
    db.exec('ALTER TABLE comments ADD COLUMN updated_at INTEGER')
  }
}

module.exports = { getDb }
