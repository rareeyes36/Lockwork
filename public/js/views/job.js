import {
  html, raw, ic, money, statusPill, railBadge, sourceBadge, avatar, date, ago, short,
  openModal, formModal, options, toast, on, sleep, $,
} from '../ui.js';
import { get, post, patch } from '../api.js';
import * as W from '../wallet.js';
import { openSubJob } from './jobs.js';

const DECIMALS = { USD: 2, USDC: 6 };

/** Client-side preview of the server's integer fee math (release only, 250 bps). */
function feePreview(amount, currency, bps = 250) {
  const d = DECIMALS[currency] ?? 2;
  const minor = Math.round(Number(amount) * 10 ** d);
  const fee = Math.floor((minor * bps) / 10000);
  return { fee: fee / 10 ** d, net: (minor - fee) / 10 ** d };
}

function timeline(status) {
  const refunded = status.endsWith('refunded');
  const steps = refunded
    ? [['draft', 'Draft'], ['funded', 'Locked'], [status, status === 'expired_refunded' ? 'Expired → refunded' : 'Cancelled → refunded']]
    : [['draft', 'Draft'], ['funded', 'Locked'], ['in_review', 'In review'], ['paid', 'Paid']];
  const idx = steps.findIndex(([k]) => k === status);
  return html`<div class="timeline ${status === 'paid' ? 'paid' : ''} ${refunded ? 'refunded' : ''}">
    ${steps.map(([, label], i) => html`<div class="st ${i < idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><span class="dot">${i < idx ? raw(`<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`) : ''}</span>${label}</div>`)}
  </div>`;
}

function previewable(url) {
  return typeof url === 'string' && url.startsWith('/');
}

function entryCard(s, d, canPick) {
  const bot = s.submitter_type === 'bot';
  const name = bot ? s.bot_name : s.submitter_name;
  const statusPillHtml = {
    selected: html`<span class="pill paid">${ic('trophy', 12)} Winner</span>`,
    rejected: html`<span class="pill grey">Not selected</span>`,
    withdrawn: html`<span class="pill grey">Withdrawn</span>`,
    submitted: d.job.status === 'in_review' ? html`<span class="pill in_review">Read-only</span>` : html`<span class="pill grey nodot">Submitted</span>`,
  }[s.status];
  return html`
  <div class="entry ${s.status}">
    <div class="top">
      ${avatar(name, { bot, key: s.submitter_bot_id || s.submitter_user_id })}
      <div style="min-width:0">
        <div class="row" style="gap:7px"><b>${name}</b>${bot ? html`<span class="pill violet nodot">${ic('bot', 12)} bot</span>` : ''}</div>
        <div class="tiny muted">${bot ? html`operated by ${s.bot_operator_name || 'nobody (set an operator)'} · ` : ''}submitted ${ago(s.created_at)}</div>
      </div>
      <span class="grow"></span>
      ${statusPillHtml}
    </div>
    ${s.notes ? html`<div class="small" style="padding:0 16px 12px;color:var(--text-2)">${s.notes}</div>` : ''}
    ${previewable(s.demo_url) ? html`<div class="preview"><iframe src="${s.demo_url}" title="Demo preview for ${name}" loading="lazy" sandbox="allow-scripts"></iframe><span class="ro sim">read-only demo</span></div>` : ''}
    <div class="foot">
      <a class="btn sm" href="${s.demo_url}" target="_blank" rel="noopener">${ic('link', 14)} Open demo</a>
      ${s.assets.map((a) => html`<a class="chip" href="${a.url}" target="_blank" rel="noopener">${ic(a.kind === 'file' ? 'file' : 'link', 13)} ${a.label || a.kind}</a>`)}
      <span class="grow"></span>
      ${s.status === 'submitted' && d.job.status === 'funded' ? html`<button class="btn sm ghost" data-act="withdraw" data-id="${s.id}">Withdraw</button>` : ''}
      ${canPick && s.status === 'submitted' ? html`<button class="btn sm green" data-act="pick" data-id="${s.id}">${ic('trophy', 14)} Pick as winner</button>` : ''}
    </div>
  </div>`;
}

export default async function job(ctx) {
  if (ctx.preload && ctx.preload.error) throw ctx.preload.error;
  const d = ctx.preload || (await get(`/jobs/${ctx.params[0]}`));
  const { job: j, escrow: e, budget } = d;
  const cur = e.currency;
  const active = ['funded', 'in_review'].includes(j.status);
  const isEmployer = ctx.viewer === j.employer_user_id;
  const viewerName = ctx.viewerPerson ? ctx.viewerPerson.display_name : 'You';
  const liveEntries = d.submissions.filter((s) => s.status !== 'withdrawn');
  const winner = d.submissions.find((s) => s.status === 'selected');
  const meta = e.meta_json || {};
  // Real testnet escrow vs simulation (the server decides per funding escrow).
  const chainCfg = ctx.config.chain || { enabled: false };
  const chainMode = d.chain ? d.chain.mode : null; // 'real' | 'sim' | null (not locked yet)
  const real = chainMode === 'real';
  const canGoReal = e.rail === 'onchain' && chainCfg.enabled && !chainMode && j.budget_source !== 'parent_carveout';
  const badge = () => (e.rail === 'onchain' && (real || canGoReal)
    ? html`${railBadge(e.rail, { sim: false })} <span class="live">live · testnet</span>`
    : railBadge(e.rail));
  const hashCell = (h) => {
    if (!real) return html`${short(h, 10, 6)} <span class="sim">sim</span>`;
    return chainCfg.explorer
      ? html`<a class="hash" href="${chainCfg.explorer}/tx/${h}" target="_blank" rel="noopener">${short(h, 10, 6)} ↗</a>`
      : html`<span class="hash">${short(h, 10, 6)}</span>`;
  };
  const unitsOf = (x) => W.usdcUnits(x);
  const paidCarve = d.children.filter((c) => c.budget_source === 'parent_carveout' && c.status === 'paid')
    .reduce((a, c) => a + Number(c.amount), 0);
  const openCarve = d.children.filter((c) => c.budget_source === 'parent_carveout' && ['funded', 'in_review'].includes(c.status));
  const residual = Number(e.amount) - paidCarve;
  const pct = (x) => `${Math.max(0, Math.min(100, (Number(x) / Number(e.amount)) * 100))}%`;

  const crumbs = html`<a href="#/c/${j.workspace_id}" style="color:inherit">${j.company_name}</a>${d.parent ? html` › <a href="#/job/${d.parent.id}" style="color:inherit">${d.parent.title}</a>` : ''}`;
  const nestedBudgetHud = d.parent ? html`
    <div class="note blue nested-budget-hud" style="margin-bottom:16px">
      ${ic('split')}<div><b>Nested budget HUD</b> · parent remaining <b>${money(d.parent.remaining, d.parent.currency)}</b> · this carve-out ${money(e.amount, cur)} · <b>carve-out fee $0</b></div>
    </div>` : '';

  /* ----- escrow actions ----- */
  const actions = [];
  if (j.status === 'draft') {
    actions.push(j.budget_source === 'parent_carveout'
      ? html`<button class="btn primary" data-act="fund">${ic('split')} Allocate from parent (0 fee)</button>`
      : e.rail === 'onchain'
        ? html`<button class="btn blue" data-act="fund">${ic('wallet')} Lock ${money(e.amount, cur)} with wallet${canGoReal ? '' : ' (sim)'}</button>`
        : html`<button class="btn primary" data-act="fund">${ic('lock')} Lock ${money(e.amount, cur)}</button>`);
    actions.push(html`<button class="btn danger sm" data-act="cancel">Delete draft</button>`);
  }
  if (j.status === 'funded') actions.push(html`<button class="btn" data-act="review">${ic('eye')} Close entries → review</button>`);
  if (active) actions.push(html`<button class="btn danger sm" data-act="cancel">${ic('refund', 14)} Cancel & refund</button>`);

  const escrowCard = html`
    <div class="card">
      <div class="card-head"><h3>${ic('lock')} Escrow</h3><span>${badge()}</span></div>
      <div class="escrow-amt num">${Number(e.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}<span class="cur">${cur}</span></div>
      <div class="tiny muted" style="margin-bottom:14px">${j.budget_source === 'parent_carveout' ? 'Carved out of the parent escrow' : j.budget_source === 'expansion' ? 'Expansion: new capital, its own escrow' : 'Full payout locked by the employer'}</div>
      ${timeline(j.status)}
      <div class="divider"></div>
      <dl class="kv">
        <dt>Payer</dt><dd>${e.payer_name}</dd>
        <dt>Employer</dt><dd>${j.employer_name}${isEmployer ? ' (you)' : ''}</dd>
        ${e.escrow_ref ? html`<dt>Escrow ref</dt><dd class="hash" title="${e.escrow_ref}">${short(e.escrow_ref, 14, 6)}</dd>` : ''}
        ${meta.lock_tx ? html`<dt>Lock tx</dt><dd title="${meta.lock_tx}">${hashCell(meta.lock_tx)}</dd>` : ''}
        ${meta.chain ? html`<dt>Network</dt><dd>${meta.network || 'Base'} (chain ${meta.chain_id}) · USDC</dd>` : ''}
        ${real && meta.payer_wallet ? html`<dt>Locked by</dt><dd class="hash" title="${meta.payer_wallet}">${short(meta.payer_wallet, 8, 6)}</dd>` : ''}
        ${e.funded_at ? html`<dt>Locked</dt><dd>${date(e.funded_at)}</dd>` : ''}
        <dt>Deadline</dt><dd>${date(j.deadline_at)} · ${ago(j.deadline_at)}</dd>
        <dt>Platform fee</dt><dd>${e.platform_fee_bps / 100}% on release only</dd>
      </dl>
      ${actions.length ? html`<div class="divider"></div><div class="row">${actions}</div>` : ''}
      ${!isEmployer && (j.status === 'draft' || active) ? html`<p class="tiny muted" style="margin-top:10px">Only ${j.employer_name} can move this money. Switch "Viewing as" to try.</p>` : ''}
    </div>`;

  const receipt = j.status === 'paid' ? html`
    <div class="receipt">
      <div class="row between"><h3 style="font-size:1rem">${ic('trophy')} Payout receipt</h3><span>${badge()}</span></div>
      <div style="margin-top:10px">
        <div class="line"><span class="muted">Escrow</span><span>${money(e.amount, cur)}</span></div>
        ${Number(e.carved_out_amount) > 0 ? html`<div class="line"><span class="muted">Already paid out via sub-jobs</span><span>− ${money(e.carved_out_amount, cur)}</span></div>` : ''}
        <div class="line"><span class="muted">Released to winner</span><span>${money(Number(e.fee_amount) + Number(e.net_to_winner), cur)}</span></div>
        <div class="line"><span class="muted">Platform fee (${e.platform_fee_bps / 100}%)</span><span>− ${money(e.fee_amount, cur)}</span></div>
        <div class="line total"><span>${e.winner_payee_name} receives</span><span>${money(e.net_to_winner, cur)}</span></div>
      </div>
      <dl class="kv" style="margin-top:10px">
        <dt>Winner</dt><dd>${winner ? (winner.submitter_type === 'bot' ? `${winner.bot_name} (bot) → operator` : winner.submitter_name) : ''}</dd>
        <dt>Released</dt><dd>${date(e.released_at)}</dd>
        ${meta.release_tx ? html`<dt>Release tx</dt><dd title="${meta.release_tx}">${hashCell(meta.release_tx)}</dd>` : ''}
        ${real && meta.winner_wallet ? html`<dt>Paid to</dt><dd class="hash" title="${meta.winner_wallet}">${short(meta.winner_wallet, 8, 6)}</dd>` : ''}
      </dl>
    </div>` : '';

  const refundCard = j.status.endsWith('refunded') ? html`
    <div class="card" style="border-color:rgba(255,107,107,.35)">
      <div class="card-head"><h3>${ic('refund')} Refunded</h3><span class="pill refunded">0 fee</span></div>
      <dl class="kv">
        <dt>Amount returned</dt><dd><b>${money(e.refund_amount, cur)}</b></dd>
        <dt>Returned to</dt><dd>${meta.refund_to === 'parent_escrow' ? 'Parent job budget' : e.payer_name}</dd>
        <dt>Reason</dt><dd>${j.status === 'expired_refunded' ? 'Deadline passed, no winner' : 'Cancelled by employer'}</dd>
        <dt>When</dt><dd>${date(e.refunded_at)}</dd>
        ${meta.refund_tx ? html`<dt>Refund tx</dt><dd>${hashCell(meta.refund_tx)}</dd>` : ''}
      </dl>
    </div>` : '';

  const hireCard = d.employment ? html`
    <div class="card">
      <div class="card-head"><h3>${ic('seat')} Hired into company</h3><span class="pill ${d.employment.seat_status === 'active' ? 'paid' : d.employment.seat_status === 'churned' ? 'grey' : 'funded'}">seat ${d.employment.seat_status}</span></div>
      <div class="row">${avatar(d.employment.employee_name)}<div><b>${d.employment.employee_name}</b><div class="tiny muted">joined ${j.company_name}${d.employment.role_name ? ` as ${d.employment.role_name}` : ''}</div></div></div>
      ${d.employment.seat_status === 'pending' ? html`
        <button class="btn sm primary" style="margin-top:12px" data-act="seat-attach" data-id="${d.employment.id}">${ic('card', 14)} Attach company seat ($79/mo)</button>
        <div class="tiny faint" style="margin-top:6px">Records a company invoice and activates the seat (custodial-sim until Stripe).</div>
      ` : html`<a class="btn sm" style="margin-top:12px" href="#/c/${j.workspace_id}/seats">Manage company seat →</a>`}
    </div>` : winner && winner.submitter_type === 'bot' ? html`
    <div class="card">
      <div class="card-head"><h3>${ic('bot')} Bot won</h3></div>
      <p class="small muted">${winner.bot_name}'s payout went to its operator, <b>${winner.bot_operator_name}</b>. Bots don't hold seats. They can be promoted into a standing role instead.</p>
      <button class="btn sm" style="margin-top:12px" data-act="promote" data-id="${winner.submitter_bot_id}">${ic('badge', 14)} Promote ${winner.bot_name} into a role</button>
    </div>` : '';

  const jobSponsors = d.sponsors;
  const sponsorsCard = html`
    <div class="card">
      <div class="card-head"><h3>${ic('hand')} Sponsors</h3><a class="small" href="#/c/${j.workspace_id}/sponsors">Manage →</a></div>
      ${jobSponsors.length ? html`<div class="col" style="gap:10px">${jobSponsors.map((s) => {
        const contribs = d.contributions.filter((c) => c.sponsor_id === s.id);
        return html`<div>
          <div class="row" style="gap:7px"><b>${s.name}</b>${s.kinds.map((k) => html`<span class="chip">${k}</span>`)}</div>
          <div class="tiny muted">${s.job_id ? 'This job' : 'Company-wide'}${s.sponsor_person ? ` · ${s.sponsor_person}` : ''}</div>
          ${contribs.map((c) => html`<div class="small" style="margin-top:4px">${c.kind.replace('_', '-')} <b class="num">${money(c.amount, c.currency)}</b> <span class="pill ${c.state === 'locked' ? 'funded' : c.state === 'released' ? 'paid' : 'grey'}">${c.state}</span></div>`)}
        </div>`;
      })}</div>` : html`<p class="small muted">No sponsors yet.</p>`}
      <div class="note" style="margin-top:12px">${ic('shield')}<div>Sponsors fund and fulfil, but they never pick the winner.</div></div>
    </div>`;

  const botsCard = html`
    <div class="card">
      <div class="card-head"><h3>${ic('bot')} Bots on this job</h3>${active ? html`<button class="btn sm" data-act="spin-bot">${ic('plus', 14)} Spin up</button>` : ''}</div>
      ${d.bots.length ? html`<div class="col" style="gap:8px">${d.bots.map((b) => html`
        <div class="row" style="gap:9px">${avatar(b.name, { bot: true, sm: true })}<b>${b.name}</b><span class="pill ${b.status === 'active' ? 'green' : 'grey'}">${b.status}</span><span class="tiny muted">op. ${b.operator_name || '—'}</span></div>`)}</div>`
        : html`<p class="small muted">No job-scoped bots. Spin one up to compete. Once a winner is picked, job bots shut down unless they won.</p>`}
    </div>`;

  const subJobs = html`
    <div class="card">
      <div class="card-head">
        <h3>${ic('split')} Sub-jobs <span class="tiny muted">level ${j.depth} of ${d.rules.max_depth}</span></h3>
        ${active ? html`<button class="btn sm" data-act="subjob">${ic('plus', 14)} New sub-job</button>` : ''}
      </div>
      ${j.status === 'draft' || active ? html`<div class="bar" aria-label="Budget split">
        <span style="width:${pct(paidCarve)};background:var(--green)"></span>
        <span style="width:${pct(Number(budget.carved_out) - paidCarve)};background:var(--violet)"></span>
        <span style="width:${pct(budget.remaining)};background:var(--gold)"></span>
      </div>
      <div class="legend">
        <span><i style="background:var(--green)"></i>Paid out via sub-jobs ${money(paidCarve, cur)}</span>
        <span><i style="background:var(--violet)"></i>Locked in sub-jobs ${money(Number(budget.carved_out) - paidCarve, cur)}</span>
        <span><i style="background:var(--gold)"></i>Remaining at this level ${money(budget.remaining, cur)}</span>
      </div>` : ''}
      ${d.children.length ? html`<div class="col" style="gap:8px;margin-top:14px">${d.children.map((c) => html`
        <a class="node" href="#/job/${c.id}" style="text-decoration:none;color:inherit">
          <span class="ic" style="background:var(--panel-3)">${ic('briefcase', 15)}</span>
          <span class="name">${c.title}</span>${sourceBadge(c.budget_source)}${statusPill(c.status)}
          <span class="grow"></span><b class="num">${money(c.amount, c.currency)}</b>
        </a>`)}</div>` : html`<p class="small muted" style="margin-top:12px">No sub-jobs. A funded job can split into sub-jobs, either by carving out part of its own budget (free) or by locking new capital.</p>`}
    </div>`;

  const canPick = active && liveEntries.length > 0;

  return {
    title: j.title,
    crumbs,
    html: html`
      <div class="page-head">
        <div style="min-width:0">
          <div class="row" style="gap:8px;margin-bottom:10px">
            ${statusPill(j.status)} ${badge()} ${sourceBadge(j.budget_source)}
            <span class="pill grey nodot">${ic('team', 12)} ${j.team_name || 'Company-wide'}</span>
            ${j.depth > 1 ? html`<span class="pill grey nodot">level ${j.depth}</span>` : ''}
          </div>
          <h2>${j.title}</h2>
          <p style="white-space:pre-wrap">${j.requirements}</p>
          <p class="tiny faint" style="margin-top:6px">Posted by ${j.employer_name} · ${date(j.created_at)}</p>
        </div>
      </div>

      ${nestedBudgetHud}
      ${openCarve.length && active ? html`<div class="note blue" style="margin-bottom:16px">${ic('info')}<div>${openCarve.length} carve-out sub-job${openCarve.length > 1 ? 's are' : ' is'} still open. Close ${openCarve.length > 1 ? 'them' : 'it'} before paying a winner at this level. Refunds run bottom-up too.</div></div>` : ''}

      <div class="grid split">
        <div class="col" style="gap:16px">
          <div class="card">
            <div class="card-head">
              <h3>${ic('briefcase')} Entries <span class="tiny muted">${liveEntries.length}</span></h3>
              ${j.status === 'funded' ? html`<button class="btn sm primary" data-act="submit">${ic('plus', 14)} Submit an entry</button>` : ''}
            </div>
            ${j.status === 'draft' ? html`<div class="empty">${ic('lock')} Entries open once the payout is locked.</div>` : ''}
            ${j.status === 'in_review' ? html`<div class="note blue" style="margin-bottom:12px">${ic('eye')}<div>Review is open. Entries are read-only now. Pick exactly one winner.</div></div>` : ''}
            <div class="col" style="gap:12px">${d.submissions.map((s) => entryCard(s, d, canPick))}</div>
            ${j.status !== 'draft' && !d.submissions.length ? html`<div class="empty">No entries yet. Switch "Viewing as" to someone else and submit one.</div>` : ''}
          </div>
          ${subJobs}
        </div>
        <div class="col side-first" style="gap:16px">
          ${receipt}
          ${refundCard}
          ${escrowCard}
          ${hireCard}
          ${sponsorsCard}
          ${botsCard}
        </div>
      </div>`,

    mount(el) {
      on(el, 'click', '[data-act]', async (ev, t) => {
        const act = t.dataset.act;
        try {
          if (act === 'fund') await fund();
          if (act === 'review') { await post(`/jobs/${j.id}/review`); toast('Entries closed. Now pick one winner.'); ctx.refresh(); }
          if (act === 'cancel') cancel();
          if (act === 'submit') submitEntry();
          if (act === 'pick') pick(t.dataset.id);
          if (act === 'withdraw') { await post(`/submissions/${t.dataset.id}/withdraw`); toast('Entry withdrawn'); ctx.refresh(); }
          if (act === 'subjob') openSubJob(ctx, { id: j.id, title: j.title, currency: cur, rail: e.rail, remaining: budget.remaining });
          if (act === 'spin-bot') spinBot();
          if (act === 'promote') promote(t.dataset.id);
          if (act === 'seat-attach') {
            const r = await post(`/employments/${t.dataset.id}/seat-attach`, {});
            toast(r.already_active ? 'Company seat already active' : 'Company seat attached · $79/mo invoice paid (sim)');
            ctx.refresh();
          }
        } catch (ex) {
          toast(ex.message, 'err');
        }
      });
    },
  };

  /* ----- flows ----- */

  async function fund() {
    if (j.budget_source === 'parent_carveout') {
      return openModal({
        title: 'Allocate from parent budget',
        body: html`<p>Move <b>${money(e.amount, cur)}</b> from <b>${d.parent.title}</b> into this sub-job's escrow.</p>
          <div class="note" style="margin-top:12px">${ic('split')}<div>Moving money inside the company tree is <b>free</b>: carve-outs never trigger the 2.5% fee. It's only charged when a winner is paid.</div></div>`,
        foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>Allocate</button>`,
        onMount(m, close) {
          $('[data-go]', m).addEventListener('click', async () => {
            try { await post(`/jobs/${j.id}/fund`); close(); toast('Budget allocated. Entries are open.'); ctx.refresh(); } catch (ex) { toast(ex.message, 'err'); }
          });
        },
      });
    }
    if (e.rail !== 'onchain') {
      return openModal({
        title: 'Lock the payout',
        body: html`<p>Charge <b>${money(e.amount, cur)}</b> to ${e.payer_name}'s card and hold it in escrow until you pick a winner or cancel.</p>
          <div class="row" style="margin-top:14px;gap:10px">${ic('card')}<span class="mono">•••• 4242</span><span class="sim">simulated · no charge</span></div>
          <div class="note" style="margin-top:14px">${ic('lock')}<div>Locking is free. If nobody wins, you get the full amount back.</div></div>`,
        foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>${ic('lock')} Lock ${money(e.amount, cur)}</button>`,
        onMount(m, close) {
          $('[data-go]', m).addEventListener('click', async (ev) => {
            ev.currentTarget.disabled = true;
            try { await post(`/jobs/${j.id}/fund`); close(); toast('Payout locked. Entries are open.'); ctx.refresh(); } catch (ex) { toast(ex.message, 'err'); ev.currentTarget.disabled = false; }
          });
        },
      });
    }
    if (canGoReal) return realLock();
    simLock();
  }

  /** Real lock on Base Sepolia: connect → approve → lock → server verifies the tx. */
  function realLock() {
    const hasW = W.hasWallet();
    openModal({
      title: `Lock USDC on ${chainCfg.chain_name}`,
      body: html`
        <div class="row between" style="margin-bottom:12px">
          <div class="small">Real transaction with <b>test USDC</b> (no dollar value).</div>
          <span class="live">live · testnet</span>
        </div>
        ${hasW ? '' : html`<div class="note red" style="margin-bottom:12px">${ic('info')}<div>No browser wallet detected. Install MetaMask or Coinbase Wallet (or open this site in the wallet app), or use the simulation for now.</div></div>`}
        <div class="wsteps">
          <div class="wstep" data-s="0"><span class="n">1</span><div><b>Connect wallet</b><div class="tiny muted acct">Switches to ${chainCfg.chain_name} (${chainCfg.chain_id})</div></div></div>
          <div class="wstep" data-s="1"><span class="n">2</span><div><b>Approve ${money(e.amount, cur)}</b><div class="tiny muted">USDC ${short(chainCfg.usdc, 6, 4)} · skipped if already approved</div></div></div>
          <div class="wstep" data-s="2"><span class="n">3</span><div><b>Lock in the escrow contract</b><div class="tiny muted">lock(jobKey, amount) · fee 0 · ${short(chainCfg.escrow, 6, 4)}</div></div></div>
        </div>
        <div class="tx-out hidden note" style="margin-top:14px">${ic('check')}<div></div></div>`,
      foot: html`<button class="btn ghost" data-sim>Use simulation instead</button><button class="btn ghost" data-close>Close</button>
        <button class="btn blue" data-go ${hasW ? '' : raw('disabled')}>${ic('wallet')} Connect & lock</button>`,
      onMount(m, close) {
        const btn = $('[data-go]', m);
        const steps = m.querySelectorAll('.wstep');
        $('[data-sim]', m).addEventListener('click', async () => {
          try { await post(`/jobs/${j.id}/fund`); close(); toast('Locked (simulated). Entries are open.'); ctx.refresh(); } catch (ex) { toast(ex.message, 'err'); }
        });
        let done = false;
        btn.addEventListener('click', async () => {
          if (done) { close(); ctx.refresh(); return; }
          btn.disabled = true;
          try {
            steps[0].classList.add('run');
            const wc = await W.connect(chainCfg);
            const bal = await W.usdcBalance(wc, chainCfg);
            $('.acct', m).textContent = `${short(wc.account, 6, 4)} · ${W.formatUsdc(bal)} USDC`;
            steps[0].classList.replace('run', 'ok');
            steps[1].classList.add('run');
            const hash = await W.lock(wc, chainCfg, {
              jobId: j.id,
              amount: e.amount,
              onStep: (st) => {
                if (st === 'approved') steps[1].classList.replace('run', 'ok');
                if (st === 'lock') steps[2].classList.add('run');
              },
            });
            await post(`/jobs/${j.id}/fund`, { tx_hash: hash });
            steps[2].classList.replace('run', 'ok');
            const out = $('.tx-out', m);
            out.classList.remove('hidden');
            const url = W.txUrl(chainCfg, hash);
            out.lastElementChild.innerHTML = String(html`<div><b>${money(e.amount, cur)} locked on-chain.</b> Entries are open.
              <div style="margin-top:4px">${url ? html`<a class="hash" href="${url}" target="_blank" rel="noopener">${short(hash, 12, 8)} ↗ Basescan</a>` : html`<span class="hash">${hash}</span>`}</div></div>`);
            btn.textContent = 'Done';
            btn.disabled = false;
            done = true; // next click on the same button just closes
          } catch (ex) {
            steps.forEach((x) => x.classList.remove('run'));
            toast(W.walletError(ex), 'err');
            btn.disabled = false;
          }
        });
      },
    });
  }

  function simLock() {
    const payer = ctx.people.find((p) => p.id === e.payer_user_id);
    const wallet = (payer && payer.wallet_address) || '0x' + 'a1'.repeat(20);
    openModal({
      title: 'Lock USDC on Base (simulated)',
      body: html`
        <div class="row between" style="margin-bottom:14px">
          <div class="row" style="gap:10px">${ic('wallet')}<div><div class="small"><b>${e.payer_name}</b></div><div class="hash">${short(wallet, 8, 6)}</div></div></div>
          <span class="sim">simulated · nothing is broadcast</span>
        </div>
        <div class="wsteps">
          <div class="wstep" data-s="0"><span class="n">1</span><div><b>Connect wallet</b><div class="tiny muted">Network: Base (8453)</div></div></div>
          <div class="wstep" data-s="1"><span class="n">2</span><div><b>Approve ${money(e.amount, cur)}</b><div class="tiny muted">USDC · 0x8335…2913</div></div></div>
          <div class="wstep" data-s="2"><span class="n">3</span><div><b>Deposit into escrow contract</b><div class="tiny muted">lock(jobId, amount) · fee 0</div></div></div>
        </div>
        <div class="tx-out hidden note" style="margin-top:14px">${ic('check')}<div></div></div>`,
      foot: html`<button class="btn ghost" data-close>Close</button><button class="btn blue" data-go>${ic('wallet')} Confirm in wallet</button>`,
      onMount(m, close) {
        const btn = $('[data-go]', m);
        let done = false;
        btn.addEventListener('click', async () => {
          if (done) { close(); ctx.refresh(); return; }
          btn.disabled = true;
          const steps = m.querySelectorAll('.wstep');
          try {
            for (let i = 0; i < 2; i++) {
              steps[i].classList.add('run');
              await sleep(650);
              steps[i].classList.replace('run', 'ok');
            }
            steps[2].classList.add('run');
            const [r] = await Promise.all([post(`/jobs/${j.id}/fund`), sleep(800)]);
            steps[2].classList.replace('run', 'ok');
            const out = $('.tx-out', m);
            out.classList.remove('hidden');
            out.lastElementChild.innerHTML = String(html`<div><b>${money(e.amount, cur)} locked.</b> Entries are open.<div class="hash" style="margin-top:4px">tx ${short(r.tx_ref, 12, 8)}</div></div>`);
            btn.textContent = 'Done';
            btn.disabled = false;
            done = true; // next click on the same button just closes
          } catch (ex) {
            steps.forEach((s) => s.classList.remove('run'));
            toast(ex.message, 'err');
            btn.disabled = false;
          }
        });
      },
    });
  }

  function cancel() {
    const draft = j.status === 'draft';
    const expired = new Date(j.deadline_at) < new Date();
    openModal({
      title: draft ? 'Delete draft' : 'Cancel and refund',
      body: draft
        ? html`<p>Delete this draft? No money has moved yet.</p>`
        : html`<p>Return <b>${money(residual, cur)}</b> to ${j.budget_source === 'parent_carveout' ? 'the parent job budget' : e.payer_name}. <b>No fee</b> on refunds.</p>
          ${real && j.budget_source !== 'parent_carveout' ? html`<div class="note" style="margin-top:12px">${ic('wallet')}<div>This escrow is on-chain: your wallet will call <b>refund()</b> and the contract sends the USDC straight back.</div></div>` : ''}
          <div class="note" style="margin-top:12px">${ic('info')}<div>Refunds run bottom-up: every funded sub-job has to be closed first. Job-scoped bots stop.</div></div>`,
      foot: html`<button class="btn ghost" data-close>Keep it</button>
        ${!draft && expired ? html`<button class="btn" data-go="expired">Mark expired & refund</button>` : ''}
        <button class="btn danger" data-go="cancelled">${draft ? 'Delete' : 'Cancel & refund'}</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', async () => {
          try {
            let txHash;
            if (!draft && real && j.budget_source !== 'parent_carveout') {
              // Money is on-chain: the employer's wallet calls refund() first.
              b.disabled = true;
              b.textContent = 'Confirm in wallet…';
              const wc = await W.connect(chainCfg);
              if (d.chain.payer_wallet && wc.account.toLowerCase() !== d.chain.payer_wallet.toLowerCase()) {
                throw new Error(`Switch your wallet to ${short(d.chain.payer_wallet, 8, 6)}, the account that locked this escrow.`);
              }
              txHash = await W.refund(wc, chainCfg, { jobId: j.id });
            }
            const r = await post(`/jobs/${j.id}/cancel`, { reason: b.dataset.go, tx_hash: txHash });
            close();
            if (r.deleted) { toast('Draft deleted'); ctx.go(d.parent ? `/job/${d.parent.id}` : `/c/${j.workspace_id}/jobs`); return; }
            toast(`Refunded ${money(r.refund.amount, r.refund.currency)} (0 fee)`);
            ctx.refresh();
          } catch (ex) {
            close();
            toast(W.walletError(ex), 'err');
          }
        }));
      },
    });
  }

  async function submitEntry() {
    const bots = (await get(`/companies/${j.workspace_id}/bots`)).filter((b) => b.status === 'active');
    const people = ctx.people.filter((p) => p.id !== j.employer_user_id);
    const defaultWho = people.find((p) => p.id === ctx.viewer) ? `u:${ctx.viewer}` : people[0] ? `u:${people[0].id}` : '';
    const nameOf = (who) => {
      const [k, id] = who.split(':');
      return k === 'u' ? (people.find((p) => p.id === id) || {}).display_name : (bots.find((b) => b.id === id) || {}).name;
    };
    // Payouts go to the person's wallet, or a bot's operator's wallet.
    const payeeOf = (who) => {
      const [k, id] = who.split(':');
      if (k === 'u') return people.find((p) => p.id === id) || ctx.people.find((p) => p.id === id);
      const b = bots.find((x) => x.id === id);
      return b && ctx.people.find((p) => p.id === (b.config_json || {}).operator_user_id);
    };
    const walletOf = (who) => { const p = payeeOf(who); return p && p.wallet_address; };
    const suggest = (who) => `/demo-entry.html?${new URLSearchParams({ kind: /video/i.test(j.title) ? 'video' : who.startsWith('b:') ? 'bot' : 'service', title: j.title, by: nameOf(who) || 'Entrant' })}`;
    formModal({
      title: 'Submit an entry',
      submit: 'Submit entry',
      wide: true,
      body: html`
        <div class="form-grid">
          <label class="field span-2">Submit as
            <select name="who">
              <optgroup label="People">${people.map((p) => html`<option value="u:${p.id}" ${`u:${p.id}` === defaultWho ? raw('selected') : ''}>${p.display_name}</option>`)}</optgroup>
              ${bots.length ? html`<optgroup label="Bots (payout goes to operator)">${bots.map((b) => html`<option value="b:${b.id}">${b.name} · ${b.kind.replace('_', '-')}</option>`)}</optgroup>` : ''}
            </select>
          </label>
          <label class="field span-2">Live demo URL (the bid is the work)<input name="demo_url" required value="${suggest(defaultWho)}"></label>
          <label class="field span-2">Notes<textarea name="notes" placeholder="What did you ship? Anything the employer should try?"></textarea></label>
          ${e.rail === 'onchain' ? html`<label class="field span-2">Payout wallet (receives USDC if this entry wins)<input name="payout_wallet" placeholder="0x…" pattern="0x[0-9a-fA-F]{40}"></label>` : ''}
          <label class="field">Extra link label<input name="asset_label" placeholder="Repo"></label>
          <label class="field">Extra link URL<input name="asset_url" placeholder="https://github.com/…"></label>
        </div>
        <p class="tiny muted" style="margin-top:10px">Tip: the default URL is a built-in read-only preview, so the employer can see it right here.</p>`,
      onMount(m) {
        const sel = m.querySelector('[name=who]');
        const url = m.querySelector('[name=demo_url]');
        const pw = m.querySelector('[name=payout_wallet]');
        const fillWallet = () => { if (pw) pw.value = walletOf(sel.value) || ''; };
        sel.addEventListener('change', () => { if (url.value.startsWith('/demo-entry.html')) url.value = suggest(sel.value); fillWallet(); });
        fillWallet();
      },
      async handler(f) {
        const [k, id] = f.who.split(':');
        if (f.payout_wallet) {
          if (!/^0x[0-9a-fA-F]{40}$/.test(f.payout_wallet)) throw new Error('Payout wallet must be a 0x address (40 hex characters).');
          const p = payeeOf(f.who);
          if (p && (p.wallet_address || '').toLowerCase() !== f.payout_wallet.toLowerCase()) {
            await patch(`/people/${p.id}`, { wallet_address: f.payout_wallet });
          }
        }
        await post(`/jobs/${j.id}/submissions`, {
          submitter_user_id: k === 'u' ? id : undefined,
          submitter_bot_id: k === 'b' ? id : undefined,
          demo_url: f.demo_url,
          notes: f.notes,
          assets: f.asset_url ? [{ kind: 'link', url: f.asset_url, label: f.asset_label || 'Link' }] : [],
        });
        toast(`Entry submitted as ${nameOf(f.who)}`);
        ctx.refresh();
      },
    });
  }

  async function pick(submissionId) {
    const s = d.submissions.find((x) => x.id === submissionId);
    const bot = s.submitter_type === 'bot';
    const name = bot ? s.bot_name : s.submitter_name;
    const roles = await get(`/companies/${j.workspace_id}/roles`).catch(() => []);
    const f = feePreview(residual, cur, e.platform_fee_bps);
    const payeeId = bot ? s.bot_operator_id : s.submitter_user_id;
    const payeeName = bot ? s.bot_operator_name || 'operator' : name;
    const payeeWallet = bot ? s.bot_operator_wallet : s.submitter_wallet;
    formModal({
      title: `Pay ${name} and ${bot ? 'close the job' : 'hire'}`,
      submit: `Release ${money(f.net, cur)} to ${bot ? s.bot_operator_name || 'operator' : name}`,
      submitClass: 'green',
      body: html`
        ${!isEmployer ? html`<div class="note red" style="margin-bottom:12px">${ic('info')}<div>You're viewing as <b>${viewerName}</b>. Only ${j.employer_name} can pick the winner, so the server will refuse this.</div></div>` : ''}
        <div class="row" style="margin-bottom:12px">${avatar(name, { bot })}<div><b>${name}</b>${bot ? html`<div class="tiny muted">Bot. Payout goes to its operator, ${s.bot_operator_name || '(none set)'}</div>` : html`<div class="tiny muted">Hired into ${j.company_name} on a seat</div>`}</div></div>
        <div class="receipt" style="border-color:var(--line-2);background:var(--bg-2)">
          <div class="line"><span class="muted">Escrow</span><span>${money(e.amount, cur)}</span></div>
          ${paidCarve ? html`<div class="line"><span class="muted">Paid out via sub-jobs</span><span>− ${money(paidCarve, cur)}</span></div>` : ''}
          <div class="line"><span class="muted">Released now</span><span>${money(residual, cur)}</span></div>
          <div class="line"><span class="muted">Platform fee (${e.platform_fee_bps / 100}%)</span><span>− ${money(f.fee, cur)}</span></div>
          <div class="line total"><span>Winner receives</span><span>${money(f.net, cur)}</span></div>
        </div>
        ${!bot && roles.length ? html`<label class="field" style="margin-top:14px">Grant a role on hire (optional)
          <select name="role_id">${options(roles, { blank: 'No role yet' })}</select></label>` : ''}
        ${real ? html`<label class="field" style="margin-top:14px">${payeeName}'s wallet (receives the USDC)
          <input name="winner_wallet" required pattern="0x[0-9a-fA-F]{40}" value="${payeeWallet || ''}" placeholder="0x…"></label>
          <div class="note" style="margin-top:10px">${ic('wallet')}<div>Your wallet calls <b>release()</b> on the escrow contract. It pays the winner and sends 2.5% to the platform, on ${chainCfg.chain_name} with test USDC.</div></div>` : ''}
        <p class="tiny muted" style="margin-top:12px">Every other entry is marked "not selected". Job-scoped bots shut down unless they won.${e.rail === 'onchain' && !real ? ' The escrow contract releases USDC to the winner and sends 2.5% to the platform (simulated).' : ''}</p>`,
      async handler(fd) {
        let txHash;
        if (real) {
          if (!/^0x[0-9a-fA-F]{40}$/.test(fd.winner_wallet || '')) throw new Error('Enter the winner’s 0x wallet address.');
          if (!isEmployer) throw new Error(`Only ${j.employer_name} can pick the winner.`);
          if ((payeeWallet || '').toLowerCase() !== fd.winner_wallet.toLowerCase()) {
            await patch(`/people/${payeeId}`, { wallet_address: fd.winner_wallet });
          }
          const wc = await W.connect(chainCfg);
          if (d.chain.payer_wallet && wc.account.toLowerCase() !== d.chain.payer_wallet.toLowerCase()) {
            throw new Error(`Switch your wallet to ${short(d.chain.payer_wallet, 8, 6)}, the account that locked this escrow.`);
          }
          const paidUnits = d.children
            .filter((c) => c.budget_source === 'parent_carveout' && c.status === 'paid')
            .reduce((a, c) => a + unitsOf(c.amount), 0n);
          try {
            txHash = await W.release(wc, chainCfg, { fundingJobId: d.chain.funding_job_id, winner: fd.winner_wallet, units: unitsOf(e.amount) - paidUnits });
          } catch (ex) {
            throw new Error(W.walletError(ex));
          }
        }
        const r = await post(`/jobs/${j.id}/pay`, { submission_id: s.id, role_id: fd.role_id || undefined, tx_hash: txHash });
        toast(`Paid ${money(r.fee.net_to_winner, r.fee.currency)} to ${r.payee.display_name}${r.employment ? ', hired into the company' : ''}`);
        ctx.refresh();
      },
    });
  }

  function spinBot() {
    formModal({
      title: 'Spin up a job-scoped bot',
      submit: 'Spin up',
      body: html`
        <div class="stack">
          <label class="field">Bot name<input name="name" required value="Scout-${Math.floor(Math.random() * 90 + 10)}"></label>
          <label class="field">Operator (gets paid if the bot wins)<select name="operator_user_id">${options(ctx.people.filter((p) => p.id !== j.employer_user_id), { label: 'display_name' })}</select></label>
          <label class="field">Model<input name="model" value="claude-sonnet-5"></label>
          <p class="small muted">A job-scoped bot lives only for this job. When the winner is picked it shuts down, unless it won and gets promoted into a role.</p>
        </div>`,
      async handler(f) {
        await post(`/companies/${j.workspace_id}/bots`, { ...f, kind: 'job_scoped', job_id: j.id });
        toast(`${f.name} is live on this job`);
        ctx.refresh();
      },
    });
  }

  async function promote(botId) {
    const roles = await get(`/companies/${j.workspace_id}/roles`);
    formModal({
      title: 'Promote bot into a role',
      submit: 'Promote',
      body: html`<div class="stack">
        <label class="field">Role<select name="role_id">${options(roles)}</select></label>
        <label class="field inline"><input type="checkbox" name="as_lead" value="1"> Make it the role's lead bot (one per role)</label>
      </div>`,
      async handler(f) {
        await post(`/bots/${botId}/promote`, { role_id: f.role_id, as_lead: Boolean(f.as_lead) });
        toast('Bot promoted');
        ctx.refresh();
      },
    });
  }
}
