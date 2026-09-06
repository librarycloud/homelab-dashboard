import mariadb from 'mariadb'

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
export const missingDbEnv = required.filter((key) => process.env[key] === undefined)
export const isDbConfigured = missingDbEnv.length === 0

export const pool = isDbConfigured
  ? mariadb.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
      acquireTimeout: 10000,
      idleTimeout: 600
    })
  : null

export async function query(sql, values = []) {
  if (!isDbConfigured || !pool) {
    const error = new Error(`数据库未配置，缺少环境变量: ${missingDbEnv.join(', ')}`)
    error.code = 'DATABASE_NOT_CONFIGURED'
    throw error
  }
  let connection
  try {
    connection = await pool.getConnection()
    return await connection.query(sql, values)
  } finally {
    connection?.release()
  }
}
