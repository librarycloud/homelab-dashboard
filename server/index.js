import crypto from 'node:crypto'
import 'dotenv/config'
import express from 'express'
import { pool, query } from './db.js'

const app = express()
const port = process.env.API_PORT || 3000
app.use(express.json())

function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD_HASH
  if (!expected) return false
  const [salt, saved] = expected.split(':')
  const actual = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(saved, 'hex'), Buffer.from(actual, 'hex'))
}

app.post('/api/auth/login', (req, res) => {
  if (req.body.username !== process.env.ADMIN_USERNAME || !verifyPassword(req.body.password)) return res.status(401).json({ message: '用户名或密码错误' })
  res.json({ ok: true })
})

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [summaryRows, services] = await Promise.all([
      query(`SELECT
        COUNT(*) AS services,
        SUM(status = 'running') AS running,
        SUM(version_status = 'update_available') AS updates,
        SUM(status = 'error') AS errors
        FROM services`),
      query(`SELECT id, name, description, category, status,
        github_url, lan_url, wan_url, local_path, version_type,
        local_version, remote_version, version_status,
        docker_enabled, docker_name, docker_image, docker_status,
        docker_health, docker_restart_count,
        frp_public_ip, frp_username, last_check_at
        FROM services ORDER BY favorite DESC, updated_at DESC`)
    ])
    res.json({ summary: summaryRows[0], services, lastSync: new Date().toISOString() })
  } catch (error) {
    console.error(error)
    res.status(503).json({ message: 'MariaDB 暂时不可用' })
  }
})

app.get('/api/services', async (_req, res) => {
  try {
    const services = await query(`SELECT id, name, description, category, status,
      github_url, lan_url, wan_url, local_path, version_type,
      local_version, remote_version, version_status,
      docker_enabled, docker_name, docker_image, docker_status,
      docker_health, docker_restart_count,
      frp_public_ip, frp_username, last_check_at
      FROM services ORDER BY favorite DESC, updated_at DESC`)
    res.json(services)
  } catch (error) {
    console.error(error)
    res.status(503).json({ message: 'MariaDB 暂时不可用' })
  }
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
  await pool.end()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
