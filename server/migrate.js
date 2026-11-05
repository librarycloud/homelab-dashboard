import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, 'migrations')

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']

export async function runMigrations({ silent = false } = {}) {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    if (!silent) {
      console.warn(`[Migrate] 数据库未配置，缺少环境变量: ${missing.join(', ')}，跳过迁移。`)
    }
    return { skipped: true, missing }
  }

  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    connectTimeout: 10000
  })

  try {
    // 1. Ensure migrations tracking table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // 2. Fetch applied migrations
    const appliedRows = await conn.query('SELECT name FROM schema_migrations')
    const appliedSet = new Set(appliedRows.map((r) => r.name))

    // 3. Read migration files sorted
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

    let appliedCount = 0

    for (const file of files) {
      if (appliedSet.has(file)) continue

      const filePath = path.join(migrationsDir, file)
      const sql = await readFile(filePath, 'utf8')

      // Check if legacy ALTER TABLE migrations are already reflected in the schema
      let alreadySatisfied = false

      if (file.startsWith('001_')) {
        const colRows = await conn.query(
          `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services' AND COLUMN_NAME = 'status'`,
          [process.env.DB_NAME]
        )
        if (colRows.length > 0 && String(colRows[0].DATA_TYPE).toLowerCase() === 'tinyint') {
          alreadySatisfied = true
        }
      } else if (file.startsWith('002_')) {
        const colRows = await conn.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services' AND COLUMN_NAME = 'icon'`,
          [process.env.DB_NAME]
        )
        if (colRows.length > 0) alreadySatisfied = true
      } else if (file.startsWith('003_')) {
        const colRows = await conn.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services' AND COLUMN_NAME = 'sort_order'`,
          [process.env.DB_NAME]
        )
        if (colRows.length > 0) alreadySatisfied = true
      } else if (file.startsWith('008_')) {
        const colRows = await conn.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'reminders' AND COLUMN_NAME = 'start_month'`,
          [process.env.DB_NAME]
        )
        if (colRows.length > 0) alreadySatisfied = true
      } else if (file.startsWith('009_')) {
        const tblRows = await conn.query(
          `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notification_logs'`,
          [process.env.DB_NAME]
        )
        if (tblRows.length > 0) alreadySatisfied = true
      } else if (file.startsWith('010_')) {
        const colRows = await conn.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'reminders' AND COLUMN_NAME = 'last_completed_cycle'`,
          [process.env.DB_NAME]
        )
        if (colRows.length > 0) alreadySatisfied = true
      }

      if (!alreadySatisfied) {
        if (!silent) console.log(`[Migrate] 正在执行迁移: ${file}...`)
        await conn.query(sql)
      } else {
        if (!silent) console.log(`[Migrate] 字段已存在，跳过执行直接登记: ${file}`)
      }

      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
      appliedCount++
    }

    if (!silent) {
      if (appliedCount > 0) {
        console.log(`[Migrate] 迁移完成，共成功应用 ${appliedCount} 个迁移文件。`)
      } else {
        console.log('[Migrate] 数据库结构已是最新，无需执行迁移。')
      }
    }

    return { success: true, appliedCount }
  } finally {
    await conn.end().catch(() => {})
  }
}

// If executed directly from command line: node server/migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] 迁移失败:', err)
      process.exit(1)
    })
}
