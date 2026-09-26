'use strict';

const path = require('path');
const express = require('express');
const { pool, DATABASE_URL } = require('./db');
const { errorHandler } = require('./lib');

const PORT = Number(process.env.PORT || 3847);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use('/api', require('./routes/people'));
app.use('/api', require('./routes/companies'));
app.use('/api', require('./routes/jobs'));
app.use('/api', require('./routes/org'));
app.use('/api', require('./routes/market'));
app.use('/api', require('./routes/meta'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
app.use(errorHandler);

async function boot() {
  const { migrate } = require('./migrate');
  await migrate();
  // First boot on an empty database: load the demo company so every screen has data.
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM workspaces');
  if (rows[0].n === 0 && process.env.AUTO_SEED !== 'off') {
    const { seed } = require('./seed');
    await seed({ reset: false });
    console.log('seeded demo company');
  }
  app.listen(PORT, () => {
    console.log(`Lockwork listening on http://127.0.0.1:${PORT}`);
    console.log(`DATABASE_URL host: ${new URL(DATABASE_URL).host}`);
  });
}

if (require.main === module) {
  boot().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { app, pool };
