import { html, ic, avatar, money, usd, date, ago, toast, on } from '../ui.js';
import { get, patch } from '../api.js';

export default async function seats(ctx) {
  const cid = ctx.company.id;
  const { seat_price_usd: price, employments } = await get(`/companies/${cid}/employments`);
  const count = (s) => employments.filter((e) => e.seat_status === s).length;
  const active = count('active');
  const tenure = (e) => {
    const from = e.seat_started_at || e.started_at;
    const to = e.ended_at || new Date();
    return Math.max(0, Math.floor((new Date(to) - new Date(from)) / 864e5));
  };

  return {
    title: 'Company seats',
    html: html`
      <div class="page-head">
        <div><h2>Company seats</h2><p>Every human winner is hired into the company on a seat. Seats start as pending, become active once billing starts (plan: $${price}/mo), and churned seats add their retention days to the person's reputation.</p></div>
      </div>
      <div class="grid c4" style="margin-bottom:16px">
        <div class="stat"><div class="k">${ic('seat')} Company seats</div><div class="v">${employments.length}</div><div class="s">hired from contests</div></div>
        <div class="stat green"><div class="k">${ic('check')} Active seats</div><div class="v">${active}</div><div class="s">${count('pending')} pending · ${count('churned')} churned</div></div>
        <div class="stat gold"><div class="k">${ic('card')} Seat MRR (est.)</div><div class="v">${usd(active * price)}</div><div class="s">${usd(active * price * 12)} ARR</div></div>
        <div class="stat"><div class="k">${ic('star')} Conversion</div><div class="v">${employments.length ? Math.round((active / employments.length) * 100) : 0}%</div><div class="s">model assumes 40%</div></div>
      </div>
      <div class="card flush">
        ${employments.length ? html`<div class="table-wrap"><table class="t">
          <thead><tr><th>Member</th><th>Hired from</th><th>Role</th><th>Seat</th><th class="r">Won</th><th class="r">Tenure</th><th>Hired</th></tr></thead>
          <tbody>${employments.map((e) => html`
            <tr>
              <td><div class="row" style="flex-wrap:nowrap">${avatar(e.employee_name, { sm: true })}<b>${e.employee_name}</b></div></td>
              <td><a href="#/job/${e.job_id}">${e.job_title}</a></td>
              <td class="small">${e.role_name || html`<span class="faint">—</span>`}</td>
              <td>
                <select data-act="seat" data-id="${e.id}" style="width:auto;padding:5px 30px 5px 9px;font-size:.84rem">
                  ${['pending', 'active', 'churned'].map((s) => html`<option value="${s}" ${s === e.seat_status ? 'selected' : ''}>${s}</option>`)}
                </select>
                <div class="tiny faint">${e.seat_plan || 'workspace_member'} · $${price}/mo</div>
              </td>
              <td class="r num">${e.net_to_winner ? money(e.net_to_winner, e.currency) : '—'}</td>
              <td class="r num">${tenure(e)}d</td>
              <td class="small muted">${date(e.started_at)}<div class="tiny faint">${ago(e.started_at)}</div></td>
            </tr>`)}</tbody></table></div>`
          : html`<div style="padding:18px"><div class="empty">No seats yet. Pay a human winner on any job and they'll show up here.</div></div>`}
      </div>
      <div class="note" style="margin-top:14px">${ic('info')}<div>Seat billing is a stub in this demo. It turns on once custodial payments are live. Seats are always billed to the company, never to a sub-team.</div></div>`,
    mount(el) {
      on(el, 'change', 'select[data-act=seat]', async (_e, s) => {
        try {
          await patch(`/employments/${s.dataset.id}`, { seat_status: s.value });
          toast(s.value === 'churned' ? 'Seat churned. Retention days added to reputation.' : `Seat ${s.value}`);
          ctx.refresh();
        } catch (ex) { toast(ex.message, 'err'); }
      });
    },
  };
}
