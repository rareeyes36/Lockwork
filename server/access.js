'use strict';

/**
 * Permission checks for the demo "Viewing as" persona (X-Lockwork-As).
 * A null actor means a trusted script and passes every check.
 */

const { HttpError } = require('./db');

async function loadCompany(db, companyId) {
  const r = await db.query('SELECT * FROM workspaces WHERE id = $1', [companyId]);
  if (!r.rows[0]) throw new HttpError(404, 'company not found');
  return r.rows[0];
}

async function actorRoles(db, companyId, actor) {
  const r = await db.query(
    `SELECT ro.* FROM role_assignments ra
       JOIN roles ro ON ro.id = ra.role_id
      WHERE ro.workspace_id = $1 AND ra.user_id = $2`,
    [companyId, actor]
  );
  return r.rows;
}

/** Owner or any role holder may post jobs in the company. */
async function assertCanPost(db, company, actor) {
  if (!actor || company.employer_user_id === actor) return;
  const roles = await actorRoles(db, company.id, actor);
  if (!roles.length) {
    throw new HttpError(403, 'Only the company owner or a role holder can post jobs here.');
  }
}

/** Owner or a holder of a role with can_mint_roles may create roles. */
async function assertCanMintRoles(db, company, actor) {
  if (!actor || company.employer_user_id === actor) return;
  const roles = await actorRoles(db, company.id, actor);
  if (!roles.some((r) => r.can_mint_roles)) {
    throw new HttpError(403, 'You need a role with "can mint roles" to create roles in this company.');
  }
}

async function isSponsorOf(db, job, actor) {
  const r = await db.query(
    `SELECT 1 FROM sponsors
      WHERE sponsor_user_id = $1 AND (job_id = $2 OR workspace_id = $3) LIMIT 1`,
    [actor, job.id, job.workspace_id]
  );
  return r.rowCount > 0;
}

/**
 * Money and winner actions belong to the job's employer (D3).
 * Sponsors get a specific refusal: they fund and fulfil, never pick.
 */
async function assertJobEmployer(db, job, actor, action) {
  if (!actor || job.employer_user_id === actor) return;
  if (action === 'pay' && (await isSponsorOf(db, job, actor))) {
    throw new HttpError(403, 'Sponsors fund and fulfil. They never pick the winner.', { rule: 'sponsor_no_veto' });
  }
  const verb = {
    pay: 'pick the winner',
    fund: 'lock the payout',
    review: 'close entries for review',
    cancel: 'cancel and refund',
  }[action] || action;
  throw new HttpError(403, `Only this job's employer can ${verb}.`);
}

module.exports = { loadCompany, actorRoles, assertCanPost, assertCanMintRoles, assertJobEmployer, isSponsorOf };
