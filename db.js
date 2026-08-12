import mariadb from 'mariadb'

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missing = required.filter((key) => process.env[key] === undefined)

if (missing.length) {
  throw new Error(`Missing database environment variables: ${missing.join(', ')}`)
}

export const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  acquireTimeout: 10000,
  idleTimeout: 600
})

export async function query(sql, values = []) {
  let connection
  try {
    connection = await pool.getConnection()
    return await connection.query(sql, values)
  } finally {
    connection?.release()
  }
}
