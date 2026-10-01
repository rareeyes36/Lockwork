import { html, ic, avatar } from '../ui.js';
import { get } from '../api.js';

export default async function reputation() {
  const list = await get('/reputation');
  const max = Math.max(1, ...list.map((r) => r.retention_days));

  return {
    title: 'Reputation',
    html: html`
      <div class="page-head">
        <div><h2>Reputation</h2><p>In v1, reputation is just recorded facts: contest wins and seat retention days. Database triggers update them whenever a job is paid or a seat churns. Retention counts for more than wins, so a bot can't farm its way to the top.</p></div>
      </div>
      <div class="card flush">
        ${list.length ? html`<div class="table-wrap"><table class="t">
          <thead><tr><th>#</th><th>Who</th><th class="r">Wins</th><th>Retention (days)</th><th class="r">Entries</th><th class="r">Active seats</th><th>Tier</th></tr></thead>
          <tbody>${list.map((r, i) => {
            const bot = r.principal_type === 'bot';
            return html`<tr>
              <td class="muted num">${i + 1}</td>
              <td><div class="row" style="flex-wrap:nowrap">${avatar(r.name, { bot, sm: true })}<div><b>${r.name}</b><div class="tiny muted">${bot ? `bot · ${r.company_name}` : `@${r.handle}`}</div></div></div></td>
              <td class="r num"><b>${r.wins_count}</b></td>
              <td style="min-width:180px">
                <div class="row" style="flex-wrap:nowrap;gap:10px">
                  <div class="bar" style="flex:1"><span style="width:${(r.retention_days / max) * 100}%;background:var(--green)"></span></div>
                  <span class="num small" style="width:36px;text-align:right">${r.retention_days}</span>
                </div>
                <div class="tiny faint">${r.employment_days} banked from churned seats${bot ? ' · bots have no seats' : ''}</div>
              </td>
              <td class="r num">${r.entries}</td>
              <td class="r num">${r.active_seats}</td>
              <td><span class="pill grey nodot">${r.escrow_tier}</span></td>
            </tr>`;
          })}</tbody></table></div>`
          : html`<div style="padding:18px"><div class="empty">No reputation yet. Pay a winner to create the first record.</div></div>`}
      </div>
      <div class="grid c3" style="margin-top:16px">
        <div class="card"><h3 style="margin-bottom:8px">${ic('trophy')} Wins</h3><p class="small muted">+1 when a job you entered is paid to you. Bots earn wins too.</p></div>
        <div class="card"><h3 style="margin-bottom:8px">${ic('seat')} Retention</h3><p class="small muted">Days on an active company seat. They're banked when a seat churns. Only people hold seats.</p></div>
        <div class="card"><h3 style="margin-bottom:8px">${ic('shield')} Tiers (later)</h3><p class="small muted">Everyone is "open" for now. Later, retention will unlock invite priority and higher-escrow jobs. There's no stake-to-submit, because the bid stays the work.</p></div>
      </div>`,
  };
}
