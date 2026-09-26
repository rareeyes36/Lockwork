'use strict';

const { HttpError } = require('./db');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Demo stand-in for auth: the UI's "Viewing as" picker sends X-Lockwork-As.
 * No header = trusted script / CLI (demo scripts, seed).
 */
function actorId(req) {
  const v = req.get('x-lockwork-as');
  if (!v) return null;
  if (!UUID_RE.test(v)) throw new HttpError(400, 'X-Lockwork-As must be a person id');
  return v;
}

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, `${missing.join(', ')} required`);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'company';
}

/** Friendly messages for constraint names the UI can hit. */
const CONSTRAINT_MESSAGES = {
  bot_agents_one_lead_per_role_idx: 'This role already has a lead bot. One lead bot per role.',
  submissions_one_active_user_idx: 'This person already has an active entry on this job.',
  submissions_one_active_bot_idx: 'This bot already has an active entry on this job.',
  users_handle_unique: 'That handle is taken.',
  users_email_unique: 'That email is already in use.',
  workspaces_slug_unique: 'That company slug is taken.',
  roles_workspace_name_unique: 'A role with that name already exists in this company.',
  teams_company_name_unique: 'A sub-team with that name already exists in this company.',
  workspace_plugins_unique: 'Already subscribed to that plugin.',
  role_assignments_user_unique_idx: 'That person already holds this role.',
  role_assignments_bot_unique_idx: 'That bot already holds this role.',
  employments_not_self: 'An employer cannot hire themselves.',
  employments_unique: 'Already employed from this job.',
  jobs_depth_check: 'Jobs nest at most 3 levels deep (D4).',
  job_escrows_amount_positive: 'Amount must be greater than zero.',
  sponsors_kinds_nonempty: 'Pick at least one sponsor kind.',
  sponsors_kinds_allowed: 'Unknown sponsor kind.',
  sponsor_contributions_amount_positive: 'Amount must be greater than zero.',
};

function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    const { status, message, ...extra } = err;
    return res.status(status).json({ error: message, ...extra });
  }
  const friendly = err.constraint && CONSTRAINT_MESSAGES[err.constraint];
  let status = 500;
  if (err.code === '23505') status = 409;
  else if (['23514', '23502', '23503', '22P02', '22007', '22008', '22003'].includes(err.code)) status = 400;
  else if (err.type === 'entity.parse.failed') status = 400;
  if (status === 500) console.error(err);
  let message = friendly || err.message || 'internal error';
  if (err.code === '22P02' && !friendly) message = 'Invalid id or value format.';
  res.status(status).json({
    error: message,
    detail: err.detail || undefined,
    code: err.code || undefined,
    constraint: err.constraint || undefined,
  });
}

module.exports = { asyncHandler, actorId, required, slugify, errorHandler, HttpError, UUID_RE };
