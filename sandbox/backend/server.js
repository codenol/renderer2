const express = require('express')
const cors = require('cors')
const { nanoid } = require('nanoid')
const yaml = require('js-yaml')
const { getDb } = require('./db')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())

// Raw body capture for YAML support — express.json() can't parse YAML
app.use(express.raw({ type: 'text/yaml', limit: '10mb' }))
app.use(express.raw({ type: 'application/x-yaml', limit: '10mb' }))
app.use(express.json({ limit: '10mb' }))

// Parse YAML body if applicable (as raw Buffer).
// Uses FAILSAFE_SCHEMA to avoid YAML 1.1 boolean coercion ('on' → true).
function parseBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const str = req.body.toString('utf-8')
    const raw = yaml.load(str, { schema: yaml.FAILSAFE_SCHEMA })
    return postProcess(raw)
  }
  return req.body
}

// Post-process: convert "true"/"false" strings → booleans, numeric strings → numbers.
// FAILSAFE_SCHEMA treats everything as strings, so we fix common types.
function postProcess(obj) {
  if (Array.isArray(obj)) return obj.map(postProcess)
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = postProcess(v)
    }
    return result
  }
  if (typeof obj === 'string') {
    if (obj === 'true') return true
    if (obj === 'false') return false
    if (obj === 'null' || obj === '~') return null
    if (/^-?\d+$/.test(obj)) return parseInt(obj, 10)
    if (/^-?\d+\.\d+$/.test(obj)) return parseFloat(obj)
  }
  return obj
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtComment(c) {
  return {
    id: c.id,
    branchSlug: c.branch_slug,
    versionId: c.version_id,
    versionNumber: c.version_number ?? null,
    nodeId: c.node_id,
    x: c.x,
    y: c.y,
    text: c.text,
    author: c.author,
    role: c.role,
    status: c.status ?? 'open',
    rejectReason: c.reject_reason ?? null,
    createdAt: new Date(c.created_at * 1000).toISOString(),
  }
}

function fmtVersion(v) {
  return {
    id: v.id,
    branchSlug: v.branch_slug,
    versionNumber: v.version_number,
    createdAt: new Date(v.created_at * 1000).toISOString(),
  }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

// POST /api/branches — загрузить JSON/YAML экрана → создать ветку + первую версию
app.post('/api/branches', (req, res) => {
  const json = parseBody(req)
  if (!json || !json.meta) {
    return res.status(400).json({ error: 'Invalid screen: missing meta. Send JSON or YAML with meta.title.' })
  }

  const db = getDb()
  const slug = nanoid(8)
  const title = json.meta.title || 'Без названия'
  const now = Math.floor(Date.now() / 1000)

  db.prepare('INSERT INTO branches (slug, title, created_at) VALUES (?, ?, ?)').run(slug, title, now)
  const result = db.prepare(
    'INSERT INTO versions (branch_slug, version_number, json_data, created_at) VALUES (?, 1, ?, ?)'
  ).run(slug, JSON.stringify(json), now)

  res.status(201).json({
    slug,
    title,
    versionId: result.lastInsertRowid,
    versionNumber: 1,
    url: `/branch/${slug}`,
    createdAt: new Date(now * 1000).toISOString(),
  })
})

// GET /api/branches — список всех веток
app.get('/api/branches', (req, res) => {
  const db = getDb()
  const rows = db.prepare(
    'SELECT slug, title, created_at FROM branches ORDER BY created_at DESC LIMIT 50'
  ).all()
  res.json(rows.map(r => ({
    slug: r.slug,
    title: r.title,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  })))
})

// GET /api/branches/:slug — информация о ветке + последняя версия JSON
app.get('/api/branches/:slug', (req, res) => {
  const db = getDb()
  const branch = db.prepare('SELECT * FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return res.status(404).json({ error: 'Branch not found' })

  const latest = db.prepare(
    'SELECT * FROM versions WHERE branch_slug = ? ORDER BY version_number DESC LIMIT 1'
  ).get(req.params.slug)
  if (!latest) return res.status(404).json({ error: 'No versions found' })

  res.json({
    slug: branch.slug,
    title: branch.title,
    versionId: latest.id,
    versionNumber: latest.version_number,
    createdAt: new Date(branch.created_at * 1000).toISOString(),
    screen: JSON.parse(latest.json_data),
  })
})

// ─── Versions ─────────────────────────────────────────────────────────────────

// GET /api/branches/:slug/versions — список версий
app.get('/api/branches/:slug/versions', (req, res) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return res.status(404).json({ error: 'Branch not found' })

  const versions = db.prepare(
    'SELECT * FROM versions WHERE branch_slug = ? ORDER BY version_number ASC'
  ).all(req.params.slug)

  res.json(versions.map(fmtVersion))
})

// GET /api/branches/:slug/versions/:versionId — JSON конкретной версии
app.get('/api/branches/:slug/versions/:versionId', (req, res) => {
  const db = getDb()
  const version = db.prepare(
    'SELECT * FROM versions WHERE id = ? AND branch_slug = ?'
  ).get(parseInt(req.params.versionId), req.params.slug)
  if (!version) return res.status(404).json({ error: 'Version not found' })

  res.json({ ...fmtVersion(version), screen: JSON.parse(version.json_data) })
})

// POST /api/branches/:slug/versions — загрузить новую версию (JSON или YAML)
app.post('/api/branches/:slug/versions', (req, res) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return res.status(404).json({ error: 'Branch not found' })

  const json = parseBody(req)
  if (!json || !json.meta) return res.status(400).json({ error: 'Invalid screen: missing meta' })

  const maxRow = db.prepare(
    'SELECT MAX(version_number) as max FROM versions WHERE branch_slug = ?'
  ).get(req.params.slug)
  const newNum = (maxRow?.max ?? 0) + 1
  const now = Math.floor(Date.now() / 1000)

  const result = db.prepare(
    'INSERT INTO versions (branch_slug, version_number, json_data, created_at) VALUES (?, ?, ?, ?)'
  ).run(req.params.slug, newNum, JSON.stringify(json), now)

  // Update branch title from new version
  if (json.meta?.title) {
    db.prepare('UPDATE branches SET title = ? WHERE slug = ?').run(json.meta.title, req.params.slug)
  }

  res.status(201).json({
    id: result.lastInsertRowid,
    branchSlug: req.params.slug,
    versionNumber: newNum,
    createdAt: new Date(now * 1000).toISOString(),
  })
})

// ─── Comments ─────────────────────────────────────────────────────────────────

// GET /api/branches/:slug/comments — все комментарии по всем версиям
app.get('/api/branches/:slug/comments', (req, res) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return res.status(404).json({ error: 'Branch not found' })

  const comments = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c
    LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.branch_slug = ?
    ORDER BY c.created_at ASC
  `).all(req.params.slug)

  res.json(comments.map(fmtComment))
})

// POST /api/branches/:slug/comments — добавить комментарий
app.post('/api/branches/:slug/comments', (req, res) => {
  const { versionId, nodeId, x, y, text, author, role } = req.body

  if (!text?.trim()) return res.status(400).json({ error: 'Comment text is required' })
  if (!versionId) return res.status(400).json({ error: 'versionId is required' })

  const validRoles = ['designer', 'analyst', 'pm', 'frontend', 'backend', 'qa']
  const safeRole = validRoles.includes(role) ? role : 'designer'
  const now = Math.floor(Date.now() / 1000)

  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return res.status(404).json({ error: 'Branch not found' })

  const result = db.prepare(`
    INSERT INTO comments (branch_slug, version_id, node_id, x, y, text, author, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(req.params.slug, versionId, nodeId ?? null, x ?? null, y ?? null, text.trim(), author || 'Аноним', safeRole, now)

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid)

  res.status(201).json(fmtComment(comment))
})

// PATCH /api/branches/:slug/comments/:id — изменить статус (open/resolved/rejected)
app.patch('/api/branches/:slug/comments/:id', (req, res) => {
  const { status, rejectReason } = req.body
  const validStatuses = ['open', 'resolved', 'rejected']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }
  if (status === 'rejected' && !rejectReason?.trim()) {
    return res.status(400).json({ error: 'rejectReason required when rejecting' })
  }

  const db = getDb()
  db.prepare(
    'UPDATE comments SET status = ?, reject_reason = ? WHERE id = ? AND branch_slug = ?'
  ).run(status, rejectReason?.trim() ?? null, parseInt(req.params.id), req.params.slug)

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(parseInt(req.params.id))

  if (!comment) return res.status(404).json({ error: 'Comment not found' })
  res.json(fmtComment(comment))
})

// DELETE /api/branches/:slug/comments/:id — удалить комментарий
app.delete('/api/branches/:slug/comments/:id', (req, res) => {
  const db = getDb()
  const result = db.prepare(
    'DELETE FROM comments WHERE id = ? AND branch_slug = ?'
  ).run(parseInt(req.params.id), req.params.slug)

  if (result.changes === 0) return res.status(404).json({ error: 'Comment not found' })
  res.status(204).send()
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SandBox backend running on http://localhost:${PORT}`)
})
