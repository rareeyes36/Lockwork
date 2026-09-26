'use strict';

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// Vercel + Neon sets DATABASE_URL (older Vercel Postgres used POSTGRES_URL).
// Storage integrations may add a custom prefix (e.g. STORAGE_DATABASE_URL,
// lockwork_POSTGRES_URL) or only the libpq PG* variables, so accept those too.
const PREFERRED = ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'];
const isPgUrl = (v) => typeof v === 'string' && /^postgres(ql)?:\/\//i.test(v.trim());

function findDatabaseUrl(env) {
  for (const k of PREFERRED) if (isPgUrl(env[k])) return env[k].trim();
  const keys = Object.keys(env).filter((k) => isPgUrl(env[k]));
  // Prefer pooled "...DATABASE_URL"/"...POSTGRES_URL" names (case-insensitive), shortest first.
  const pick = (re) => keys.filter((k) => re.test(k)).sort((a, b) => a.length - b.length)[0];
  const key = pick(/(^|_)(DATABASE_URL|POSTGRES_URL)$/i) || pick(/(DATABASE|POSTGRES|NEON)/i);
  if (key) return env[key].trim();
  // Only libpq-style parts (PGHOST, PGUSER, ...): assemble a URL.
  if (env.PGHOST && env.PGUSER && env.PGPASSWORD) {
    const db = env.PGDATABASE || 'postgres';
    const port = env.PGPORT ? `:${env.PGPORT}` : '';
    return `postgresql://${encodeURIComponent(env.PGUSER)}:${encodeURIComponent(env.PGPASSWORD)}@${env.PGHOST}${port}/${db}`;
  }
  return null;
}

/** Names only (never values) of env vars that look database-related, for diagnostics. */
function databaseEnvNames(env) {
  return Object.keys(env).filter((k) => /(DATABASE|POSTGRES|NEON|^PG)/i.test(k)).sort();
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

module.exports = { pool, tx, HttpError, DATABASE_URL, FOUND_DATABASE_URL, findDatabaseUrl, databaseEnvNames };
