// Shared Postgres connection for both server.js and lib/ops/routes.js.
// Replaces the file-I/O storage in data/*.json so the app can run on
// Vercel serverless (which has no persistent filesystem).
//
// Pattern:
//   const { query, pool } = require('./db.js'); // via import
//   const { rows } = await query('select * from pages');
//
// Connection notes:
//   - Uses Supabase's transaction-mode pooler (port 6543) so we can safely
//     keep max low (3) — each serverless invocation gets its own pool that
//     dies at process end, and pooled connections at Supabase multiplex
//     across many "logical" clients.
//   - Password may contain URL-special chars, so we parse the URL manually
//     rather than passing connectionString.
//   - Falls back to individual PG* env vars for docker-compose local dev.

import pg from 'pg';

let cachedPool = null;

function buildConfig() {
  const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (raw) {
    const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error('DATABASE URL not in expected postgres://user:pass@host:port/db shape');
    const [, user, password, host, port, database] = m;
    return { user, password, host, port: Number(port), database, ssl: { rejectUnauthorized: false }, max: 3 };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
    max: 3,
  };
}

export function getPool() {
  if (!cachedPool) {
    cachedPool = new pg.Pool(buildConfig());
    cachedPool.on('error', (err) => {
      console.error('[db] idle client error', err.message);
    });
  }
  return cachedPool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

// Convenience for single-row lookups.
export async function one(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}
