import { html, ic, money, statusPill, sourceBadge, formModal, options, toast, on } from '../ui.js';
import { get, post } from '../api.js';
import { openSubJob, openPostJob } from './jobs.js';

export default async function tree(ctx) {
  const cid = ctx.company.id;
  const d = await get(`/companies/${cid}`);
  const teamsBy = {};
  d.teams.forEach((t) => { (teamsBy[t.parent_team_id || 'root'] ||= []).push(t); });
  const jobsByParent = {};
  const rootJobsByTeam = {};
  d.jobs.forEach((j) => {
    if (j.parent_job_id) (jobsByParent[j.parent_job_id] ||= []).push(j);
    else (rootJobsByTeam[j.team_id || 'root'] ||= []).push(j);
  });
  const teamDepth = {};
  const depthOf = (t) => teamDepth[t.id] ??= t.parent_team_id ? 1 + depthOf(d.teams.find((x) => x.id === t.parent_team_id)) : 1;
  d.teams.forEach(depthOf);

  const jobNode = (j) => {
    const kids = jobsByParent[j.id] || [];
    const active = ['funded', 'in_review'].includes(j.status);
    return html`<li>
      <div class="node">
        <span class="ic" style="background:${j.depth === 1 ? 'var(--gold-soft)' : 'var(--violet-soft)'};color:${j.depth === 1 ? 'var(--gold)' : 'var(--violet)'}">${ic('briefcase', 15)}</span>
        <a class="name" href="#/job/${j.id}" style="color:inherit">${j.title}</a>
        ${statusPill(j.status)} ${sourceBadge(j.budget_source)}
        <b class="num small">${money(j.amount, j.currency)}</b>
        <span class="tiny faint">L${j.depth}</span>
        <span class="acts">${active || j.depth >= 3 ? html`<button class="btn sm ghost" data-act="subjob" data-id="${j.id}">${ic('plus', 14)} Sub-job</button>` : ''}</span>
        <div class="err hidden"></div>
      </div>
      ${kids.length ? html`<ul>${kids.map(jobNode)}</ul>` : ''}
    </li>`;
  };

  const teamNode = (t) => {
    const kids = teamsBy[t.id] || [];
    const jobs = rootJobsByTeam[t.id] || [];
    return html`<li>
      <div class="node team">
        <span class="ic" style="background:var(--blue-soft);color:var(--blue)">${ic('team', 15)}</span>
        <span class="name">${t.name}</span><span class="tiny muted">sub-team · level ${teamDepth[t.id]}</span>
        <span class="acts">
          <button class="btn sm ghost" data-act="team" data-id="${t.id}">${ic('plus', 14)} Sub-team</button>
          <button class="btn sm ghost" data-act="job" data-id="${t.id}">${ic('lock', 14)} Job</button>
        </span>
        <div class="err hidden"></div>
      </div>
      ${kids.length || jobs.length ? html`<ul>${kids.map(teamNode)}${jobs.map(jobNode)}</ul>` : ''}
    </li>`;
  };

  return {
    title: 'Org tree',
    html: html`
      <div class="page-head">
        <div><h2>Org tree</h2><p>The company is the root. Sub-teams live only inside it, and jobs and sub-jobs hang off the company or a sub-team. The org grows from funded work. Levels are capped at 3 for jobs and sub-teams.</p></div>
        <div class="row"><span class="pill gold nodot">company</span><span class="pill blue nodot">sub-team</span><span class="pill violet nodot">carve-out</span><span class="pill gold nodot">expansion</span></div>
      </div>
      <div class="card tree">
        <ul><li>
          <div class="node company">
            <span class="ic" style="background:var(--gold);color:var(--gold-ink)">${ic('company', 15)}</span>
            <span class="name">${d.company.name}</span><span class="tiny muted">company · owner ${d.company.owner.display_name}</span>
            <span class="acts">
              <button class="btn sm ghost" data-act="team" data-id="">${ic('plus', 14)} Sub-team</button>
              <button class="btn sm ghost" data-act="job" data-id="">${ic('lock', 14)} Job</button>
            </span>
            <div class="err hidden"></div>
          </div>
          <ul>${(teamsBy.root || []).map(teamNode)}${(rootJobsByTeam.root || []).map(jobNode)}</ul>
        </li></ul>
      </div>`,
    mount(el) {
      on(el, 'click', '[data-act]', (_e, t) => {
        const id = t.dataset.id;
        const err = t.closest('.node').querySelector('.err');
        if (t.dataset.act === 'team') {
          formModal({
            title: 'New sub-team',
            submit: 'Create sub-team',
            body: html`<div class="stack">
              <label class="field">Name<input name="name" required placeholder="e.g. Design"></label>
              <label class="field">Inside<select name="parent_team_id">${options(d.teams, { blank: `${d.company.name} (company root)`, selected: id })}</select></label>
              <p class="small muted">Sub-teams are for organizing. Seats and billing always roll up to the company.</p>
            </div>`,
            async handler(f) {
              await post(`/companies/${cid}/teams`, { name: f.name, parent_team_id: f.parent_team_id || null });
              toast('Sub-team created');
              ctx.refresh();
            },
          });
        }
        if (t.dataset.act === 'job') openPostJob(ctx, { teamId: id });
        if (t.dataset.act === 'subjob') {
          const j = d.jobs.find((x) => x.id === id);
          if (j.depth >= 3) {
            // Let the server enforce D4 so the rule is demonstrably real.
            post('/jobs', { company_id: cid, parent_job_id: j.id, title: 'probe', requirements: 'probe', amount: 1 })
              .then(() => ctx.refresh())
              .catch((ex) => { err.innerHTML = String(html`<div class="note red small">${ic('info')}<div>${ex.message}</div></div>`); err.classList.remove('hidden'); });
            return;
          }
          get(`/jobs/${j.id}`).then((full) => openSubJob(ctx, { id: j.id, title: j.title, currency: j.currency, rail: j.rail, remaining: full.budget.remaining }));
        }
      });
    },
  };
}
