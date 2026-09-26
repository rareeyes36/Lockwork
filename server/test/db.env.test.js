'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findDatabaseUrl, databaseEnvNames } = require('../db');

const U = 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require';

test('standard names win in priority order', () => {
  assert.equal(findDatabaseUrl({ POSTGRES_URL: 'postgres://b', DATABASE_URL: U }), U);
  assert.equal(findDatabaseUrl({ DATABASE_URL_UNPOOLED: U }), U);
  assert.equal(findDatabaseUrl({ NEON_DATABASE_URL: U }), U);
});

test('custom and lowercase prefixes from Vercel storage integrations', () => {
  assert.equal(findDatabaseUrl({ STORAGE_DATABASE_URL: U, STORAGE_DATABASE_URL_UNPOOLED: 'postgres://x' }), U);
  assert.equal(findDatabaseUrl({ lockwork_POSTGRES_URL: U }), U);
  assert.equal(findDatabaseUrl({ neon_db_POSTGRES_PRISMA_URL: U }), U);
});

test('non-URL values are ignored; PG* parts are assembled', () => {
  assert.equal(findDatabaseUrl({ DATABASE_URL: 'not-a-url' }), null);
  assert.equal(
    findDatabaseUrl({ PGHOST: 'ep-x.neon.tech', PGUSER: 'u', PGPASSWORD: 'p@ss', PGDATABASE: 'neondb' }),
    'postgresql://u:p%40ss@ep-x.neon.tech/neondb'
  );
  assert.equal(findDatabaseUrl({}), null);
});

test('diagnostics list names only', () => {
  const names = databaseEnvNames({ DATABASE_URL: U, PGHOST: 'h', HOME: '/root', neon_API: 'k' });
  assert.deepEqual(names, ['DATABASE_URL', 'PGHOST', 'neon_API']);
});
