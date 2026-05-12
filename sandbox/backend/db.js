const Database = require('better-sqlite3')
const bcrypt = require('bcrypt')
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

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      first_name      TEXT NOT NULL DEFAULT '',
      last_name       TEXT NOT NULL DEFAULT '',
      role            TEXT NOT NULL DEFAULT 'guest' CHECK(role IN ('designer','pm','analyst','frontend','backend','guest')),
      reset_token     TEXT,
      reset_expires   INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // ─── Seed default users ───────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000)
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (email, password_hash, first_name, last_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertUser.run('serg@skala.dev', bcrypt.hashSync('9562876', 10), 'Serg', '', 'designer', now)
  insertUser.run('admin@skala.dev', bcrypt.hashSync('admin123', 10), 'Admin', '', 'designer', now)

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

  // ─── Add hierarchy columns to branches if missing ────────────────────────
  const branchCols2 = db.pragma('table_info(branches)').map(c => c.name)
  if (!branchCols2.includes('parent_slug')) {
    db.exec('ALTER TABLE branches ADD COLUMN parent_slug TEXT REFERENCES branches(slug)')
  }
  if (!branchCols2.includes('node_type')) {
    db.exec("ALTER TABLE branches ADD COLUMN node_type TEXT NOT NULL DEFAULT 'feature' CHECK(node_type IN ('product','page','feature'))")
  }
  if (!branchCols2.includes('created_by')) {
    db.exec('ALTER TABLE branches ADD COLUMN created_by TEXT')
  }
  if (!branchCols2.includes('is_archived')) {
    db.exec('ALTER TABLE branches ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0')
  }

  // ─── Add is_archived to versions if missing ────────────────────────────────
  const verCols = db.pragma('table_info(versions)').map(c => c.name)
  if (!verCols.includes('is_archived')) {
    db.exec('ALTER TABLE versions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0')
  }

  // ─── Auto-migrate existing orphan branches into "Migrated" hierarchy ──────
  const now2 = Math.floor(Date.now() / 1000)
  const orphanCount = db.prepare("SELECT COUNT(*) as c FROM branches WHERE parent_slug IS NULL AND node_type = 'feature'").get().c
  if (orphanCount > 0) {
    const existingProduct = db.prepare("SELECT slug FROM branches WHERE node_type = 'product' AND slug = 'migrated'").get()
    if (!existingProduct) {
      db.prepare("INSERT OR IGNORE INTO branches (slug, title, node_type, parent_slug, created_by, is_archived, created_at) VALUES (?, ?, 'product', NULL, 'system', 0, ?)").run('migrated', 'Migrated', now2)
    }
    const existingPage = db.prepare("SELECT slug FROM branches WHERE node_type = 'page' AND parent_slug = 'migrated'").get()
    if (!existingPage) {
      db.prepare("INSERT OR IGNORE INTO branches (slug, title, node_type, parent_slug, created_by, is_archived, created_at) VALUES (?, ?, 'page', 'migrated', 'system', 0, ?)").run('migrated-default', 'Default', now2)
    }
    db.prepare("UPDATE branches SET parent_slug = 'migrated-default', node_type = 'feature' WHERE parent_slug IS NULL AND node_type = 'feature' AND slug NOT IN ('migrated','migrated-default')").run()
  }
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
