import { html, ic, money, statusPill, railBadge, sourceBadge, ago, formModal, options, toast, on, $$ } from '../ui.js';
import { get, post } from '../api.js';

const FILTERS = [
  ['all', 'All'], ['draft', 'Draft'], ['funded', 'Locked'], ['in_review', 'In review'], ['paid', 'Paid'], ['refunded', 'Refunded'],
];

export default async function jobs(ctx) {
  const cid = ctx.company.id;
  const list = await get(`/jobs?company_id=${cid}`);
  let status = 'all';
  let rail = 'all';

  const rows = () => list.filter((j) =>
    (status === 'all' || (status === 'refunded' ? j.status.endsWith('refunded') : j.status === status)) &&
    (rail === 'all' || j.rail === rail));

  const table = () => {
    const r = rows();
    if (!r.length) return html`<div style="padding:18px"><div class="empty">No jobs match.</div></div>`;
    return html`<div class="table-wrap"><table class="t">
      <thead><tr><th>Job</th><th>Status</th><th>Rail</th><th>Sub-team</th><th class="r">Escrow</th><th class="r">Entries</th><th>Deadline</th></tr></thead>
      <tbody>${r.map((j) => html`
        <tr class="click" data-href="/job/${j.id}">
          <td style="padding-left:${14 + (j.depth - 1) * 18}px">
            ${j.depth > 1 ? html`<span class="faint">↳ </span>` : ''}<b>${j.title}</b> ${sourceBadge(j.budget_source)}
            <div class="tiny muted">by ${j.employer_name}${j.children ? ` · ${j.children} sub-job${j.children > 1 ? 's' : ''}` : ''}</div>
          </td>
          <td>${statusPill(j.status)}</td>
          <td>${railBadge(j.rail, { sim: false })}</td>
          <td class="small muted">${j.team_name || 'Company-wide'}</td>
          <td class="r num"><b>${money(j.amount, j.currency)}</b>${j.status === 'paid' ? html`<div class="tiny" style="color:var(--green)">fee ${money(j.fee_amount, j.currency)}</div>` : ''}</td>
          <td class="r num">${j.entries}</td>
          <td class="small muted nowrap">${ago(j.deadline_at)}</td>
        </tr>`)}</tbody></table></div>`;
  };

  // Show sub-jobs right under their parents.
  const byParent = {};
  list.forEach((j) => { (byParent[j.parent_job_id || 'root'] ||= []).push(j); });
  const ordered = [];
  const walk = (pid) => (byParent[pid] || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach((j) => { ordered.push(j); walk(j.id); });
  walk('root');
  list.splice(0, list.length, ...ordered);

  return {
    title: 'Jobs',
    html: html`
      <div class="page-head">
        <div><h2>Jobs</h2><p>Each job is one task with a deadline and a payout locked in escrow. Sub-jobs appear under their parent.</p></div>
        <button class="btn primary" data-act="post">${ic('lock')} Post a job</button>
      </div>
      <div class="row" style="margin-bottom:14px;gap:12px">
        <div class="seg" id="f-status">${FILTERS.map(([v, l]) => html`<button data-v="${v}" class="${v === 'all' ? 'on' : ''}">${l}</button>`)}</div>
        <div class="seg" id="f-rail">
          <button data-v="all" class="on">All rails</button>
          <button data-v="custodial">${ic('card', 14)} Card</button>
          <button data-v="onchain">${ic('chain', 14)} USDC</button>
        </div>
      </div>
      <div class="card flush" id="jobs-table">${table()}</div>`,
    mount(el) {
      const redraw = () => { el.querySelector('#jobs-table').innerHTML = String(table()); };
      const seg = (id, set) => el.querySelector(id).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        $$('button', e.currentTarget).forEach((x) => x.classList.toggle('on', x === b));
        set(b.dataset.v);
        redraw();
      });
      seg('#f-status', (v) => { status = v; });
      seg('#f-rail', (v) => { rail = v; });
      on(el, 'click', 'tr[data-href]', (_e, tr) => ctx.go(tr.dataset.href));
      on(el, 'click', '[data-act=post]', () => openPostJob(ctx));
    },
  };
}

function railSeg(selected = 'custodial') {
  return html`
    <input type="hidden" name="rail" value="${selected}">
    <div class="seg" data-name="rail">
      <button data-v="custodial" class="${selected === 'custodial' ? 'on gold' : ''}">${ic('card', 14)} Card · USD</button>
      <button data-v="onchain" class="${selected === 'onchain' ? 'on blue' : ''}">${ic('chain', 14)} USDC on Base <span class="sim">sim</span></button>
    </div>`;
}

function fixSegColors(el) {
  el.querySelectorAll('.seg[data-name=rail] button').forEach((b) => {
    b.addEventListener('click', () => {
      el.querySelectorAll('.seg[data-name=rail] button').forEach((x) => x.classList.remove('gold', 'blue'));
      b.classList.add(b.dataset.v === 'onchain' ? 'blue' : 'gold');
    });
  });
}

const in7 = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

/** Post a root job. */
export async function openPostJob(ctx, { teamId } = {}) {
  const tree = await get(`/companies/${ctx.company.id}`);
  formModal({
    title: 'Post a job',
    submit: 'Create draft',
    wide: true,
    body: html`
      <div class="form-grid">
        <label class="field span-2">Title<input name="title" required placeholder="e.g. Ship a Discord bot that tracks treasury moves"></label>
        <label class="field span-2">Requirements (one clear task)<textarea name="requirements" required placeholder="What does done look like? What must the demo show?"></textarea></label>
        <label class="field">Payout<input name="amount" type="number" min="1" step="0.01" required value="1000"></label>
        <label class="field">Deadline<input name="deadline" type="date" value="${in7()}"></label>
        <div class="field span-2"><span>Payout rail</span>${railSeg()}</div>
        <label class="field">Sub-team<select name="team_id">${options(tree.teams, { blank: 'Company-wide', selected: teamId })}</select></label>
        <div class="field"><span>Fee</span><div class="small muted" style="padding-top:8px">2.5% only when you pay the winner. Refunds are free.</div></div>
      </div>
      <div class="note" style="margin-top:14px">${ic('lock')}<div>The job starts as a <b>draft</b>. Entries open after you <b>lock the payout</b> on the job page.</div></div>`,
    onMount: fixSegColors,
    async handler(d) {
      const r = await post('/jobs', {
        company_id: ctx.company.id,
        title: d.title,
        requirements: d.requirements,
        amount: d.amount,
        rail: d.rail,
        team_id: d.team_id || null,
        deadline_at: d.deadline ? new Date(`${d.deadline}T23:59:00`).toISOString() : undefined,
      });
      toast('Draft created. Lock the payout to open entries.');
      ctx.go(`/job/${r.job.id}`);
    },
  });
}

/** Carve out or expand into a sub-job under `parent` ({ id, title, currency, rail, remaining }). */
export function openSubJob(ctx, parent) {
  formModal({
    title: `New sub-job under "${parent.title}"`,
    submit: 'Create sub-job',
    wide: true,
    body: html`
      <div class="form-grid">
        <label class="field span-2">Title<input name="title" required placeholder="A smaller task this job depends on"></label>
        <label class="field span-2">Requirements<textarea name="requirements" required></textarea></label>
        <div class="field span-2"><span>Budget source</span>
          <input type="hidden" name="budget_source" value="parent_carveout">
          <div class="seg" data-name="budget_source">
            <button data-v="parent_carveout" class="on">${ic('split', 14)} Carve out of the parent (0 fee)</button>
            <button data-v="expansion">${ic('plus', 14)} Expansion: new capital</button>
          </div>
        </div>
        <label class="field">Amount<input name="amount" type="number" min="1" step="0.01" required value="${Math.min(1000, Math.floor(Number(parent.remaining || 1000)))}"></label>
        <label class="field">Deadline<input name="deadline" type="date" value="${in7()}"></label>
        <div class="field span-2 exp-rail hidden"><span>Rail for the new capital</span>${railSeg(parent.rail || 'custodial')}</div>
      </div>
      <div class="note" style="margin-top:14px">${ic('info')}<div class="src-note">A carve-out moves <b>${money(parent.remaining, parent.currency)}</b> of remaining parent budget inside the tree, and no fee is charged on it. Jobs nest at most 3 levels deep.</div></div>`,
    onMount(el) {
      fixSegColors(el);
      el.querySelector('.seg[data-name=budget_source]').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        const exp = b.dataset.v === 'expansion';
        el.querySelector('.exp-rail').classList.toggle('hidden', !exp);
        el.querySelector('.src-note').innerHTML = exp
          ? 'An expansion locks <b>new capital</b> as its own escrow. The 2.5% fee applies only when that money is paid out to a winner.'
          : String(html`A carve-out moves <b>${money(parent.remaining, parent.currency)}</b> of remaining parent budget inside the tree, and no fee is charged on it. Jobs nest at most 3 levels deep.`);
      });
    },
    async handler(d) {
      const r = await post('/jobs', {
        company_id: ctx.company.id,
        parent_job_id: parent.id,
        budget_source: d.budget_source,
        title: d.title,
        requirements: d.requirements,
        amount: d.amount,
        rail: d.budget_source === 'expansion' ? d.rail : undefined,
        deadline_at: d.deadline ? new Date(`${d.deadline}T23:59:00`).toISOString() : undefined,
      });
      toast(d.budget_source === 'expansion' ? 'Expansion sub-job drafted' : 'Carve-out sub-job drafted');
      ctx.go(`/job/${r.job.id}`);
    },
  });
}

