import {
  html, raw, ic, money, statusPill, railBadge, sourceBadge, avatar, date, ago, short,
  openModal, formModal, options, toast, on, sleep, $,
} from '../ui.js';
import { get, post } from '../api.js';
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
    ${steps.map(([, label], i) => html`<div class="st ${i < idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><span class="dot">${i < idx ? raw(`<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#1d1404" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`) : ''}</span>${label}</div>`)}
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
  const paidCarve = d.children.filter((c) => c.budget_source === 'parent_carveout' && c.status === 'paid')
    .reduce((a, c) => a + Number(c.amount), 0);
  const openCarve = d.children.filter((c) => c.budget_source === 'parent_carveout' && ['funded', 'in_review'].includes(c.status));
  const residual = Number(e.amount) - paidCarve;
  const pct = (x) => `${Math.max(0, Math.min(100, (Number(x) / Number(e.amount)) * 100))}%`;

  const crumbs = html`<a href="#/c/${j.workspace_id}" style="color:inherit">${j.company_name}</a>${d.parent ? html` › <a href="#/job/${d.parent.id}" style="color:inherit">${d.parent.title}</a>` : ''}`;

  /* ----- escrow actions ----- */
  const actions = [];
  if (j.status === 'draft') {
    actions.push(j.budget_source === 'parent_carveout'
      ? html`<button class="btn primary" data-act="fund">${ic('split')} Allocate from parent (0 fee)</button>`
      : e.rail === 'onchain'
        ? html`<button class="btn blue" data-act="fund">${ic('wallet')} Lock ${money(e.amount, cur)} with wallet</button>`
        : html`<button class="btn primary" data-act="fund">${ic('lock')} Lock ${money(e.amount, cur)}</button>`);
    actions.push(html`<button class="btn danger sm" data-act="cancel">Delete draft</button>`);
  }
  if (j.status === 'funded') actions.push(html`<button class="btn" data-act="review">${ic('eye')} Close entries → review</button>`);
  if (active) actions.push(html`<button class="btn danger sm" data-act="cancel">${ic('refund', 14)} Cancel & refund</button>`);

  const escrowCard = html`
    <div class="card">
      <div class="card-head"><h3>${ic('lock')} Escrow</h3>${railBadge(e.rail)}</div>
      <div class="escrow-amt num">${Number(e.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}<span class="cur">${cur}</span></div>
      <div class="tiny muted" style="margin-bottom:14px">${j.budget_source === 'parent_carveout' ? 'Carved out of the parent escrow' : j.budget_source === 'expansion' ? 'Expansion: new capital, its own escrow' : 'Full payout locked by the employer'}</div>
      ${timeline(j.status)}
      <div class="divider"></div>
      <dl class="kv">
        <dt>Payer</dt><dd>${e.payer_name}</dd>
        <dt>Employer</dt><dd>${j.employer_name}${isEmployer ? ' (you)' : ''}</dd>
        ${e.escrow_ref ? html`<dt>Escrow ref</dt><dd class="hash" title="${e.escrow_ref}">${short(e.escrow_ref, 14, 6)}</dd>` : ''}
        ${meta.lock_tx ? html`<dt>Lock tx</dt><dd class="hash" title="${meta.lock_tx}">${short(meta.lock_tx, 10, 6)} <span class="sim">sim</span></dd>` : ''}
        ${meta.chain ? html`<dt>Network</dt><dd>Base (chain ${meta.chain_id}) · USDC</dd>` : ''}
        ${e.funded_at ? html`<dt>Locked</dt><dd>${date(e.funded_at)}</dd>` : ''}
        <dt>Deadline</dt><dd>${date(j.deadline_at)} · ${ago(j.deadline_at)}</dd>
        <dt>Platform fee</dt><dd>${e.platform_fee_bps / 100}% on release only</dd>
      </dl>
      ${actions.length ? html`<div class="divider"></div><div class="row">${actions}</div>` : ''}
      ${!isEmployer && (j.status === 'draft' || active) ? html`<p class="tiny muted" style="margin-top:10px">Only ${j.employer_name} can move this money. Switch "Viewing as" to try.</p>` : ''}
    </div>`;

  const receipt = j.status === 'paid' ? html`
    <div class="receipt">
      <div class="row between"><h3 style="font-size:1rem">${ic('trophy')} Payout receipt</h3>${railBadge(e.rail)}</div>
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
        ${meta.release_tx ? html`<dt>Release tx</dt><dd class="hash" title="${meta.release_tx}">${short(meta.release_tx, 10, 6)} <span class="sim">sim</span></dd>` : ''}
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
        ${meta.refund_tx ? html`<dt>Refund tx</dt><dd class="hash">${short(meta.refund_tx, 10, 6)} <span class="sim">sim</span></dd>` : ''}
      </dl>
    </div>` : '';

  const hireCard = d.employment ? html`
    <div class="card">
      <div class="card-head"><h3>${ic('seat')} Hired</h3><span class="pill ${d.employment.seat_status === 'active' ? 'paid' : d.employment.seat_status === 'churned' ? 'grey' : 'funded'}">seat ${d.employment.seat_status}</span></div>
      <div class="row">${avatar(d.employment.employee_name)}<div><b>${d.employment.employee_name}</b><div class="tiny muted">joined ${j.company_name}${d.employment.role_name ? ` as ${d.employment.role_name}` : ''}</div></div></div>
      <a class="btn sm" style="margin-top:12px" href="#/c/${j.workspace_id}/seats">Manage seat ($79/mo plan) →</a>
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
            ${statusPill(j.status)} ${railBadge(e.rail)} ${sourceBadge(j.budget_source)}
            <span class="pill grey nodot">${ic('team', 12)} ${j.team_name || 'Company-wide'}</span>
            ${j.depth > 1 ? html`<span class="pill grey nodot">level ${j.depth}</span>` : ''}
          </div>
          <h2>${j.title}</h2>
          <p style="white-space:pre-wrap">${j.requirements}</p>
          <p class="tiny faint" style="margin-top:6px">Posted by ${j.employer_name} · ${date(j.created_at)}</p>
        </div>
      </div>

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
    const payer = ctx.people.find((p) => p.id === e.payer_user_id);
    const wallet = (payer && payer.wallet_address) || '0x' + 'a1'.repeat(20);
    openModal({
      title: 'Lock USDC on Base',
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
        btn.addEventListener('click', async () => {
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
            btn.onclick = () => { close(); ctx.refresh(); };
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
          <div class="note" style="margin-top:12px">${ic('info')}<div>Refunds run bottom-up: every funded sub-job has to be closed first. Job-scoped bots stop.</div></div>`,
      foot: html`<button class="btn ghost" data-close>Keep it</button>
        ${!draft && expired ? html`<button class="btn" data-go="expired">Mark expired & refund</button>` : ''}
        <button class="btn danger" data-go="cancelled">${draft ? 'Delete' : 'Cancel & refund'}</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', async () => {
          try {
            const r = await post(`/jobs/${j.id}/cancel`, { reason: b.dataset.go });
            close();
            if (r.deleted) { toast('Draft deleted'); ctx.go(d.parent ? `/job/${d.parent.id}` : `/c/${j.workspace_id}/jobs`); return; }
            toast(`Refunded ${money(r.refund.amount, r.refund.currency)} (0 fee)`);
            ctx.refresh();
          } catch (ex) {
            close();
            toast(ex.message, 'err');
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
          <label class="field">Extra link label<input name="asset_label" placeholder="Repo"></label>
          <label class="field">Extra link URL<input name="asset_url" placeholder="https://github.com/…"></label>
        </div>
        <p class="tiny muted" style="margin-top:10px">Tip: the default URL is a built-in read-only preview, so the employer can see it right here.</p>`,
      onMount(m) {
        const sel = m.querySelector('[name=who]');
        const url = m.querySelector('[name=demo_url]');
        sel.addEventListener('change', () => { if (url.value.startsWith('/demo-entry.html')) url.value = suggest(sel.value); });
      },
      async handler(f) {
        const [k, id] = f.who.split(':');
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
    formModal({
      title: `Pay ${name} and ${bot ? 'close the job' : 'hire'}`,
      submit: `Release ${money(f.net, cur)} to ${bot ? s.bot_operator_name || 'operator' : name}`,
      submitClass: 'green',
      body: html`
        ${!isEmployer ? html`<div class="note red" style="margin-bottom:12px">${ic('info')}<div>You're viewing as <b>${viewerName}</b>. Only ${j.employer_name} can pick the winner, so the server will refuse this.</div></div>` : ''}
        <div class="row" style="margin-bottom:12px">${avatar(name, { bot })}<div><b>${name}</b>${bot ? html`<div class="tiny muted">Bot. Payout goes to its operator, ${s.bot_operator_name || '(none set)'}</div>` : html`<div class="tiny muted">Becomes an employee of ${j.company_name}</div>`}</div></div>
        <div class="receipt" style="border-color:var(--line-2);background:var(--bg-2)">
          <div class="line"><span class="muted">Escrow</span><span>${money(e.amount, cur)}</span></div>
          ${paidCarve ? html`<div class="line"><span class="muted">Paid out via sub-jobs</span><span>− ${money(paidCarve, cur)}</span></div>` : ''}
          <div class="line"><span class="muted">Released now</span><span>${money(residual, cur)}</span></div>
          <div class="line"><span class="muted">Platform fee (${e.platform_fee_bps / 100}%)</span><span>− ${money(f.fee, cur)}</span></div>
          <div class="line total"><span>Winner receives</span><span>${money(f.net, cur)}</span></div>
        </div>
        ${!bot && roles.length ? html`<label class="field" style="margin-top:14px">Grant a role on hire (optional)
          <select name="role_id">${options(roles, { blank: 'No role yet' })}</select></label>` : ''}
        <p class="tiny muted" style="margin-top:12px">Every other entry is marked "not selected". Job-scoped bots shut down unless they won.${e.rail === 'onchain' ? ' The escrow contract releases USDC to the winner and sends 2.5% to the platform (simulated).' : ''}</p>`,
      async handler(fd) {
        const r = await post(`/jobs/${j.id}/pay`, { submission_id: s.id, role_id: fd.role_id || undefined });
        toast(`Paid ${money(r.fee.net_to_winner, r.fee.currency)} to ${r.payee.display_name}${r.employment ? ', hired' : ''}`);
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
