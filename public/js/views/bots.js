import { html, ic, avatar, formModal, options, toast, on } from '../ui.js';
import { get, post, patch } from '../api.js';

const KIND = {
  lead: ['gold', 'Lead bot'],
  worker: ['blue', 'Worker'],
  job_scoped: ['violet', 'Job-scoped'],
};

export default async function bots(ctx) {
  const cid = ctx.company.id;
  const [list, roles, tree] = await Promise.all([
    get(`/companies/${cid}/bots`), get(`/companies/${cid}/roles`), get(`/companies/${cid}`),
  ]);
  const openJobs = tree.jobs.filter((j) => j.status === 'funded');

  const card = (b) => {
    const [cls, label] = KIND[b.kind];
    const cfg = b.config_json || {};
    return html`
    <div class="card tight">
      <div class="row" style="flex-wrap:nowrap">
        ${avatar(b.name, { bot: true })}
        <div style="min-width:0">
          <div class="row" style="gap:6px"><b>${b.name}</b><span class="pill ${cls} nodot">${label}</span></div>
          <div class="tiny muted">operator ${b.operator_name || '— none —'}${b.parent_bot_name ? ` · reports to ${b.parent_bot_name}` : ''}</div>
        </div>
        <span class="grow"></span>
        <span class="pill ${b.status === 'active' ? 'green' : 'grey'}">${b.status}</span>
      </div>
      <dl class="kv" style="margin-top:12px">
        ${b.managing_role_name ? html`<dt>Leads role</dt><dd>${b.managing_role_name}</dd>` : ''}
        ${b.roles.length ? html`<dt>Holds</dt><dd>${b.roles.map((r) => r.name).join(', ')}</dd>` : ''}
        ${b.job_title ? html`<dt>Job</dt><dd><a href="#/job/${b.job_id}">${b.job_title}</a></dd>` : ''}
        <dt>Model</dt><dd class="mono">${cfg.model || '—'}</dd>
        <dt>Tools</dt><dd>${(cfg.tools || []).join(', ') || '—'}</dd>
        <dt>Wins</dt><dd>${b.wins_count}</dd>
      </dl>
      <div class="row" style="gap:6px;margin-top:12px">
        ${b.status === 'active'
          ? html`<button class="btn sm" data-act="stop" data-id="${b.id}">${ic('pause', 14)} Stop</button>`
          : html`<button class="btn sm" data-act="start" data-id="${b.id}">${ic('play', 14)} Start</button>`}
        <button class="btn sm" data-act="promote" data-id="${b.id}">${ic('badge', 14)} Promote</button>
        <button class="btn sm ghost" data-act="operator" data-id="${b.id}">Operator</button>
      </div>
    </div>`;
  };

  return {
    title: 'Bots',
    html: html`
      <div class="page-head">
        <div><h2>Bots</h2><p>Bot agents always sit in a role. There are three kinds: a <b>lead bot</b> (one per role, manages the bots and people under it), a <b>worker</b>, and a <b>job-scoped</b> bot that's spun up for one job and shuts down once a winner is picked, unless it's promoted. When a bot wins, the payout goes to its human operator.</p></div>
        <button class="btn primary" data-act="new">${ic('plus')} Spin up a bot</button>
      </div>
      ${list.length ? html`<div class="grid c3">${list.map(card)}</div>` : html`<div class="empty">No bots yet.</div>`}
      <div class="note" style="margin-top:16px">${ic('info')}<div>Bots here are stubs (model + tools config). The contest logic is real: bots enter jobs, can win, earn reputation and pay out to their operator.</div></div>`,
    mount(el) {
      on(el, 'click', '[data-act]', async (_e, t) => {
        const b = list.find((x) => x.id === t.dataset.id);
        try {
          if (t.dataset.act === 'stop') { await post(`/bots/${b.id}/stop`); toast(`${b.name} stopped`); ctx.refresh(); }
          if (t.dataset.act === 'start') { await post(`/bots/${b.id}/start`); toast(`${b.name} started`); ctx.refresh(); }
          if (t.dataset.act === 'promote') {
            formModal({
              title: `Promote ${b.name}`,
              submit: 'Promote',
              body: html`<div class="stack">
                <label class="field">Into role<select name="role_id">${options(roles)}</select></label>
                <label class="field inline"><input type="checkbox" name="as_lead" value="1"> As the role's lead bot (one per role)</label>
              </div>`,
              async handler(f) {
                await post(`/bots/${b.id}/promote`, { role_id: f.role_id, as_lead: Boolean(f.as_lead) });
                toast(`${b.name} promoted`);
                ctx.refresh();
              },
            });
          }
          if (t.dataset.act === 'operator') {
            formModal({
              title: `Operator for ${b.name}`,
              submit: 'Save',
              body: html`<label class="field">Operator (receives payouts)<select name="operator_user_id">${options(ctx.people, { label: 'display_name', selected: (b.config_json || {}).operator_user_id })}</select></label>`,
              async handler(f) { await patch(`/bots/${b.id}`, f); toast('Operator updated'); ctx.refresh(); },
            });
          }
          if (t.dataset.act === 'new') {
            formModal({
              title: 'Spin up a bot',
              submit: 'Spin up',
              body: html`<div class="form-grid">
                <label class="field">Name<input name="name" required placeholder="e.g. Scout-9"></label>
                <label class="field">Kind<select name="kind">
                  <option value="job_scoped">Job-scoped (for one job)</option>
                  <option value="worker">Worker (standing)</option>
                  <option value="lead">Lead bot (leads a role)</option>
                </select></label>
                <label class="field span-2 k-job">Job<select name="job_id">${options(openJobs, { label: 'title', blank: openJobs.length ? undefined : 'No open jobs' })}</select></label>
                <label class="field span-2 k-lead hidden">Leads role<select name="managing_role_id">${options(roles.filter((r) => !r.lead_bot), { blank: 'Pick a role without a lead' })}</select></label>
                <label class="field">Operator<select name="operator_user_id">${options(ctx.people, { label: 'display_name', selected: ctx.viewer })}</select></label>
                <label class="field">Reports to<select name="parent_bot_id">${options(list, { blank: 'Nobody' })}</select></label>
                <label class="field span-2">Model<input name="model" value="claude-sonnet-5"></label>
              </div>`,
              onMount(m) {
                const kind = m.querySelector('[name=kind]');
                kind.addEventListener('change', () => {
                  m.querySelector('.k-job').classList.toggle('hidden', kind.value !== 'job_scoped');
                  m.querySelector('.k-lead').classList.toggle('hidden', kind.value !== 'lead');
                });
              },
              async handler(f) {
                const body = {
                  name: f.name, kind: f.kind, operator_user_id: f.operator_user_id, model: f.model,
                  parent_bot_id: f.parent_bot_id || undefined,
                  job_id: f.kind === 'job_scoped' ? f.job_id : undefined,
                  managing_role_id: f.kind === 'lead' ? f.managing_role_id : undefined,
                };
                const nb = await post(`/companies/${cid}/bots`, body);
                if (f.kind === 'lead') await post(`/roles/${f.managing_role_id}/assignments`, { bot_agent_id: nb.id });
                toast(`${nb.name} is live`);
                ctx.refresh();
              },
            });
          }
        } catch (ex) { toast(ex.message, 'err'); }
      });
    },
  };
}
