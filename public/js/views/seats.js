import { html, ic, avatar, money, usd, date, ago, toast, on } from '../ui.js';
import { get, patch, post } from '../api.js';

export default async function seats(ctx) {
  const cid = ctx.company.id;
  const { seat_price_usd: price, seat_billing, employments } = await get(`/companies/${cid}/employments`);
  const invoicesPayload = await get(`/companies/${cid}/seat-invoices`).catch(() => ({ invoices: [] }));
  const invoices = invoicesPayload.invoices || [];
  const count = (s) => employments.filter((e) => e.seat_status === s).length;
  const active = count('active');
  const paidInv = invoices.filter((i) => i.state === 'paid').length;
  const tenure = (e) => {
    const from = e.seat_started_at || e.started_at;
    const to = e.ended_at || new Date();
    return Math.max(0, Math.floor((new Date(to) - new Date(from)) / 864e5));
  };
  const simNote = seat_billing?.stripe_live
    ? 'Stripe live billing is on.'
    : 'Charges persist as company invoices. Payment is custodial-sim until Stripe is wired — no real card charge yet.';

  return {
    title: 'Company seats',
    html: html`
      <div class="page-head">
        <div><h2>Company seats</h2><p>After a human winner is hired into the company, attach a company seat at $${price}/mo. Seats start pending, become active once the seat invoice is paid, and churned seats bank retention days toward reputation.</p></div>
      </div>
      <div class="grid c4" style="margin-bottom:16px">
        <div class="stat"><div class="k">${ic('seat')} Company seats</div><div class="v">${employments.length}</div><div class="s">hired from contests</div></div>
        <div class="stat green"><div class="k">${ic('check')} Active seats</div><div class="v">${active}</div><div class="s">${count('pending')} pending · ${count('churned')} churned</div></div>
        <div class="stat gold"><div class="k">${ic('card')} Seat MRR (est.)</div><div class="v">${usd(active * price)}</div><div class="s">${usd(active * price * 12)} ARR · ${paidInv} paid invoice${paidInv === 1 ? '' : 's'}</div></div>
        <div class="stat"><div class="k">${ic('star')} Conversion</div><div class="v">${employments.length ? Math.round((active / employments.length) * 100) : 0}%</div><div class="s">model assumes 40%</div></div>
      </div>
      <div class="card flush">
        ${employments.length ? html`<div class="table-wrap"><table class="t">
          <thead><tr><th>Member</th><th>Hired from</th><th>Role</th><th>Seat</th><th class="r">Won</th><th class="r">Tenure</th><th>Billing</th></tr></thead>
          <tbody>${employments.map((e) => html`
            <tr>
              <td><div class="row" style="flex-wrap:nowrap">${avatar(e.employee_name, { sm: true })}<b>${e.employee_name}</b></div></td>
              <td><a href="#/job/${e.job_id}">${e.job_title}</a></td>
              <td class="small">${e.role_name || html`<span class="faint">—</span>`}</td>
              <td>
                <span class="pill ${e.seat_status === 'active' ? 'paid' : e.seat_status === 'churned' ? 'grey' : 'funded'}">${e.seat_status}</span>
                <div class="tiny faint">${e.seat_plan || 'workspace_member'} · $${price}/mo</div>
                <div class="tiny muted">${date(e.started_at)} · ${ago(e.started_at)}</div>
              </td>
              <td class="r num">${e.net_to_winner ? money(e.net_to_winner, e.currency) : '—'}</td>
              <td class="r num">${tenure(e)}d</td>
              <td>
                ${e.seat_status === 'pending' ? html`
                  <button class="btn sm primary" data-act="attach" data-id="${e.id}">${ic('card', 14)} Attach &amp; pay $${price}</button>
                  <div class="tiny faint" style="margin-top:4px">Records invoice + activates seat</div>
                ` : e.seat_status === 'active' ? html`
                  <div class="tiny">${e.paid_invoice_count || 0} paid · company-billed</div>
                  <button class="btn sm" style="margin-top:6px" data-act="churn" data-id="${e.id}">Churn seat</button>
                ` : html`<span class="tiny muted">Final · re-hire via a new job</span>`}
              </td>
            </tr>`)}</tbody></table></div>`
          : html`<div style="padding:18px"><div class="empty">No seats yet. Pay a human winner on any job and they'll show up here.</div></div>`}
      </div>
      ${invoices.length ? html`
      <div class="card" style="margin-top:14px">
        <div class="card-head"><h3>${ic('card')} Seat invoices</h3><span class="pill grey">${invoices.length}</span></div>
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Ref</th><th>Member</th><th>Plan</th><th class="r">Amount</th><th>State</th><th>Rail</th><th>When</th></tr></thead>
          <tbody>${invoices.slice(0, 20).map((i) => html`
            <tr>
              <td class="tiny mono">${i.invoice_ref || i.id.slice(0, 8)}</td>
              <td>${i.employee_name}</td>
              <td class="small">${i.plan}</td>
              <td class="r num">${usd(Number(i.amount))}</td>
              <td><span class="pill ${i.state === 'paid' ? 'paid' : i.state === 'void' ? 'grey' : 'funded'}">${i.state}</span></td>
              <td class="tiny">${i.rail}${i.rail === 'custodial_sim' ? ' (sim)' : ''}</td>
              <td class="small muted">${date(i.paid_at || i.created_at)}</td>
            </tr>`)}</tbody></table></div>
      </div>` : ''}
      <div class="note" style="margin-top:14px">${ic('info')}<div>${simNote} Seats are always billed to the company, never to a sub-team. Copy: company seat / hired into company — not EoR agency language.</div></div>`,
    mount(el) {
      on(el, 'click', 'button[data-act=attach]', async (_e, btn) => {
        btn.disabled = true;
        try {
          const r = await post(`/employments/${btn.dataset.id}/seat-attach`, {});
          toast(r.already_active
            ? 'Company seat already active'
            : `Company seat attached · $${price}/mo invoice paid (sim)`);
          ctx.refresh();
        } catch (ex) {
          btn.disabled = false;
          toast(ex.message, 'err');
        }
      });
      on(el, 'click', 'button[data-act=churn]', async (_e, btn) => {
        if (!confirm('Churn this company seat? Retention days will bank to reputation.')) return;
        btn.disabled = true;
        try {
          await patch(`/employments/${btn.dataset.id}`, { seat_status: 'churned' });
          toast('Seat churned. Retention days added to reputation.');
          ctx.refresh();
        } catch (ex) {
          btn.disabled = false;
          toast(ex.message, 'err');
        }
      });
    },
  };
}
