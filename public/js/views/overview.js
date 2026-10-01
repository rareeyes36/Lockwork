import { html, ic, usd, money, statusPill, railBadge, ago } from '../ui.js';
import { get } from '../api.js';

const ACT = {
  job_posted: ['briefcase', 'posted'],
  locked: ['lock', 'locked'],
  carved_out: ['split', 'carved out'],
  entry: ['arrow', 'new entry'],
  paid: ['trophy', 'paid'],
  refunded: ['refund', 'refunded'],
  hired: ['seat', 'hired'],
  seat_attached: ['card', 'seat attached'],
  sponsored: ['hand', 'sponsored'],
};

export default async function overview(ctx) {
  const cid = ctx.company.id;
  const [stats, activity, jobs] = await Promise.all([
    get(`/stats?company_id=${cid}`),
    get(`/companies/${cid}/activity`),
    get(`/jobs?company_id=${cid}`),
  ]);
  const open = jobs.filter((j) => ['funded', 'in_review', 'draft'].includes(j.status));

  return {
    title: 'Overview',
    html: html`
      <div class="page-head">
        <div>
          <h2>${ctx.company.name}</h2>
          <p>Owner: ${ctx.company.owner_name}. ${ctx.company.team_count} sub-teams, ${stats.jobs_total} jobs. Every amount below comes from escrow rows in Postgres.</p>
        </div>
        <div class="row">
          <a class="btn" href="#/c/${cid}/tree">${ic('tree')} Org tree</a>
          <a class="btn" href="#/c/${cid}/jobs">${ic('briefcase')} All jobs</a>
        </div>
      </div>

      <div class="grid c4">
        <div class="stat gold"><div class="k">${ic('lock')} Locked in escrow</div><div class="v">${usd(stats.locked)}</div><div class="s">${stats.jobs_open} open jobs · USDC counted 1:1</div></div>
        <div class="stat green"><div class="k">${ic('trophy')} Paid to winners</div><div class="v">${usd(stats.paid_to_winners)}</div><div class="s">${stats.jobs_paid} winners · ${usd(stats.released)} released</div></div>
        <div class="stat"><div class="k">${ic('bolt')} Platform fees (2.5%)</div><div class="v">${usd(stats.fees)}</div><div class="s">charged on release only</div></div>
        <div class="stat"><div class="k">${ic('refund')} Refunded</div><div class="v">${usd(stats.refunded)}</div><div class="s">${stats.jobs_refunded} jobs · 0 fee</div></div>
        <div class="stat"><div class="k">${ic('seat')} Active seats</div><div class="v">${stats.seats.active}</div><div class="s">${stats.seats.pending} pending · ${stats.seats.churned} churned</div></div>
        <div class="stat"><div class="k">${ic('card')} Seat MRR (est.)</div><div class="v">${usd(stats.seats.mrr_estimate)}</div><div class="s">$${stats.seats.seat_price_usd}/mo per active seat</div></div>
        <div class="stat"><div class="k">${ic('hand')} Sponsor committed</div><div class="v">${usd(stats.sponsors.committed)}</div><div class="s">${usd(stats.sponsors.placement_fees_paid || stats.sponsors.placement_fees)} placement fees paid @ 5%</div></div>
        <div class="stat"><div class="k">${ic('bot')} Active bots</div><div class="v">${stats.bots_active}</div><div class="s">${stats.roles} roles · ${stats.plugins} plugins</div></div>
      </div>

      <div class="grid split" style="margin-top:18px">
        <div class="card flush">
          <div class="card-head" style="padding:16px 18px 0"><h3>${ic('briefcase')} Open and draft jobs</h3><a class="small" href="#/c/${cid}/jobs">View all →</a></div>
          ${open.length ? html`<div class="table-wrap"><table class="t">
            <thead><tr><th>Job</th><th>Status</th><th>Rail</th><th class="r">Escrow</th><th class="r">Entries</th></tr></thead>
            <tbody>${open.map((j) => html`
              <tr class="click" data-href="#/job/${j.id}">
                <td><b>${j.title}</b>${j.depth > 1 ? html` <span class="tiny faint">· level ${j.depth}</span>` : ''}<div class="tiny muted">${j.team_name || 'Company-wide'} · closes ${ago(j.deadline_at)}</div>
                ${j.depth > 1 && j.parent_remaining != null ? html`<div class="tiny" style="color:var(--violet)">Parent remaining ${money(j.parent_remaining, j.parent_currency)} · carve-out fee $0</div>` : ''}</td>
                <td>${statusPill(j.status)}</td>
                <td>${railBadge(j.rail, { sim: false })}</td>
                <td class="r num"><b>${money(j.amount, j.currency)}</b></td>
                <td class="r num">${j.entries}</td>
              </tr>`)}</tbody></table></div>` : html`<div style="padding:18px"><div class="empty">No open jobs. Post one from the top bar.</div></div>`}
        </div>

        <div class="col">
          <div class="card">
            <div class="card-head"><h3>${ic('bolt')} Demo path</h3></div>
            <ol class="small" style="margin:0;padding-left:18px;color:var(--text-2)">
              <li>Open <b>Pitch deck polish</b> and lock it on USDC · Base.</li>
              <li>Switch <b>Viewing as</b> to Leo and submit an entry.</li>
              <li>Switch back to Dante, then close entries and pick the winner.</li>
              <li>Check the receipt: 2.5% fee, winner net, tx hash, new seat.</li>
              <li>Try it as <b>Priya</b> (a sponsor): picking a winner is blocked.</li>
            </ol>
          </div>
          <div class="card">
            <div class="card-head"><h3>${ic('info')} Activity</h3></div>
            <div class="col" style="gap:9px">
              ${activity.slice(0, 12).map((a) => {
                const [icn, verb] = ACT[a.kind] || ['info', a.kind];
                return html`<a class="row small" style="gap:9px;color:var(--text-2);flex-wrap:nowrap" href="#/job/${a.job_id}">
                  <span style="color:var(--muted);flex:none">${ic(icn, 15)}</span>
                  <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${a.who ? a.who + ' · ' : ''}</b>${verb} <span class="muted">${a.title}</span>${a.amount ? html` · <b class="num">${money(a.amount, a.currency)}</b>` : ''}</span>
                  <span class="grow"></span><span class="tiny faint nowrap">${ago(a.at)}</span></a>`;
              })}
            </div>
          </div>
        </div>
      </div>`,
    mount(el) {
      el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href.slice(1); }));
    },
  };
}
