import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import express from 'express'
import { pool, query } from './db.js'

const app = express()
const port = process.env.API_PORT || 3000
const sessionTtl = 24 * 60 * 60 * 1000
const sessions = new Map()
let adminPassword = process.env.ADMIN_PASSWORD
const githubApiBase = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '')
const githubTimeoutMs = Math.min(Math.max(Number(process.env.GITHUB_TIMEOUT_MS || 20000), 5000), 60000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../dist')
const execFileAsync = promisify(execFile)
const statusCheckTimeoutMs = 8000
app.use(express.json())

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]))
}

function setSessionCookie(res, token, maxAge = sessionTtl) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `homelab_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}`)
}

function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie).homelab_session
  const session = token && sessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token)
    return res.status(401).json({ message: '请先登录' })
  }
  req.user = session
  next()
}

const serviceColumns = `id, name, description, category, icon, status,
  sort_order,
  github_url, lan_url, wan_url, local_path, version_type,
  NULLIF(local_version, 'null') AS local_version, NULLIF(remote_version, 'null') AS remote_version, version_status,
  docker_enabled, docker_name, docker_image, docker_status,
  docker_health, docker_restart_count, docker_last_check_at, frp_username, frp_password,
  favorite, notes, last_check_at, created_at, updated_at`

const textFields = ['description', 'category', 'github_url', 'lan_url', 'wan_url', 'local_path', 'local_version', 'remote_version', 'docker_name', 'docker_image', 'docker_health', 'frp_username', 'frp_password', 'notes']
const serviceIcons = new Set(['Monitor', 'Platform', 'Avatar', 'UserFilled', 'DataAnalysis', 'DataBoard', 'PieChart', 'Odometer', 'Cpu', 'Connection', 'House', 'Grid', 'Folder', 'FolderOpened', 'Picture', 'Camera', 'Calendar', 'Lock', 'Key', 'User', 'Message', 'Bell', 'Headset', 'Link', 'Share', 'Document', 'CopyDocument', 'Files', 'Download', 'Upload', 'AlarmClock', 'Film', 'VideoCamera', 'VideoCameraFilled', 'ShoppingCart', 'Coin', 'Tools', 'Setting', 'Management', 'Tickets', 'Box', 'Wallet', 'ArrowDown', 'ArrowUp', 'Operation', 'VideoPlay', 'Goods', 'TrendCharts', 'CircleCheck', 'Warning', 'InfoFilled'])
const numericFields = {
  status: [0, 1, 2, 3, 4],
  version_type: [0, 1, 2, 3, 4, 5],
  version_status: [0, 1, 2, 3],
  docker_status: [0, 1, 2, 3, 4]
}

function servicePayload(body) {
  const payload = {}
  if (typeof body.name === 'string') payload.name = body.name.trim()
  if (body.icon !== undefined && serviceIcons.has(body.icon)) payload.icon = body.icon
  for (const field of textFields) if (body[field] !== undefined) payload[field] = String(body[field]).trim() || null
  for (const [field, allowed] of Object.entries(numericFields)) {
    const value = Number(body[field])
    if (body[field] !== undefined && Number.isInteger(value) && allowed.includes(value)) payload[field] = value
  }
  if (body.docker_enabled !== undefined) payload.docker_enabled = Boolean(body.docker_enabled)
  if (body.favorite !== undefined) payload.favorite = Boolean(body.favorite)
  if (body.sort_order !== undefined) {
    const order = Number(body.sort_order)
    if (Number.isInteger(order)) payload.sort_order = order
  }
  if (body.docker_restart_count !== undefined) {
    const count = Number(body.docker_restart_count)
    if (Number.isInteger(count) && count >= 0) payload.docker_restart_count = count
  }
  return payload
}

function sendDatabaseError(res, error) {
  console.error(error)
  const migrationErrors = ['ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'ER_DATA_TRUNCATED', 'WARN_DATA_TRUNCATED', 'ER_WRONG_VALUE']
  if (migrationErrors.includes(error.code)) {
    return res.status(409).json({
      code: 'DATABASE_MIGRATION_REQUIRED',
      message: '数据库状态字段仍是旧格式。请先执行 server/migrations/001_numeric_statuses.sql，然后重启服务。'
    })
  }
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({
      code: 'DATABASE_SCHEMA_MISSING',
      message: '未找到 services 数据表。请先执行 server/schema.sql 初始化数据库。'
    })
  }
  return res.status(503).json({
    code: 'DATABASE_UNAVAILABLE',
    message: '无法连接或写入数据库，请检查 DB_HOST、DB_NAME、DB_USER、DB_PASSWORD 和数据库服务状态。'
  })
}

function normalizeGithubRepository(githubUrl) {
  if (!githubUrl) return null
  try {
    const url = new URL(githubUrl.startsWith('http') ? githubUrl : `https://${githubUrl}`)
    if (url.hostname !== 'github.com') return null
    const [owner, repository] = url.pathname.split('/').filter(Boolean)
    return owner && repository ? `${owner}/${repository.replace(/\.git$/, '')}` : null
  } catch {
    return null
  }
}

function compareVersions(localVersion, remoteVersion) {
  if (!localVersion || !remoteVersion) return 0
  const local = parseVersion(localVersion)
  const remote = parseVersion(remoteVersion)
  if (!local || !remote) return 0
  if (local.base === remote.base && local.distance !== remote.distance) return local.distance > remote.distance ? 1 : 2
  if (local.numeric && remote.numeric) {
    const length = Math.max(local.numeric.length, remote.numeric.length)
    for (let index = 0; index < length; index += 1) {
      const difference = (local.numeric[index] || 0) - (remote.numeric[index] || 0)
      if (difference) return difference > 0 ? 1 : 2
    }
    if (local.prerelease !== remote.prerelease) return local.prerelease ? 2 : 1
    return 1
  }
  return local.base === remote.base ? 1 : 0
}

function parseVersion(value) {
  const raw = String(value).trim().replace(/^v/i, '')
  const gitDescribe = raw.match(/^(.*)-(\d+)-g[0-9a-f]+$/i)
  const base = (gitDescribe ? gitDescribe[1] : raw).split('+')[0]
  const numericPart = base.split('-', 1)[0]
  if (!/^\d+(?:\.\d+)*$/.test(numericPart)) return { base, distance: Number(gitDescribe?.[2] || 0), numeric: null, prerelease: '' }
  return { base, distance: Number(gitDescribe?.[2] || 0), numeric: numericPart.split('.').map(Number), prerelease: base.slice(numericPart.length + 1) }
}

async function githubJson(pathname) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${githubApiBase}${pathname}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homelab-dashboard' },
        signal: AbortSignal.timeout(githubTimeoutMs)
      })
      if (response.status === 404) throw new Error('未找到 GitHub 仓库或 Release')
      if (response.status === 403 || response.status === 429) throw new Error('GitHub API 请求受限，请稍后再试')
      if (!response.ok) throw new Error(`GitHub API 返回 HTTP ${response.status}`)
      return response.json()
    } catch (error) {
      lastError = error
      if (error.name !== 'TimeoutError' && error.name !== 'AbortError') throw error
    }
  }
  throw new Error(`连接 GitHub API 超时（${githubTimeoutMs / 1000} 秒，已重试一次）。请检查服务器网络、代理或 GITHUB_API_BASE 配置`)
}

function shortCommit(sha) {
  return String(sha || '').slice(0, 7) || null
}

async function githubDefaultBranch(repository) {
  const details = await githubJson(`/repos/${repository}`)
  if (!details?.default_branch) throw new Error('无法获取 GitHub 仓库默认分支')
  return details.default_branch
}

async function githubPackageVersion(repository, branch) {
  const file = await githubJson(`/repos/${repository}/contents/package.json?ref=${encodeURIComponent(branch)}`)
  if (!file?.content) throw new Error('GitHub 仓库根目录未找到 package.json')
  const packageJson = JSON.parse(Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8'))
  return packageJson.version || null
}

async function checkVersion(service) {
  const now = new Date()
  const update = { version_status: 0, last_check_at: now }
  let comparisonHandled = false

  if (service.version_type === 0) throw new Error('手动维护类型不支持自动检测')

  if (service.version_type === 1 || service.version_type === 2 || service.version_type === 5) {
    const repository = normalizeGithubRepository(service.github_url)
    if (!repository) throw new Error('GitHub 地址必须是 github.com/<组织或用户>/<仓库>')
    if (service.version_type === 1) {
      const tags = await githubJson(`/repos/${repository}/tags?per_page=1`)
      if (!Array.isArray(tags) || !tags[0]?.name) throw new Error('该 GitHub 仓库没有可用的 Git 标签，请改用 Git 提交或手动维护')
      update.remote_version = tags[0].name
    } else if (service.version_type === 5) {
      let localCommit = service.local_version
      if (service.local_path) {
        const { stdout } = await execFileAsync('git', ['-C', service.local_path, 'rev-parse', 'HEAD'], { timeout: 10000 })
        localCommit = stdout.trim() || null
        update.local_version = shortCommit(localCommit)
      }
      const branch = await githubDefaultBranch(repository)
      const remoteCommit = await githubJson(`/repos/${repository}/commits/${encodeURIComponent(branch)}`)
      if (!remoteCommit?.sha) throw new Error('无法获取 GitHub 默认分支的最新提交')
      update.remote_version = shortCommit(remoteCommit.sha)

      if (localCommit) {
        const comparison = await githubJson(`/repos/${repository}/compare/${encodeURIComponent(localCommit)}...${remoteCommit.sha}`)
        update.version_status = Number(comparison.ahead_by || 0) > 0 ? 2 : 1
        comparisonHandled = true
      }
    } else {
      const release = await githubJson(`/repos/${repository}/releases/latest`)
      if (!release?.tag_name) throw new Error('该 GitHub 仓库没有可用的 Release，请改用 Git 标签或手动维护')
      update.remote_version = release.tag_name
    }
  }

  if (service.version_type === 1 && service.local_path) {
    const { stdout } = await execFileAsync('git', ['-C', service.local_path, 'describe', '--tags', '--always'], { timeout: 10000 })
    update.local_version = stdout.trim() || null
  }

  if (service.version_type === 3) {
    if (!service.local_path) throw new Error('package.json 检测需要填写本地路径')
    const packagePath = path.join(service.local_path, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
    update.local_version = packageJson.version || null
    const repository = normalizeGithubRepository(service.github_url)
    if (repository) {
      update.remote_version = await githubPackageVersion(repository, await githubDefaultBranch(repository))
    } else {
      update.remote_version = null
    }
  }

  if (service.version_type === 4) {
    if (!service.docker_name) throw new Error('Docker 检测需要填写容器名称')
    const { stdout } = await execFileAsync('docker', ['inspect', service.docker_name, '--format', '{{json .State}}'], { timeout: 10000 })
    const state = JSON.parse(stdout)
    update.docker_status = state.Running ? 1 : state.Status === 'exited' ? 3 : state.Status === 'created' ? 2 : 4
    update.docker_health = state.Health?.Status || null
    update.docker_restart_count = Number(state.RestartCount || 0)
    update.docker_last_check_at = now
    if (service.docker_image) {
      const { stdout: image } = await execFileAsync('docker', ['image', 'inspect', service.docker_image, '--format', '{{join .RepoTags ","}}'], { timeout: 10000 })
      update.remote_version = image.trim() || null
    }
  }

  if (!comparisonHandled && (update.remote_version !== undefined || update.local_version !== undefined)) {
    update.version_status = compareVersions(update.local_version ?? service.local_version, update.remote_version ?? service.remote_version)
  }
  return update
}

function serviceUrl(value, defaultProtocol = 'http') {
  if (!value) return null
  try { return new URL(value.startsWith('http://') || value.startsWith('https://') ? value : `${defaultProtocol}://${value}`) } catch { return null }
}

async function probeUrl(value, defaultProtocol = 'http') {
  const url = serviceUrl(value, defaultProtocol)
  if (!url) return false
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(statusCheckTimeoutMs) })
    return response.status > 0 && response.status < 500
  } catch {
    return false
  }
}

async function refreshServiceStatus(service) {
  const now = new Date()
  const update = { last_check_at: now }
  if (service.docker_enabled && service.docker_name) {
    try {
      const { stdout } = await execFileAsync('docker', ['inspect', service.docker_name, '--format', '{{json .State}}'], { timeout: statusCheckTimeoutMs })
      const state = JSON.parse(stdout)
      update.docker_status = state.Running ? 1 : state.Status === 'exited' ? 3 : state.Status === 'created' ? 2 : 4
      update.docker_health = state.Health?.Status || null
      update.docker_restart_count = Number(state.RestartCount || 0)
      update.docker_last_check_at = now
      update.status = state.Running && (!state.Health || state.Health.Status !== 'unhealthy') ? 1 : state.Running ? 2 : 0
    } catch {
      update.docker_status = 3
      update.docker_last_check_at = now
      update.status = 3
    }
  } else if (service.lan_url || service.wan_url) {
    const reachable = await probeUrl(service.lan_url || service.wan_url, service.lan_url ? 'http' : 'https')
    update.status = reachable ? 1 : 0
  }
  return update
}

function verifyPassword(password) {
  if (!adminPassword || typeof password !== 'string') return false
  const expectedBuffer = Buffer.from(adminPassword)
  const actualBuffer = Buffer.from(password)
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

app.post('/api/auth/login', (req, res) => {
  if (!process.env.ADMIN_USERNAME || !adminPassword) {
    return res.status(503).json({ message: '管理员登录尚未配置，请设置 ADMIN_USERNAME 和 ADMIN_PASSWORD' })
  }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (username !== process.env.ADMIN_USERNAME || !password || !verifyPassword(password)) return res.status(401).json({ message: '用户名或密码错误' })
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { username, expiresAt: Date.now() + sessionTtl })
  setSessionCookie(res, token)
  res.json({ ok: true, user: { username } })
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ authenticated: true, user: { username: req.user.username } }))

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).homelab_session
  if (token) sessions.delete(token)
  setSessionCookie(res, '', 0)
  res.json({ ok: true })
})

app.post('/api/auth/password', requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (!verifyPassword(currentPassword)) return res.status(400).json({ message: '当前密码错误' })
  if (newPassword.length < 8) return res.status(400).json({ message: '新密码至少需要 8 位' })
  adminPassword = newPassword
  process.env.ADMIN_PASSWORD = adminPassword
  try {
    const envPath = path.resolve(__dirname, '../.env')
    const existing = await readFile(envPath, 'utf8').catch(() => '')
    const escapedPassword = adminPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const passwordLine = `ADMIN_PASSWORD="${escapedPassword}"`
    const next = existing.match(/^ADMIN_PASSWORD=.*$/m)
      ? existing.replace(/^ADMIN_PASSWORD=.*$/m, passwordLine)
      : `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${passwordLine}\n`
    await writeFile(envPath, next, 'utf8')
  } catch (error) {
    console.error('Unable to persist ADMIN_PASSWORD:', error.message)
  }
  res.json({ ok: true, message: '密码已更新' })
})

app.get('/api/system/info', requireAuth, async (_req, res) => {
  let database = 'offline'
  try { await query('SELECT 1 AS connected'); database = 'connected' } catch {}
  res.json({ appVersion: '0.1.0', nodeVersion: process.version, platform: process.platform, uptime: process.uptime(), database, apiPort: port })
})

app.get('/api/dashboard', requireAuth, async (_req, res) => {
  try {
    const [summaryRows, services] = await Promise.all([
      query(`SELECT
        COUNT(*) AS services,
        SUM(status = 1) AS running,
        SUM(version_status = 2) AS updates,
        SUM(status = 3) AS errors
        FROM services`),
      query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`)
    ])
    res.json({ summary: summaryRows[0], services, lastSync: new Date().toISOString() })
  } catch (error) {
    console.error(error)
    res.status(503).json({ message: 'MariaDB 暂时不可用' })
  }
})

app.get('/api/services', requireAuth, async (_req, res) => {
  try {
    const services = await query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`)
    res.json(services)
  } catch (error) {
    console.error(error)
    res.status(503).json({ message: 'MariaDB 暂时不可用' })
  }
})

app.post('/api/services/refresh', requireAuth, async (_req, res) => {
  try {
    const services = await query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`)
    for (const service of services) {
      const update = await refreshServiceStatus(service)
      const columns = Object.keys(update)
      if (columns.length) await query(`UPDATE services SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [...columns.map((column) => update[column]), service.id])
    }
    res.json(await query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`))
  } catch (error) {
    sendDatabaseError(res, error)
  }
})

app.post('/api/services', requireAuth, async (req, res) => {
  const service = servicePayload(req.body || {})
  if (!service.name) return res.status(400).json({ message: 'Service name is required' })

  try {
    const columns = Object.keys(service)
    const result = await query(
      `INSERT INTO services (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => service[column])
    )
    const rows = await query(`SELECT ${serviceColumns} FROM services WHERE id = ?`, [result.insertId])
    res.status(201).json(rows[0])
  } catch (error) {
    sendDatabaseError(res, error)
  }
})

app.put('/api/services/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  const service = servicePayload(req.body || {})
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid service ID' })
  if (service.name !== undefined && !service.name) return res.status(400).json({ message: 'Service name is required' })
  const columns = Object.keys(service)
  if (!columns.length) return res.status(400).json({ message: 'No valid fields provided' })

  try {
    const result = await query(
      `UPDATE services SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((column) => service[column]), id]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Service not found' })
    const rows = await query(`SELECT ${serviceColumns} FROM services WHERE id = ?`, [id])
    res.json(rows[0])
  } catch (error) {
    sendDatabaseError(res, error)
  }
})

app.post('/api/services/reorder', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : []
  if (
    !ids.length ||
    ids.some((id) => !Number.isInteger(id) || id < 1) ||
    new Set(ids).size !== ids.length
  ) return res.status(400).json({ message: 'Invalid service order' })

  let connection
  let transactionStarted = false
  try {
    connection = await pool.getConnection()
    const existingRows = await connection.query('SELECT id FROM services')
    const existingIds = new Set(existingRows.map((row) => Number(row.id)))
    if (existingIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) {
      return res.status(400).json({ message: 'Service order must include every service exactly once' })
    }

    await connection.beginTransaction()
    transactionStarted = true
    for (let index = 0; index < ids.length; index += 1) {
      await connection.query('UPDATE services SET sort_order = ? WHERE id = ?', [index, ids[index]])
    }
    await connection.commit()
    transactionStarted = false
    const services = await connection.query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`)
    res.json(services)
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {})
    sendDatabaseError(res, error)
  } finally {
    connection?.release()
  }
})

app.post('/api/services/:id/check-version', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid service ID' })

  try {
    const rows = await query(`SELECT ${serviceColumns} FROM services WHERE id = ?`, [id])
    const service = rows[0]
    if (!service) return res.status(404).json({ message: 'Service not found' })

    let update
    try {
      update = await checkVersion(service)
    } catch (error) {
      await query('UPDATE services SET version_status = 3, last_check_at = ? WHERE id = ?', [new Date(), id])
      return res.status(422).json({ message: `版本检测失败：${error.message}` })
    }

    const columns = Object.keys(update)
    await query(`UPDATE services SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [...columns.map((column) => update[column]), id])
    const updatedRows = await query(`SELECT ${serviceColumns} FROM services WHERE id = ?`, [id])
    res.json(updatedRows[0])
  } catch (error) {
    sendDatabaseError(res, error)
  }
})

app.delete('/api/services/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid service ID' })

  try {
    const result = await query('DELETE FROM services WHERE id = ?', [id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Service not found' })
    res.status(204).end()
  } catch (error) {
    sendDatabaseError(res, error)
  }
})

app.use(express.static(clientDist))
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))

const server = app.listen(port, async () => {
  try {
    await query('SELECT 1 AS connected')
    console.log(`HomeLab API listening on :${port}; MariaDB connected`)
  } catch (error) {
    console.error(`HomeLab API listening on :${port}; MariaDB connection failed`, error.message)
  }
})

async function shutdown() {
  await pool.end()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
