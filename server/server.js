'use strict';

const path = require('path');
const express = require('express');
const { pool, DATABASE_URL } = require('./db');
const { errorHandler } = require('./lib');

const PORT = Number(process.env.PORT || 3847);

const app = express();
app.use(express.json());

const feedRoutes = require('./routes/feed');

// Public social shell pages (Excel-grid). /feed also works via static+extensions;
// /u/:handle needs an explicit route.
app.get('/feed', feedRoutes.sendFeedPage);
app.get('/u/:handle', feedRoutes.sendProfilePage);

// On Vercel the CDN serves public/ and this line is ignored; locally and on Render it serves the SPA.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use('/api', require('./routes/people'));
app.use('/api', require('./routes/companies'));
app.use('/api', require('./routes/jobs'));
app.use('/api', require('./routes/org'));
app.use('/api', require('./routes/market'));
app.use('/api', require('./routes/meta'));
app.use('/api', feedRoutes.router);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
app.use(errorHandler);

let readyPromise = null;

/**
 * Migrate, then load the demo company on an empty database. Memoized per
 * process (serverless instances call it on their first request); a failure
 * clears the memo so the next request retries.
 */
function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { migrate } = require('./migrate');
      await migrate();
      if (process.env.AUTO_SEED === 'off') return;
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM workspaces');
      if (rows[0].n === 0) {
        const { seed } = require('./seed');
        try {
          await seed({ reset: false });
          console.log('seeded demo company');
        } catch (e) {
          // Another instance seeded at the same moment and won the race.
          if (!/already|taken|23505/.test(e.message)) throw e;
        }
      }
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

async function boot() {
  await ready();
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

module.exports = { app, pool, ready };
