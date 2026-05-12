const fastify = require('fastify')
const cors = require('@fastify/cors')
const websocket = require('@fastify/websocket')
const fjwt = require('@fastify/jwt')
const bcrypt = require('bcrypt')
const { nanoid } = require('nanoid')
const yaml = require('js-yaml')
const { getDb } = require('./db')

const PORT = process.env.PORT || 3001

const app = fastify({ logger: true })

app.register(cors, { origin: true })
app.register(websocket)
app.register(fjwt, { secret: process.env.JWT_SECRET || 'skala-sandbox-secret-key-2026' })

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
    isLLM: !!c.is_llm,
    createdAt: new Date(c.created_at * 1000).toISOString(),
    updatedAt: c.updated_at ? new Date(c.updated_at * 1000).toISOString() : null,
  }
}

function fmtVersion(v) {
  return {
    id: v.id,
    branchSlug: v.branch_slug,
    versionNumber: v.version_number,
    name: v.name || '',
    isArchived: !!v.is_archived,
    createdAt: new Date(v.created_at * 1000).toISOString(),
  }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function fmtUser(u) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role,
    createdAt: new Date(u.created_at * 1000).toISOString(),
  }
}

async function authGuard(req, reply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

function roleGuard(...roles) {
  return async function (req, reply) {
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient role' })
    }
  }
}

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, reply) => {
  const { email, password, firstName, lastName } = req.body || {}
  if (!email?.trim() || !password?.trim()) {
    return reply.code(400).send({ error: 'email and password required' })
  }
  if (password.length < 6) {
    return reply.code(400).send({ error: 'password must be at least 6 characters' })
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (existing) {
    return reply.code(409).send({ error: 'Email already registered' })
  }

  const hash = bcrypt.hashSync(password, 10)
  const now = Math.floor(Date.now() / 1000)
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, first_name, last_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email.trim().toLowerCase(), hash, firstName?.trim() || '', lastName?.trim() || '', 'guest', now)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid))
  const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: '24h' })

  reply.code(201).send({ user: fmtUser(user), accessToken: token })
})

app.post('/api/auth/login', async (req, reply) => {
  const { email, password } = req.body || {}
  if (!email?.trim() || !password?.trim()) {
    return reply.code(400).send({ error: 'email and password required' })
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!user) return reply.code(401).send({ error: 'Invalid email or password' })

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) return reply.code(401).send({ error: 'Invalid email or password' })

  const token = app.jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
    { expiresIn: '24h' }
  )

  return { user: fmtUser(user), accessToken: token }
})

app.post('/api/auth/forgot', async (req, reply) => {
  const { email } = req.body || {}
  if (!email?.trim()) return reply.code(400).send({ error: 'email required' })

  const db = getDb()
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!user) return reply.code(200).send({ ok: true }) // don't reveal existence

  const token = nanoid(32)
  const expires = Math.floor(Date.now() / 1000) + 3600 // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(token, expires, user.id)

  console.log(`\n[FORGOT PASSWORD] Email: ${email.trim().toLowerCase()}`)
  console.log(`[RESET TOKEN] ${token}`)
  console.log(`[RESET URL] http://localhost:5175/reset-password/${token}\n`)

  reply.code(200).send({ ok: true, token })
})

app.post('/api/auth/reset', async (req, reply) => {
  const { token, password } = req.body || {}
  if (!token?.trim() || !password?.trim()) {
    return reply.code(400).send({ error: 'token and password required' })
  }
  if (password.length < 6) {
    return reply.code(400).send({ error: 'password must be at least 6 characters' })
  }

  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const user = db.prepare('SELECT id, reset_expires FROM users WHERE reset_token = ?').get(token)
  if (!user) return reply.code(400).send({ error: 'Invalid or expired token' })
  if (user.reset_expires < now) return reply.code(400).send({ error: 'Token expired' })

  const hash = bcrypt.hashSync(password, 10)
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(hash, user.id)

  return { ok: true }
})

app.get('/api/auth/me', { preHandler: [authGuard] }, async (req) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user) throw { statusCode: 404, message: 'User not found' }
  return fmtUser(user)
})

app.patch('/api/auth/me', { preHandler: [authGuard] }, async (req, reply) => {
  const { firstName, lastName } = req.body || {}
  const db = getDb()
  db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?')
    .run(firstName?.trim() || '', lastName?.trim() || '', req.user.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  return fmtUser(user)
})

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

app.post('/api/branches', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
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

// ─── Hierarchy ────────────────────────────────────────────────────────────────

app.get('/api/hierarchy', { preHandler: [authGuard] }, async (req) => {
  const db = getDb()
  const showArchived = req.query.showArchived === 'true'
  const archiveFilter = showArchived ? '' : 'AND b.is_archived = 0'

  const products = db.prepare(`
    SELECT b.* FROM branches b
    WHERE b.node_type = 'product' ${archiveFilter}
    ORDER BY b.created_at ASC
  `).all()

  const result = products.map(p => {
    const pages = db.prepare(`
      SELECT b.* FROM branches b
      WHERE b.node_type = 'page' AND b.parent_slug = ? ${archiveFilter}
      ORDER BY b.created_at ASC
    `).all(p.slug)

    return {
      slug: p.slug,
      title: p.title,
      nodeType: p.node_type,
      isArchived: !!p.is_archived,
      createdAt: new Date(p.created_at * 1000).toISOString(),
      pages: pages.map(pg => {
        const features = db.prepare(`
          SELECT b.*,
            (SELECT COUNT(*) FROM versions v WHERE v.branch_slug = b.slug AND v.is_archived = 0) as version_count,
            (SELECT MAX(v.version_number) FROM versions v WHERE v.branch_slug = b.slug AND v.is_archived = 0) as latest_version
          FROM branches b
          WHERE b.node_type = 'feature' AND b.parent_slug = ? ${archiveFilter}
          ORDER BY b.created_at ASC
        `).all(pg.slug)

        return {
          slug: pg.slug,
          title: pg.title,
          nodeType: pg.node_type,
          isArchived: !!pg.is_archived,
          createdAt: new Date(pg.created_at * 1000).toISOString(),
          features: features.map(f => {
            const versions = db.prepare(`
              SELECT v.* FROM versions v
              WHERE v.branch_slug = ? AND v.is_archived = 0
              ORDER BY v.version_number DESC
              LIMIT 10
            `).all(f.slug)

            return {
              slug: f.slug,
              title: f.title,
              nodeType: 'feature',
              isArchived: !!f.is_archived,
              versionCount: f.version_count,
              latestVersion: f.latest_version,
              createdAt: new Date(f.created_at * 1000).toISOString(),
              versions: versions.map(v => ({
                id: v.id,
                versionNumber: v.version_number,
                name: v.name || '',
                isArchived: !!v.is_archived,
                createdAt: new Date(v.created_at * 1000).toISOString(),
              })),
            }
          }),
        }
      }),
    }
  })

  return result
})

app.post('/api/products', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { title } = req.body || {}
  if (!title?.trim()) return reply.code(400).send({ error: 'title required' })
  const db = getDb()
  const slug = nanoid(8)
  const now = Math.floor(Date.now() / 1000)
  db.prepare("INSERT INTO branches (slug, title, node_type, parent_slug, created_by, created_at) VALUES (?, ?, 'product', NULL, ?, ?)")
    .run(slug, title.trim(), req.user.email, now)
  reply.code(201).send({ slug, title: title.trim(), nodeType: 'product', createdAt: new Date(now * 1000).toISOString() })
})

app.post('/api/pages', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { title, parentSlug } = req.body || {}
  if (!title?.trim() || !parentSlug?.trim()) return reply.code(400).send({ error: 'title and parentSlug required' })
  const db = getDb()
  const parent = db.prepare("SELECT slug FROM branches WHERE slug = ? AND node_type = 'product'").get(parentSlug)
  if (!parent) return reply.code(404).send({ error: 'Parent product not found' })
  const slug = nanoid(8)
  const now = Math.floor(Date.now() / 1000)
  db.prepare("INSERT INTO branches (slug, title, node_type, parent_slug, created_by, created_at) VALUES (?, ?, 'page', ?, ?, ?)")
    .run(slug, title.trim(), parentSlug, req.user.email, now)
  reply.code(201).send({ slug, title: title.trim(), parentSlug, nodeType: 'page', createdAt: new Date(now * 1000).toISOString() })
})

app.post('/api/features', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { title, parentSlug } = req.body || {}
  if (!title?.trim() || !parentSlug?.trim()) return reply.code(400).send({ error: 'title and parentSlug required' })
  const db = getDb()
  const parent = db.prepare("SELECT slug FROM branches WHERE slug = ? AND node_type = 'page'").get(parentSlug)
  if (!parent) return reply.code(404).send({ error: 'Parent page not found' })
  const slug = nanoid(8)
  const now = Math.floor(Date.now() / 1000)
  db.prepare("INSERT INTO branches (slug, title, node_type, parent_slug, created_by, created_at) VALUES (?, ?, 'feature', ?, ?, ?)")
    .run(slug, title.trim(), parentSlug, req.user.email, now)
  reply.code(201).send({ slug, title: title.trim(), parentSlug, nodeType: 'feature', createdAt: new Date(now * 1000).toISOString() })
})

app.patch('/api/branches/:slug', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { title, isArchived } = req.body || {}
  const db = getDb()
  const branch = db.prepare('SELECT slug FROM branches WHERE slug = ?').get(req.params.slug)
  if (!branch) return reply.code(404).send({ error: 'Branch not found' })

  if (title !== undefined) {
    db.prepare('UPDATE branches SET title = ? WHERE slug = ?').run(title.trim(), req.params.slug)
  }
  if (isArchived !== undefined) {
    db.prepare('UPDATE branches SET is_archived = ? WHERE slug = ?').run(isArchived ? 1 : 0, req.params.slug)
  }
  const updated = db.prepare('SELECT * FROM branches WHERE slug = ?').get(req.params.slug)
  return {
    slug: updated.slug,
    title: updated.title,
    nodeType: updated.node_type,
    isArchived: !!updated.is_archived,
    parentSlug: updated.parent_slug,
    createdAt: new Date(updated.created_at * 1000).toISOString(),
  }
})

app.delete('/api/branches/:slug', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const db = getDb()
  const result = db.prepare('DELETE FROM branches WHERE slug = ?').run(req.params.slug)
  if (result.changes === 0) return reply.code(404).send({ error: 'Branch not found' })
  reply.code(204).send()
})

app.patch('/api/versions/:id', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { isArchived } = req.body || {}
  if (isArchived === undefined) return reply.code(400).send({ error: 'isArchived required' })
  const db = getDb()
  const result = db.prepare('UPDATE versions SET is_archived = ? WHERE id = ?').run(isArchived ? 1 : 0, parseInt(req.params.id))
  if (result.changes === 0) return reply.code(404).send({ error: 'Version not found' })
  return { id: parseInt(req.params.id), isArchived: !!isArchived }
})

app.put('/api/versions/:id/name', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { name } = req.body || {}
  if (typeof name !== 'string') return reply.code(400).send({ error: 'name (string) required' })
  const db = getDb()
  const result = db.prepare('UPDATE versions SET name = ? WHERE id = ?').run(name, parseInt(req.params.id))
  if (result.changes === 0) return reply.code(404).send({ error: 'Version not found' })
  return { id: parseInt(req.params.id), name }
})

app.put('/api/versions/:id/data', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const db = getDb()
  const contentType = req.headers['content-type'] || ''
  const body = contentType.includes('yaml')
    ? parseBody(req.body)
    : req.body

  if (!body || !body.meta) return reply.code(400).send({ error: 'Invalid screen: missing meta' })

  const result = db.prepare('UPDATE versions SET json_data = ? WHERE id = ?').run(JSON.stringify(body), parseInt(req.params.id))
  if (result.changes === 0) return reply.code(404).send({ error: 'Version not found' })
  const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(parseInt(req.params.id))
  if (version) {
    wsBroadcast(version.branch_slug, { type: 'version.updated', payload: { version: fmtVersion(version), screen: body } })
  }
  return reply.code(204).send()
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

app.post('/api/branches/:slug/versions', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
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

app.post('/api/branches/:slug/comments', { preHandler: [authGuard, roleGuard('designer','pm','analyst','frontend','backend')] }, async (req, reply) => {
  const { versionId, parentId, nodeId, x, y, text } = req.body

  if (!text?.trim()) return reply.code(400).send({ error: 'Comment text is required' })
  if (!versionId) return reply.code(400).send({ error: 'versionId is required' })

  const author = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ')
  if (!author.trim()) return reply.code(400).send({ error: 'User has no name set' })

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
    req.user.role,
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

app.patch('/api/branches/:slug/comments/:id', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { status, rejectReason } = req.body
  const validStatuses = ['open', 'resolved', 'rejected']

  if (!validStatuses.includes(status)) {
    return reply.code(400).send({ error: 'Invalid status' })
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

app.patch('/api/branches/:slug/comments/:id/llm', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const { isLlm } = req.body || {}
  if (typeof isLlm !== 'boolean') return reply.code(400).send({ error: 'isLlm (boolean) required' })

  const db = getDb()
  const result = db.prepare('UPDATE comments SET is_llm = ? WHERE id = ? AND branch_slug = ?')
    .run(isLlm ? 1 : 0, parseInt(req.params.id), req.params.slug)
  if (result.changes === 0) return reply.code(404).send({ error: 'Comment not found' })

  const comment = db.prepare(`
    SELECT c.*, v.version_number
    FROM comments c LEFT JOIN versions v ON c.version_id = v.id
    WHERE c.id = ?
  `).get(parseInt(req.params.id))

  const formatted = fmtComment(comment)
  wsBroadcast(req.params.slug, { type: 'comment.updated', payload: formatted })
  return formatted
})

app.delete('/api/branches/:slug/comments/:id', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
  const db = getDb()
  const result = db.prepare(
    'DELETE FROM comments WHERE id = ? AND branch_slug = ?'
  ).run(parseInt(req.params.id), req.params.slug)

  if (result.changes === 0) return reply.code(404).send({ error: 'Comment not found' })

  wsBroadcast(req.params.slug, { type: 'comment.deleted', payload: { id: parseInt(req.params.id) } })

  reply.code(204).send()
})

// ─── Shares ──────────────────────────────────────────────────────────────────

app.post('/api/branches/:slug/shares', { preHandler: [authGuard, roleGuard('designer')] }, async (req, reply) => {
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
