'use strict';

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// Vercel + Neon sets DATABASE_URL (older Vercel Postgres used POSTGRES_URL).
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://contest:contest_local_dev@127.0.0.1:5432/contest_os';

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

module.exports = { pool, tx, HttpError, DATABASE_URL };
