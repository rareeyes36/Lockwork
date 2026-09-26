// Lockwork SPA: hash router, app shell, "Viewing as" persona, company switcher.

import { html, ic, logo, $, on, toast, options, formModal } from './ui.js';
import { get, post, setViewer, store } from './api.js';

import landing from './views/landing.js';
import overview from './views/overview.js';
import tree from './views/tree.js';
import jobs, { openPostJob } from './views/jobs.js';
import job from './views/job.js';
import people from './views/people.js';
import roles from './views/roles.js';
import bots from './views/bots.js';
import seats from './views/seats.js';
import plugins from './views/plugins.js';
import sponsors from './views/sponsors.js';
import reputation from './views/reputation.js';
import fees from './views/fees.js';

const ROUTES = [
  [/^\/?$/, landing, 'landing'],
  [/^\/app$/, null, 'app'],
  [/^\/c\/([^/]+)$/, overview, 'overview'],
  [/^\/c\/([^/]+)\/tree$/, tree, 'tree'],
  [/^\/c\/([^/]+)\/jobs$/, jobs, 'jobs'],
  [/^\/c\/([^/]+)\/people$/, people, 'people'],
  [/^\/c\/([^/]+)\/roles$/, roles, 'roles'],
  [/^\/c\/([^/]+)\/bots$/, bots, 'bots'],
  [/^\/c\/([^/]+)\/seats$/, seats, 'seats'],
  [/^\/c\/([^/]+)\/plugins$/, plugins, 'plugins'],
  [/^\/c\/([^/]+)\/sponsors$/, sponsors, 'sponsors'],
  [/^\/job\/([^/]+)$/, job, 'job'],
  [/^\/reputation$/, reputation, 'reputation'],
  [/^\/fees$/, fees, 'fees'],
];

const NAV = [
  ['sec', 'Company'],
  ['overview', 'Overview', 'home', (c) => `/c/${c}`],
  ['tree', 'Org tree', 'tree', (c) => `/c/${c}/tree`],
  ['jobs', 'Jobs', 'briefcase', (c) => `/c/${c}/jobs`],
  ['people', 'People', 'people', (c) => `/c/${c}/people`],
  ['roles', 'Roles', 'badge', (c) => `/c/${c}/roles`],
  ['bots', 'Bots', 'bot', (c) => `/c/${c}/bots`],
  ['seats', 'Employees & seats', 'seat', (c) => `/c/${c}/seats`],
  ['sec', 'Production'],
  ['plugins', 'Plugins', 'plug', (c) => `/c/${c}/plugins`],
  ['sponsors', 'Sponsors', 'hand', (c) => `/c/${c}/sponsors`],
  ['sec', 'Network'],
  ['reputation', 'Reputation', 'star', () => '/reputation'],
  ['fees', 'Fee calculator', 'calc', () => '/fees'],
];

const state = {
  config: null,
  companies: [],
  people: [],
  companyId: store.get('company'),
  viewer: store.get('viewer'),
};

const root = document.getElementById('app');

export const go = (path) => { location.hash = path; };

async function loadGlobals() {
  const [config, companies, ppl] = await Promise.all([
    state.config ? state.config : get('/config'),
    get('/companies'),
    get('/people'),
  ]);
  state.config = config;
  state.companies = companies;
  state.people = ppl;
  if (!companies.find((c) => c.id === state.companyId)) state.companyId = companies[0] && companies[0].id;
}

function pickViewer(company) {
  if (!state.people.find((p) => p.id === state.viewer)) {
    state.viewer = company ? company.employer_user_id : state.people[0] && state.people[0].id;
  }
  setViewer(state.viewer);
  store.set('viewer', state.viewer || '');
}

function match(path) {
  for (const [re, view, name] of ROUTES) {
    const m = path.match(re);
    if (m) return { view, name, params: m.slice(1) };
  }
  return null;
}

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const path = location.hash.replace(/^#/, '') || '/';
  const r = match(path);
  if (!r) return go('/');

  // A newer render (another click, a hashchange) supersedes this one: after
  // every await, bail out before touching the DOM or state.
  const stale = () => seq !== renderSeq;

  if (r.name === 'landing') {
    document.title = 'Lockwork: Lock the payout. Ship the work. Hire the winner.';
    const out = await r.view({ go });
    if (stale()) return;
    root.innerHTML = String(out.html);
    out.mount && out.mount(root);
    window.scrollTo(0, 0);
    lastPath = path;
    return;
  }

  // Navigating to a new route: show a spinner in the current page area.
  const curPage = $('.shell .page', root);
  if (curPage && lastPath !== path) curPage.innerHTML = '<div class="spinner"></div>';

  try {
    await loadGlobals();
  } catch (e) {
    if (stale()) return;
    root.innerHTML = String(html`<div class="page"><div class="note red">${ic('info')}<div><b>Can't reach the API.</b> ${e.message}</div></div></div>`);
    return;
  }
  if (stale()) return;
  if (r.name === 'app') return go(state.companyId ? `/c/${state.companyId}` : '/fees');

  // Resolve company context: from the route, from the job, or the last one used.
  let companyId = r.name === 'job' || r.name === 'reputation' || r.name === 'fees' ? state.companyId : r.params[0];
  let preload = null;
  if (r.name === 'job') {
    try {
      preload = await get(`/jobs/${r.params[0]}`);
      companyId = preload.job.workspace_id;
    } catch (e) {
      preload = { error: e };
    }
    if (stale()) return;
  }
  if (companyId && companyId !== state.companyId) {
    state.companyId = companyId;
  }
  store.set('company', state.companyId || '');
  const company = state.companies.find((c) => c.id === state.companyId) || null;
  pickViewer(company);

  const ctx = {
    params: r.params,
    route: r.name,
    config: state.config,
    companies: state.companies,
    company,
    people: state.people,
    viewer: state.viewer,
    viewerPerson: state.people.find((p) => p.id === state.viewer),
    preload,
    go,
    refresh: () => render(),
  };

  let out;
  try {
    out = await r.view(ctx);
  } catch (e) {
    out = { title: 'Error', html: html`<div class="note red">${ic('info')}<div>${e.message}</div></div>` };
  }
  if (stale()) return;

  // Swap shell + page in one go, only once the view is ready.
  const wasShell = root.querySelector('.shell');
  const scroll = window.scrollY;
  root.innerHTML = String(shellHtml(ctx, r.name));
  bindShell(ctx);
  const pageEl = $('.page', root);
  $('.topbar h1', root).textContent = out.title || '';
  document.title = `${out.title ? out.title + ' · ' : ''}Lockwork`;
  if (out.crumbs) $('.topbar .crumbs', root).innerHTML = String(out.crumbs);
  pageEl.innerHTML = String(out.html);
  out.mount && out.mount(pageEl);
  // Same route re-render (after an action) keeps the scroll position.
  window.scrollTo(0, wasShell && lastPath === path ? scroll : 0);
  lastPath = path;
}
let lastPath = null;

function shellHtml(ctx, active) {
  const cid = ctx.company && ctx.company.id;
  const viewerRole = (p) => {
    if (!ctx.company) return '';
    if (p.id === ctx.company.employer_user_id) return ' · owner';
    return '';
  };
  return html`
  <div class="shell">
    <aside class="side">
      <a class="brand" href="#/">${logo(28)} Lockwork</a>
      <div class="co-switch">
        <label class="sr" for="co-select">Company</label>
        <select id="co-select">${options(ctx.companies, { selected: cid })}</select>
      </div>
      <nav class="nav">
        ${NAV.map(([key, label, icn, href]) => key === 'sec'
          ? html`<div class="sec">${label}</div>`
          : html`<a href="#${cid || key === 'reputation' || key === 'fees' ? href(cid) : '/fees'}" class="${active === key || (active === 'job' && key === 'jobs') ? 'on' : ''}">${ic(icn)}${label}</a>`)}
      </nav>
      <div class="side-foot">
        <button class="btn sm" data-act="new-company">${ic('plus')} New company</button>
        ${ctx.config.demo_reset ? html`<button class="btn sm ghost" data-act="reset">${ic('reset')} Reset demo data</button>` : ''}
        <a class="small muted" href="#/" style="padding:4px 2px">← Back to site</a>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost sm menu-btn" data-act="menu" aria-label="Menu">${ic('menu')}</button>
        <div style="min-width:0">
          <div class="crumbs">${ctx.company ? ctx.company.name : ''}</div>
          <h1></h1>
        </div>
        <div class="grow"></div>
        <div class="viewer" title="Demo stand-in for login: act as any person to see permissions change">
          <span class="lbl">${ic('eye', 14)} Viewing as</span>
          <select id="viewer-select" aria-label="Viewing as">
            ${options(ctx.people, { selected: ctx.viewer, label: (p) => p.display_name + viewerRole(p) })}
          </select>
        </div>
        ${cid ? html`<button class="btn primary" data-act="post-job">${ic('lock')} <span>Post a job</span></button>` : ''}
      </header>
      <div class="page"></div>
    </div>
  </div>`;
}

function bindShell(ctx) {
  const shell = $('.shell', root);
  $('#co-select', root).addEventListener('change', (e) => {
    state.companyId = e.target.value;
    store.set('company', state.companyId);
    const c = state.companies.find((x) => x.id === state.companyId);
    state.viewer = c ? c.employer_user_id : state.viewer;
    const sub = (location.hash.match(/^#\/c\/[^/]+(\/\w+)?$/) || [])[1] || '';
    go(`/c/${state.companyId}${sub}`);
  });
  $('#viewer-select', root).addEventListener('change', (e) => {
    state.viewer = e.target.value;
    setViewer(state.viewer);
    store.set('viewer', state.viewer);
    const p = state.people.find((x) => x.id === state.viewer);
    toast(`Now viewing as ${p ? p.display_name : 'someone else'}`, 'info');
    render();
  });
  on(shell, 'click', '[data-act]', async (e, t) => {
    const act = t.dataset.act;
    if (act === 'menu') shell.classList.toggle('open');
    if (act === 'post-job') openPostJob(ctx);
    if (act === 'new-company') newCompany(ctx);
    if (act === 'reset') {
      if (!confirm('Reset all demo data to the seeded "Atlas Demo Co"?')) return;
      t.disabled = true;
      try {
        const r = await post('/demo/seed');
        state.companyId = r.company_id;
        state.viewer = null;
        toast('Demo data reset');
        go(`/c/${r.company_id}`);
        render();
      } catch (ex) { toast(ex.message, 'err'); t.disabled = false; }
    }
  });
  on(shell, 'click', '.nav a', () => shell.classList.remove('open'));
  shell.addEventListener('click', (e) => {
    if (shell.classList.contains('open') && !e.target.closest('.side') && !e.target.closest('[data-act=menu]')) shell.classList.remove('open');
  });
}

function newCompany(ctx) {
  formModal({
    title: 'New company',
    submit: 'Create company',
    body: html`
      <div class="stack">
        <label class="field">Company name<input name="name" required placeholder="e.g. Northwind Labs"></label>
        <label class="field">Owner (employer)
          <select name="employer_user_id">${options(ctx.people, { selected: ctx.viewer, label: 'display_name' })}</select>
        </label>
        <p class="small muted">The company is the root of the tree. Sub-teams, jobs and sub-jobs all hang under it.</p>
      </div>`,
    async handler(d) {
      const c = await post('/companies', d);
      state.companyId = c.id;
      state.viewer = c.employer_user_id;
      toast(`Created ${c.name}`);
      go(`/c/${c.id}`);
    },
  });
}

window.addEventListener('hashchange', render);
render();

