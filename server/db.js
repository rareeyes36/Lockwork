'use strict';

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// Vercel + Neon sets DATABASE_URL (older Vercel Postgres used POSTGRES_URL).
// Vercel's storage integrations can add a custom prefix (e.g. STORAGE_DATABASE_URL),
// so fall back to any *DATABASE_URL / *POSTGRES_URL that holds a postgres:// URL.
function findDatabaseUrl(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const key = Object.keys(env)
    .filter((k) => /(^|_)(DATABASE_URL|POSTGRES_URL)$/.test(k) && /^postgres(ql)?:\/\//.test(env[k]))
    .sort((a, b) => a.length - b.length)[0];
  return key ? env[key] : null;
}
const FOUND_DATABASE_URL = findDatabaseUrl(process.env);
const DATABASE_URL = FOUND_DATABASE_URL || 'postgresql://contest:contest_local_dev@127.0.0.1:5432/contest_os';

// External hosted Postgres (Render external URL, Neon, …) needs TLS. Local dev
// and private-network hosts (Render's internal URL uses a dotless hostname) don't.
// PGSSLMODE=require / disable overrides the guess.
function sslFor(url) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (process.env.PGSSLMODE === 'require') return { rejectUnauthorized: false };
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host) || !host.includes('.');
  return local ? false : { rejectUnauthorized: false };
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslFor(DATABASE_URL) });

/** Run fn(client) inside BEGIN/COMMIT; rolls back on throw. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Error with an HTTP status, rendered by the error handler. */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}

module.exports = { pool, tx, HttpError, DATABASE_URL, FOUND_DATABASE_URL, findDatabaseUrl };
