import { html, ic, avatar, money, date, formModal, options, toast, on, raw } from '../ui.js';
import { get, post, patch } from '../api.js';

const KINDS = [
  ['contributing', 'Contributing: labor, reviews, assets'],
  ['financing', 'Financing: funds payout or tops up escrow'],
  ['software', 'Software: seats, licenses, plugin access'],
  ['materials', 'Materials: print-on-demand, manufacture'],
  ['services', 'Services: shipping, other real-world fulfilment'],
];
const NEXT = { pledged: ['locked', 'refunded'], locked: ['released', 'refunded'] };

export default async function sponsors(ctx) {
  const cid = ctx.company.id;
  const [list, jobs, invPayload] = await Promise.all([
    get(`/companies/${cid}/sponsors`),
    get(`/jobs?company_id=${cid}`),
    get(`/companies/${cid}/placement-invoices`).catch(() => ({ invoices: [] })),
  ]);
  const invoices = invPayload.invoices || [];
  const liveJobs = jobs.filter((j) => !j.status.endsWith('refunded'));
  const bps = ctx.config.placement_fee_bps;
  const paidInv = invoices.filter((i) => i.state === 'paid').length;

  const feeLine = (c) => {
    const amt = c.placement_fee_amount != null
      ? Number(c.placement_fee_amount)
      : (Number(c.amount) * (c.placement_fee_bps || bps)) / 10000;
    return money(amt, c.currency);
  };

  const card = (s) => {
    const committed = s.contributions.filter((c) => ['locked', 'released'].includes(c.state)).reduce((a, c) => a + Number(c.amount), 0);
    return html`
    <div class="card">
      <div class="row" style="flex-wrap:nowrap">
        ${avatar(s.name)}
        <div style="min-width:0"><b>${s.name}</b><div class="tiny muted">${s.job_id ? html`Job: <a href="#/job/${s.job_id}">${s.job_title}</a>` : 'Company-wide'}${s.sponsor_person ? ` · ${s.sponsor_person}` : ''}</div></div>
        <span class="grow"></span>
        <button class="btn sm" data-act="contrib" data-id="${s.id}">${ic('plus', 14)} Contribution</button>
      </div>
      <div class="row" style="gap:6px;margin-top:10px">${s.kinds.map((k) => html`<span class="chip">${k}</span>`)}</div>
      ${s.details ? html`<p class="small muted" style="margin-top:10px">${s.details}</p>` : ''}
      <div class="divider"></div>
      ${s.contributions.length ? html`<div class="table-wrap"><table class="t" style="font-size:.84rem">
        <thead><tr><th>Job</th><th>Kind</th><th class="r">Amount</th><th class="r">Placement fee</th><th>State</th><th>Billing</th></tr></thead>
        <tbody>${s.contributions.map((c) => html`<tr>
          <td><a href="#/job/${c.job_id}">${c.job_title}</a><div class="tiny faint">${date(c.created_at)}</div></td>
          <td>${c.kind.replace('_', '-')}</td>
          <td class="r num"><b>${money(c.amount, c.currency)}</b></td>
          <td class="r num muted">${feeLine(c)} <span class="tiny">(${(c.placement_fee_bps || bps) / 100}%)</span></td>
          <td><div class="row" style="gap:6px">
            <span class="pill ${c.state === 'locked' ? 'funded' : c.state === 'released' ? 'paid' : c.state === 'refunded' ? 'refunded' : 'grey'}">${c.state}</span>
            ${c.state === 'pledged' ? html`
              <button class="btn sm primary" data-act="attach" data-id="${c.id}">${ic('card', 14)} Lock &amp; pay fee</button>
              <button class="btn sm ghost" data-act="state" data-id="${c.id}" data-v="refunded">Refund</button>
            ` : (NEXT[c.state] || []).map((n) => html`<button class="btn sm ghost" data-act="state" data-id="${c.id}" data-v="${n}">${n === 'locked' ? 'Lock' : n === 'released' ? 'Release' : 'Refund'}</button>`)}
          </div></td>
          <td>
            ${c.placement_fee_state === 'paid' ? html`<span class="pill paid">fee paid</span><div class="tiny faint">${c.placement_rail || 'custodial_sim'} (sim)</div>`
              : c.placement_fee_state === 'open' ? html`
                <span class="pill funded">fee open</span>
                <button class="btn sm primary" style="margin-top:4px" data-act="pay-inv" data-id="${c.placement_invoice_id}">Pay fee</button>
              `
              : c.state === 'refunded' ? html`<span class="tiny muted">no fee (unwind)</span>`
              : html`<span class="tiny muted">—</span>`}
          </td>
        </tr>`)}</tbody></table></div>
        <div class="small muted" style="margin-top:8px">Committed: <b>${money(committed, 'USD')}</b></div>`
        : html`<p class="small muted">No contributions yet.</p>`}
    </div>`;
  };

  return {
    title: 'Sponsors',
    html: html`
      <div class="page-head">
        <div><h2>Sponsors</h2><p>Sponsors co-fund escrow or supply software, materials and real-world fulfilment. They can back the whole company or a single job. A placement fee of ${bps / 100}% applies when financing locks — separate from the 2.5% release fee. Charges persist as invoices (custodial-sim until Stripe).</p></div>
        <button class="btn primary" data-act="new">${ic('plus')} Add sponsor</button>
      </div>
      <div class="note" style="margin-bottom:16px">${ic('shield')}<div><b>Sponsors never pick the winner.</b> To check, set "Viewing as" to <b>Priya Nair</b>, open a locked job and click "Pick as winner". The server refuses with a 403. Placement refunds do not invent a platform release fee.</div></div>
      ${paidInv ? html`<div class="small muted" style="margin-bottom:12px">${paidInv} placement invoice${paidInv === 1 ? '' : 's'} paid (sim).</div>` : ''}
      ${list.length ? html`<div class="grid c2">${list.map(card)}</div>` : html`<div class="empty">No sponsors yet.</div>`}`,
    mount(el) {
      on(el, 'click', '[data-act]', async (_e, t) => {
        try {
          if (t.dataset.act === 'attach') {
            t.disabled = true;
            const r = await post(`/contributions/${t.dataset.id}/placement-attach`, {});
            toast(r.already_attached
              ? 'Placement already attached'
              : `Locked · placement fee ${money(r.invoice.amount, r.invoice.currency)} paid (sim)`);
            ctx.refresh();
          }
          if (t.dataset.act === 'pay-inv') {
            t.disabled = true;
            const r = await post(`/placement-invoices/${t.dataset.id}/pay`, {});
            toast(`Placement fee ${money(r.invoice.amount, r.invoice.currency)} paid (sim)`);
            ctx.refresh();
          }
          if (t.dataset.act === 'state') { await patch(`/contributions/${t.dataset.id}`, { state: t.dataset.v }); toast(`Contribution ${t.dataset.v}`); ctx.refresh(); }
          if (t.dataset.act === 'new') {
            formModal({
              title: 'Add a sponsor',
              submit: 'Add sponsor',
              wide: true,
              body: html`<div class="form-grid">
                <label class="field">Name<input name="name" required placeholder="e.g. Base Builders Fund"></label>
                <label class="field">Person (optional)<select name="sponsor_user_id">${options(ctx.people, { blank: 'Not linked', label: 'display_name' })}</select></label>
                <div class="field span-2"><span>Kinds (one or more)</span>
                  <div class="col" style="gap:6px">${KINDS.map(([v, l], i) => html`<label class="field inline"><input type="checkbox" name="kinds" value="${v}" ${i === 1 ? raw('checked') : ''}> ${l}</label>`)}</div>
                </div>
                <label class="field span-2">Scope<select name="job_id">${options(liveJobs, { blank: 'Whole company', label: 'title' })}</select></label>
                <label class="field span-2">Details<textarea name="details" placeholder="What are they putting in?"></textarea></label>
              </div>
              <p class="tiny muted" style="margin-top:10px">A sponsor doesn't have to be a legal company. Anyone can play the role.</p>`,
              async handler(f) {
                await post(`/companies/${cid}/sponsors`, { ...f, kinds: [].concat(f.kinds || []), job_id: f.job_id || undefined, sponsor_user_id: f.sponsor_user_id || undefined });
                toast('Sponsor added');
                ctx.refresh();
              },
            });
          }
          if (t.dataset.act === 'contrib') {
            const s = list.find((x) => x.id === t.dataset.id);
            const jobsFor = s.job_id ? liveJobs.filter((j) => j.id === s.job_id) : liveJobs;
            formModal({
              title: `Contribution from ${s.name}`,
              submit: 'Pledge & attach',
              body: html`<div class="form-grid">
                <label class="field span-2">Job<select name="job_id">${options(jobsFor, { label: (j) => `${j.title} (${j.currency})` })}</select></label>
                <label class="field">Kind<select name="kind"><option value="co_lock">Co-lock escrow</option><option value="top_up">Top-up</option><option value="placement">Placement</option></select></label>
                <label class="field">Amount<input name="amount" type="number" min="1" step="0.01" value="1000" required></label>
              </div>
              <p class="small muted" style="margin-top:10px">Pledges, then locks and pays the ${bps / 100}% placement fee in one flow (custodial-sim). Platform release fee stays 2.5% on winner payout only.</p>`,
              async handler(f) {
                const j = jobsFor.find((x) => x.id === f.job_id);
                const pledged = await post(`/sponsors/${s.id}/contributions`, { ...f, currency: j && j.currency });
                const r = await post(`/contributions/${pledged.id}/placement-attach`, {});
                toast(`Attached · fee ${money(r.invoice.amount, r.invoice.currency)} paid (sim)`);
                ctx.refresh();
              },
            });
          }
        } catch (ex) { toast(ex.message, 'err'); }
      });
    },
  };
}
