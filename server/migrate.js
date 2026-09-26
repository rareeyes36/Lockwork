'use strict';

/**
 * Applies ../migrations/*.sql in lexical order, once each.
 * Applied files are tracked in schema_migrations. A database that was
 * migrated by hand before this runner existed is baselined (001–019
 * marked applied) so only newer files run.
 *
 * Usage: node migrate.js   (also runs automatically on server boot)
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const DIR = path.join(__dirname, '..', 'migrations');
const BASELINE_LAST = '019_company_subteams.sql';

async function migrate({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    // One transaction + a transaction-scoped lock: safe behind poolers such as
    // Neon's (a session lock/unlock pair can land on different connections),
    // and concurrent cold starts simply wait, then find nothing to do.
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(4242001)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
    );

    if (done.size === 0) {
      const legacy = await client.query("SELECT to_regclass('public.teams') AS t");
      if (legacy.rows[0].t) {
        const baseline = files.filter((f) => f <= BASELINE_LAST);
        for (const f of baseline) {
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
          done.add(f);
        }
        log(`migrate: baselined ${baseline.length} pre-existing migrations`);
      }
    }

    let applied = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
      try {
        await client.query(sql);
      } catch (e) {
        e.message = `migration ${f} failed: ${e.message}`;
        throw e;
      }
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
      applied += 1;
      log(`migrate: applied ${f}`);
    }
    await client.query('COMMIT');
    if (!applied) log('migrate: up to date');
    return applied;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

module.exports = { migrate };
