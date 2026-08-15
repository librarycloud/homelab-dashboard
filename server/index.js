import crypto from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { pool, query } from './db.js'
import { checkVersion, refreshServiceStatus } from './serviceChecks.js'

const app = express()
const port = process.env.API_PORT || 3000
const defaultSessionTtlHours = 24
const sessions = new Map()
let adminPassword = process.env.ADMIN_PASSWORD
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../dist')
const clientIndexPath = path.join(clientDist, 'index.html')

function trustProxySetting(value = 'loopback,linklocal,uniquelocal') {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (entries.some((entry) => ['true', '*'].includes(entry.toLowerCase()))) {
    console.warn('TRUST_PROXY cannot trust every address; using safe local-network defaults')
    return ['loopback', 'linklocal', 'uniquelocal']
  }
  if (entries.length === 1 && ['false', 'off', '0'].includes(entries[0].toLowerCase())) return false
  return entries
}

app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY))
app.use(express.json())

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]))
}

function setSessionCookie(res, token, maxAge = defaultSessionTtlHours * 60 * 60 * 1000) {
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
const settingKeys = ['site_name', 'site_subtitle', 'primary_color', 'checking_enabled', 'check_interval', 'version_checking_enabled', 'version_check_interval', 'session_ttl_hours', 'notifications', 'service_categories']
const defaultSettings = Object.freeze({
  siteName: 'HomeLab',
  siteSubtitle: 'CONTROL CENTER',
  primaryColor: '#42d3b2',
  checking: true,
  checkInterval: '30',
  versionChecking: true,
  versionCheckInterval: '60',
  sessionTtlHours: defaultSessionTtlHours,
  notifications: { error: true, update: true, docker: false },
  categories: ['监控', '存储', '媒体', '开发', '网络', '安全']
})

function cloneDefaultSettings() {
  return { ...defaultSettings, notifications: { ...defaultSettings.notifications }, categories: [...defaultSettings.categories] }
}

function normalizeSettingText(value, fallback) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  return text || fallback
}

function normalizePrimaryColor(value) {
  const color = String(value ?? '').trim()
  return /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : defaultSettings.primaryColor
}

function normalizeCategories(value) {
  if (!Array.isArray(value)) return [...defaultSettings.categories]
  return [...new Set(value.map((item) => String(item ?? '').trim().slice(0, 50)).filter(Boolean))].slice(0, 50)
}

function normalizeSettings(value = {}) {
  const notifications = value.notifications && typeof value.notifications === 'object' ? value.notifications : {}
  return {
    siteName: normalizeSettingText(value.siteName, defaultSettings.siteName),
    siteSubtitle: normalizeSettingText(value.siteSubtitle, defaultSettings.siteSubtitle),
    primaryColor: normalizePrimaryColor(value.primaryColor),
    checking: typeof value.checking === 'boolean' ? value.checking : defaultSettings.checking,
    checkInterval: ['15', '30', '60'].includes(String(value.checkInterval)) ? String(value.checkInterval) : defaultSettings.checkInterval,
    versionChecking: typeof value.versionChecking === 'boolean' ? value.versionChecking : defaultSettings.versionChecking,
    versionCheckInterval: ['30', '60', '180'].includes(String(value.versionCheckInterval)) ? String(value.versionCheckInterval) : defaultSettings.versionCheckInterval,
    sessionTtlHours: Number.isInteger(Number(value.sessionTtlHours)) && Number(value.sessionTtlHours) >= 1 && Number(value.sessionTtlHours) <= 720 ? Number(value.sessionTtlHours) : defaultSettings.sessionTtlHours,
    notifications: {
      error: typeof notifications.error === 'boolean' ? notifications.error : defaultSettings.notifications.error,
      update: typeof notifications.update === 'boolean' ? notifications.update : defaultSettings.notifications.update,
      docker: typeof notifications.docker === 'boolean' ? notifications.docker : defaultSettings.notifications.docker
    },
    categories: normalizeCategories(value.categories)
  }
}

function parseSettingValue(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

async function readSettings() {
  const rows = await query(`SELECT setting_key, setting_value FROM \`settings\` WHERE setting_key IN (${settingKeys.map(() => '?').join(', ')})`, settingKeys)
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, parseSettingValue(row.setting_value, undefined)]))
  return normalizeSettings({
    siteName: values.site_name,
    siteSubtitle: values.site_subtitle,
    primaryColor: values.primary_color,
    checking: values.checking_enabled,
    checkInterval: values.check_interval,
    versionChecking: values.version_checking_enabled,
    versionCheckInterval: values.version_check_interval,
    sessionTtlHours: values.session_ttl_hours,
    notifications: values.notifications,
    categories: values.service_categories
  })
}

function settingsPayload(body, current) {
  const next = cloneDefaultSettings()
  Object.assign(next, current)
  if (body.siteName !== undefined) next.siteName = body.siteName
  if (body.siteSubtitle !== undefined) next.siteSubtitle = body.siteSubtitle
  if (body.primaryColor !== undefined) next.primaryColor = body.primaryColor
  if (body.checking !== undefined) next.checking = body.checking
  if (body.checkInterval !== undefined) next.checkInterval = body.checkInterval
  if (body.versionChecking !== undefined) next.versionChecking = body.versionChecking
  if (body.versionCheckInterval !== undefined) next.versionCheckInterval = body.versionCheckInterval
  if (body.sessionTtlHours !== undefined) next.sessionTtlHours = body.sessionTtlHours
  if (body.notifications !== undefined) next.notifications = { ...current.notifications, ...body.notifications }
  if (body.categories !== undefined) next.categories = body.categories
  return normalizeSettings(next)
}

async function writeSettings(settings) {
  const values = [
    ['site_name', settings.siteName],
    ['site_subtitle', settings.siteSubtitle],
    ['primary_color', settings.primaryColor],
    ['checking_enabled', settings.checking],
    ['check_interval', settings.checkInterval],
    ['version_checking_enabled', settings.versionChecking],
    ['version_check_interval', settings.versionCheckInterval],
    ['session_ttl_hours', settings.sessionTtlHours],
    ['notifications', settings.notifications],
    ['service_categories', settings.categories]
  ]
  await query(
    `INSERT INTO \`settings\` (setting_key, setting_value) VALUES ${values.map(() => '(?, ?)').join(', ')} ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    values.flatMap(([key, value]) => [key, JSON.stringify(value)])
  )
}

let scheduledVersionCheckRunning = false
let lastScheduledVersionCheckAt = 0

async function runScheduledVersionCheck() {
  if (scheduledVersionCheckRunning) return
  try {
    const settings = await readSettings()
    if (!settings.versionChecking) return
    const intervalMs = Number(settings.versionCheckInterval) * 60 * 1000
    if (Date.now() - lastScheduledVersionCheckAt < intervalMs) return
    lastScheduledVersionCheckAt = Date.now()
    scheduledVersionCheckRunning = true
    const services = await query(`SELECT ${serviceColumns} FROM services ORDER BY sort_order ASC, favorite DESC, updated_at DESC`)
    for (const service of services) {
      if (service.version_type === 0) continue
      try {
        const update = await checkVersion(service)
        const columns = Object.keys(update)
        if (columns.length) await query(`UPDATE services SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [...columns.map((column) => update[column]), service.id])
      } catch (error) {
        await query('UPDATE services SET version_status = 3, last_check_at = ? WHERE id = ?', [new Date(), service.id]).catch(() => {})
        console.warn(`Scheduled version check failed for service ${service.id}:`, error.message)
      }
    }
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') console.error('Scheduled version check unavailable:', error.message)
  } finally {
    scheduledVersionCheckRunning = false
  }
}

const versionCheckTimer = setInterval(() => { void runScheduledVersionCheck() }, 60 * 1000)
versionCheckTimer.unref?.()

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

function verifyPassword(password) {
  if (!adminPassword || typeof password !== 'string') return false
  const expectedBuffer = Buffer.from(adminPassword)
  const actualBuffer = Buffer.from(password)
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeIp(address = '') {
  return String(address).replace(/^::ffff:/, '').slice(0, 45)
}

function loginRequestDetails(req) {
  const remoteAddress = normalizeIp(req.socket?.remoteAddress)
  const trustedChain = [...(req.ips || []).map(normalizeIp), remoteAddress].filter(Boolean)
  return {
    ipAddress: normalizeIp(req.ip || remoteAddress) || 'unknown',
    remoteAddress: remoteAddress || null,
    proxyChain: trustedChain.length > 1 ? trustedChain.join(', ').slice(0, 1000) : null,
    userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 500) : null
  }
}

async function recordLoginAttempt(req, { username, success, failureReason = null }) {
  const details = loginRequestDetails(req)
  try {
    await query(
      `INSERT INTO login_audit_logs
        (username, success, failure_reason, ip_address, remote_address, proxy_chain, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(username || '').slice(0, 100), success, failureReason, details.ipAddress, details.remoteAddress, details.proxyChain, details.userAgent]
    )
  } catch (error) {
    console.error('Unable to record login audit event:', error.message)
  }
}

const loginLimiter = rateLimit({
  windowMs: positiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    if (req.rateLimit?.used === req.rateLimit?.limit + 1) {
      void recordLoginAttempt(req, { username, success: false, failureReason: 'rate_limited' })
    }
    res.status(429).json({ message: '登录尝试过于频繁，请稍后再试' })
  }
})

const passwordChangeLimiter = rateLimit({
  windowMs: positiveInteger(process.env.PASSWORD_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: positiveInteger(process.env.PASSWORD_RATE_LIMIT_MAX, 5),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: '密码修改请求过于频繁，请稍后再试' }
})

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  if (!process.env.ADMIN_USERNAME || !adminPassword) {
    void recordLoginAttempt(req, { username, success: false, failureReason: 'auth_not_configured' })
    return res.status(503).json({ message: '管理员登录尚未配置，请设置 ADMIN_USERNAME 和 ADMIN_PASSWORD' })
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (username !== process.env.ADMIN_USERNAME || !password || !verifyPassword(password)) {
    void recordLoginAttempt(req, { username, success: false, failureReason: 'invalid_credentials' })
    return res.status(401).json({ message: '用户名或密码错误' })
  }
  const token = crypto.randomBytes(32).toString('hex')
  let sessionTtlHours = defaultSessionTtlHours
  try {
    sessionTtlHours = (await readSettings()).sessionTtlHours
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') console.error('Unable to read session settings:', error.message)
  }
  const sessionTtl = sessionTtlHours * 60 * 60 * 1000
  sessions.set(token, { username, expiresAt: Date.now() + sessionTtl })
  setSessionCookie(res, token, sessionTtl)
  void recordLoginAttempt(req, { username, success: true })
  res.json({ ok: true, user: { username } })
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ authenticated: true, user: { username: req.user.username } }))

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).homelab_session
  if (token) sessions.delete(token)
  setSessionCookie(res, '', 0)
  res.json({ ok: true })
})

app.get('/api/settings', async (_req, res) => {
  try {
    res.json(await readSettings())
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: '设置表尚未创建，请执行 server/migrations/005_app_settings.sql' })
    }
    sendDatabaseError(res, error)
  }
})

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = settingsPayload(req.body || {}, await readSettings())
    await writeSettings(settings)
    res.json(settings)
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: '设置表尚未创建，请执行 server/migrations/005_app_settings.sql' })
    }
    sendDatabaseError(res, error)
  }
})

app.post('/api/auth/password', passwordChangeLimiter, requireAuth, async (req, res) => {
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

app.get('/api/system/login-audit', requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit)
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10) : 10
  try {
    const rows = await query(`SELECT id, username, success,
      failure_reason AS failureReason,
      ip_address AS ipAddress,
      remote_address AS remoteAddress,
      proxy_chain AS proxyChain,
      user_agent AS userAgent,
      created_at AS createdAt
      FROM login_audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`)
    res.json(rows.map((row) => ({ ...row, id: String(row.id), success: Boolean(row.success) })))
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: '登录日志表尚未创建，请执行 server/migrations/004_login_audit_logs.sql' })
    }
    sendDatabaseError(res, error)
  }
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
app.get('*', (_req, res, next) => {
  res.sendFile(clientIndexPath, (error) => {
    if (!error) return
    if (error.code === 'ENOENT') return res.status(404).send('Dashboard client is not built')
    next(error)
  })
})

const server = app.listen(port, async () => {
  try {
    await query('SELECT 1 AS connected')
    console.log(`HomeLab API listening on :${port}; MariaDB connected`)
  } catch (error) {
    console.error(`HomeLab API listening on :${port}; MariaDB connection failed`, error.message)
  }
})

async function shutdown() {
  clearInterval(versionCheckTimer)
  await pool.end()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
