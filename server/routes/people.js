'use strict';

const express = require('express');
const { pool } = require('../db');
const { asyncHandler, required, HttpError } = require('../lib');

const router = express.Router();

async function createPerson(req, res) {
  const { handle, display_name, email, wallet_address } = req.body || {};
  required(req.body || {}, ['display_name']);
  const h = handle || String(display_name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const r = await pool.query(
    `INSERT INTO users (handle, display_name, email, wallet_address)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [h, display_name, email || null, wallet_address || null]
  );
  res.status(201).json(r.rows[0]);
}

router.post('/people', asyncHandler(createPerson));
router.post('/users', asyncHandler(createPerson)); // stub-compatible alias

async function listPeople(_req, res) {
  const r = await pool.query(`
    SELECT u.*,
           COALESCE(wr.wins_count, 0) AS wins_count,
           COALESCE(wr.employment_days, 0) AS employment_days
      FROM users u
      LEFT JOIN worker_reputation wr ON wr.user_id = u.id
     ORDER BY u.created_at`);
  res.json(r.rows);
}
router.get('/people', asyncHandler(listPeople));
router.get('/users', asyncHandler(listPeople));

router.patch('/people/:id', asyncHandler(async (req, res) => {
  const { display_name, wallet_address, email } = req.body || {};
  const r = await pool.query(
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       wallet_address = CASE WHEN $3::boolean THEN $4 ELSE wallet_address END,
       email = COALESCE($5, email)
     WHERE id = $1 RETURNING *`,
    [req.params.id, display_name || null, wallet_address !== undefined, wallet_address || null, email || null]
  );
  if (!r.rows[0]) throw new HttpError(404, 'person not found');
  res.json(r.rows[0]);
}));

module.exports = router;
