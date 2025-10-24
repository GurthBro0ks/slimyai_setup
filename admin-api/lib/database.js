/**
 * Database helper for Admin API (mysql2/promise).
 * Exports: pool, getPool(), query(sql, params), one(sql, params), tx(fn)
 */
const mysql = require('mysql2/promise');

function parseDbUrl(urlStr) {
  const u = new URL(urlStr);
  return {
    host: u.hostname || '127.0.0.1',
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username || 'root'),
    password: decodeURIComponent(u.password || ''),
    database: (u.pathname || '/').slice(1)
  };
}

const cfg = parseDbUrl(process.env.DB_URL || 'mysql://root@127.0.0.1:3306/slimy');

const pool = mysql.createPool({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
  connectionLimit: 10,
  waitForConnections: true,
  charset: 'utf8mb4_general_ci'
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows && rows[0] ? rows[0] : null;
}

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn({
      query: (s, p) => conn.query(s, p).then(([r]) => r),
      execute: (s, p) => conn.execute(s, p)
    });
    await conn.commit();
    return res;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, getPool: () => pool, query, one, tx };
