const fastify = require('fastify')
const cors = require('@fastify/cors')
const websocket = require('@fastify/websocket')
const { nanoid } = require('nanoid')
const yaml = require('js-yaml')
const { getDb } = require('./db')

const PORT = process.env.PORT || 3001

const app = fastify({ logger: true })

app.register(cors, { origin: true })
app.register(websocket)

// ─── YAML body parser ──────────────────────────────────────────────────────

function parseBody(body) {
  if (Buffer.isBuffer(body)) {
    const str = body.toString('utf-8')
    const raw = yaml.load(str, { schema: yaml.FAILSAFE_SCHEMA })
    return postProcess(raw)
  }
  return body
}

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

app.addContentTypeParser('text/yaml', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})
app.addContentTypeParser('application/x-yaml', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtComment(c) {
  return {
    id: c.id,
    parentId: c.parent_id ?? null,
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
    updatedAt: c.updated_at ? new Date(c.updated_at * 1000).toISOString() : null,
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

// ─── WebSocket broadcast ─────────────────────────────────────────────────────

const branchSubscribers = new Map() // branchSlug → Set<WebSocket>

function wsBroadcast(branchSlug, payload) {
  const set = branchSubscribers.get(branchSlug)
  if (!set) return
  const msg = JSON.stringify(payload)
  for (const ws of set) {
    try { ws.send(msg) } catch { /* ignore */ }
  }
}

// ─── Branches ────────────────────────────────────────────────────────────────

app.post('/api/branches', async (req, reply) => {
  const contentType = req.headers['content-type'] || ''
  const body = contentType.includes('yaml')
    ? parseBody(req.body)
    : req.body

  if (!body || !body.meta) {
    return reply.code(400).send({ error: 'Invalid screen: missing meta. Send JSON or YAML with meta.title.' })
  }

  const db = getDb()
  const slug = nanoid(8)
  const title = body.meta.title || 'Без названия'
  const now = Math.floor(Date.now() / 1000)

  db.prepare('INSERT INTO branches (slug, title, created_at) VALUES (?, ?, ?)').run(slug, title, now)
  const result = db.prepare(
    'INSERT INTO versions (branch_slug, version_number, json_data, created_at) VALUES (?, 1, ?, ?)'
  ).run(slug, JSON.stringify(body), now)

  reply.code(201).send({
    slug,
    title,
    versionId: Number(result.lastInsertRowid),
    versionNumber: 1,
    url: `/branch/${slug}`,
    createdAt: new Date(now * 1000).toISOString(),
  })
})

app.get('/api/branches', async () => {
  const db = getDb()
  const rows = db.prepare(
    'SELECT slug, title, created_at FROM branches ORDER BY created_at DESC LIMIT 50'
  ).all()
  return rows.map(r => ({
    slug: r.slug,
    title: r.title,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  }))
})

app.get('/api/branches/:slug', async (req, reply) => {
  const db = getDb()
  const branch = db.prepare('SELECT * FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  const latest = db.prepare(
    'SELECT * FROM versions WHERE branch_slug = ? ORDER BY version_number DESC LIMIT 1'
  ).get(req.params.slug)
  if (!latest) return reply.code(404).send({ error: 'No versions found' })

  return {
    slug: branch.slug,
    title: branch.title,
    versionId: latest.id,
    versionNumber: latest.version_number,
    createdAt: new Date(branch.created_at * 1000).toISOString(),
    screen: JSON.parse(latest.json_data),
  }
})

// ─── Versions ────────────────────────────────────────────────────────────────

app.get('/api/branches/:slug/versions', async (req, reply) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  const versions = db.prepare(
    'SELECT * FROM versions WHERE branch_slug = ? ORDER BY version_number ASC'
  ).all(req.params.slug)

  return versions.map(fmtVersion)
})

app.get('/api/branches/:slug/versions/:versionId', async (req, reply) => {
  const db = getDb()
  const version = db.prepare(
    'SELECT * FROM versions WHERE id = ? AND branch_slug = ?'
  ).get(parseInt(req.params.versionId), req.params.slug)
  if (!version) return reply.code(404).send({ error: 'Version not found' })

  return { ...fmtVersion(version), screen: JSON.parse(version.json_data) }
})

app.post('/api/branches/:slug/versions', async (req, reply) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  const contentType = req.headers['content-type'] || ''
  const body = contentType.includes('yaml')
    ? parseBody(req.body)
    : req.body

  if (!body || !body.meta) return reply.code(400).send({ error: 'Invalid screen: missing meta' })

  const maxRow = db.prepare(
    'SELECT MAX(version_number) as max FROM versions WHERE branch_slug = ?'
  ).get(req.params.slug)
  const newNum = (maxRow?.max ?? 0) + 1
  const now = Math.floor(Date.now() / 1000)

  const result = db.prepare(
    'INSERT INTO versions (branch_slug, version_number, json_data, created_at) VALUES (?, ?, ?, ?)'
  ).run(req.params.slug, newNum, JSON.stringify(body), now)

  if (body.meta?.title) {
    db.prepare('UPDATE branches SET title = ? WHERE slug = ?').run(body.meta.title, req.params.slug)
  }

  const version = {
    id: Number(result.lastInsertRowid),
    branchSlug: req.params.slug,
    versionNumber: newNum,
    createdAt: new Date(now * 1000).toISOString(),
  }

  wsBroadcast(req.params.slug, { type: 'version.created', payload: { version, screen: body } })

  reply.code(201).send(version)
})

// ─── Comments ────────────────────────────────────────────────────────────────

app.get('/api/branches/:slug/comments', async (req, reply) => {
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  const comments = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c
    LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.branch_slug = ?
    ORDER BY c.created_at ASC
  `).all(req.params.slug)

  return comments.map(fmtComment)
})

app.post('/api/branches/:slug/comments', async (req, reply) => {
  const { versionId, parentId, nodeId, x, y, text, author, role } = req.body

  if (!text?.trim()) return reply.code(400).send({ error: 'Comment text is required' })
  if (!versionId) return reply.code(400).send({ error: 'versionId is required' })
  if (!author?.trim()) return reply.code(400).send({ error: 'author is required' })

  const validRoles = ['designer', 'analyst', 'pm', 'frontend', 'backend', 'qa']
  const safeRole = validRoles.includes(role) ? role : 'designer'
  const now = Math.floor(Date.now() / 1000)

  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  const result = db.prepare(`
    INSERT INTO comments (parent_id, branch_slug, version_id, node_id, x, y, text, author, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    parentId ?? null,
    req.params.slug,
    versionId,
    nodeId ?? null,
    x ?? null,
    y ?? null,
    text.trim(),
    author.trim(),
    safeRole,
    now,
    now
  )

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(Number(result.lastInsertRowid))
  const formatted = fmtComment(comment)

  wsBroadcast(req.params.slug, { type: 'comment.created', payload: formatted })

  reply.code(201).send(formatted)
})

app.patch('/api/branches/:slug/comments/:id', async (req, reply) => {
  const { status, rejectReason, role } = req.body
  const validStatuses = ['open', 'resolved', 'rejected']

  if (!validStatuses.includes(status)) {
    return reply.code(400).send({ error: 'Invalid status' })
  }

  if (role !== 'designer') {
    return reply.code(403).send({ error: 'Only designer can resolve or reject comments' })
  }

  if (status === 'rejected' && !rejectReason?.trim()) {
    return reply.code(400).send({ error: 'rejectReason required when rejecting' })
  }

  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    'UPDATE comments SET status = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND branch_slug = ?'
  ).run(status, rejectReason?.trim() ?? null, now, parseInt(req.params.id), req.params.slug)

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(parseInt(req.params.id))

  if (!comment) return reply.code(404).send({ error: 'Comment not found' })
  const formatted = fmtComment(comment)

  wsBroadcast(req.params.slug, { type: 'comment.updated', payload: formatted })

  return formatted
})

app.delete('/api/branches/:slug/comments/:id', async (req, reply) => {
  const db = getDb()
  const result = db.prepare(
    'DELETE FROM comments WHERE id = ? AND branch_slug = ?'
  ).run(parseInt(req.params.id), req.params.slug)

  if (result.changes === 0) return reply.code(404).send({ error: 'Comment not found' })

  wsBroadcast(req.params.slug, { type: 'comment.deleted', payload: { id: parseInt(req.params.id) } })

  reply.code(204).send()
})

// ─── Shares ──────────────────────────────────────────────────────────────────

app.post('/api/branches/:slug/shares', async (req, reply) => {
  const { versionId, createdBy } = req.body
  if (!versionId) return reply.code(400).send({ error: 'versionId is required' })

  const db = getDb()
  const token = nanoid(12)
  const now = Math.floor(Date.now() / 1000)

  db.prepare(
    'INSERT INTO shares (token, branch_slug, version_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(token, req.params.slug, versionId, createdBy || 'designer', now)

  reply.code(201).send({ token, url: `/share/${token}` })
})

app.get('/api/shares/:token', async (req, reply) => {
  const db = getDb()
  const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(req.params.token)
  if (!share) return reply.code(404).send({ error: 'Share not found' })

  const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(share.version_id)
  if (!version) return reply.code(404).send({ error: 'Version not found' })

  const branch = db.prepare('SELECT * FROM branches WHERE slug = ?').get(share.branch_slug)

  return {
    token: share.token,
    branchSlug: share.branch_slug,
    versionId: share.version_id,
    createdBy: share.created_by,
    createdAt: new Date(share.created_at * 1000).toISOString(),
    screen: JSON.parse(version.json_data),
    title: branch?.title || 'Без названия',
  }
})

app.get('/api/shares/:token/comments', async (req, reply) => {
  const db = getDb()
  const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(req.params.token)
  if (!share) return reply.code(404).send({ error: 'Share not found' })

  const comments = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c
    LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.branch_slug = ? AND c.version_id = ?
    ORDER BY c.created_at ASC
  `).all(share.branch_slug, share.version_id)

  return comments.map(fmtComment)
})

app.post('/api/shares/:token/comments', async (req, reply) => {
  const { parentId, nodeId, x, y, text, author, role } = req.body

  if (!text?.trim()) return reply.code(400).send({ error: 'Comment text is required' })
  if (!author?.trim()) return reply.code(400).send({ error: 'author is required' })

  const validRoles = ['designer', 'analyst', 'pm', 'frontend', 'backend', 'qa']
  const safeRole = validRoles.includes(role) ? role : 'analyst'
  const now = Math.floor(Date.now() / 1000)

  const db = getDb()
  const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(req.params.token)
  if (!share) return reply.code(404).send({ error: 'Share not found' })

  const result = db.prepare(`
    INSERT INTO comments (parent_id, branch_slug, version_id, node_id, x, y, text, author, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    parentId ?? null,
    share.branch_slug,
    share.version_id,
    nodeId ?? null,
    x ?? null,
    y ?? null,
    text.trim(),
    author.trim(),
    safeRole,
    now,
    now
  )

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(Number(result.lastInsertRowid))
  const formatted = fmtComment(comment)

  wsBroadcast(share.branch_slug, { type: 'comment.created', payload: formatted })

  reply.code(201).send(formatted)
})

// ─── WebSocket ───────────────────────────────────────────────────────────────

app.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    let subscribedBranch = null

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (msg.type === 'subscribe' && msg.branch) {
        if (subscribedBranch) {
          const set = branchSubscribers.get(subscribedBranch)
          if (set) set.delete(socket)
        }
        subscribedBranch = msg.branch
        const set = branchSubscribers.get(subscribedBranch) || new Set()
        set.add(socket)
        branchSubscribers.set(subscribedBranch, set)
        socket.send(JSON.stringify({ type: 'subscribed', branch: subscribedBranch }))
      }
    })

    socket.on('close', () => {
      if (subscribedBranch) {
        const set = branchSubscribers.get(subscribedBranch)
        if (set) {
          set.delete(socket)
          if (set.size === 0) branchSubscribers.delete(subscribedBranch)
        }
      }
    })
  })
})

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  console.log(`SandBox backend running on ${address}`)
})
