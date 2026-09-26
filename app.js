'use strict';

/**
 * Vercel entry point (zero-config Express). The whole API runs as one
 * serverless function; public/ is served by Vercel's CDN.
 * Locally or on Render, use `npm start` (server/server.js) instead.
 */

const express = require('express');
const { app: api, ready } = require('./server/server');

const app = express();

// Serverless has no boot step: the first request on each instance migrates
// (and seeds an empty database) before anything else runs.
// Only the API needs the database; pages and assets must load even before it's ready.
app.use((req, res, next) => { res.set('x-lw-path', req.originalUrl); next(); });
app.use('/api', (req, res, next) => {
  ready().then(() => next(), (e) => {
    console.error('startup failed', e);
    res.status(503).json({ error: 'Database not ready. Is DATABASE_URL set?', detail: e.message });
  });
});
app.use(api);

module.exports = app;
