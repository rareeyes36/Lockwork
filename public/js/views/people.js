import { html, ic, avatar, short, formModal, toast, on, $$ } from '../ui.js';
import { get, post, patch } from '../api.js';

const TABS = [['all', 'Everyone'], ['employer', 'Employers'], ['employee', 'Company members'], ['sponsor', 'Sponsors'], ['entrant', 'Entrants']];

function tags(p) {
  const t = [];
  if (p.is_owner || p.jobs_posted) t.push('employer');
  if (p.employments) t.push('employee');
  if (p.sponsorships) t.push('sponsor');
  if (p.entries) t.push('entrant');
  return t;
}

export default async function people(ctx) {
  const cid = ctx.company.id;
  const list = await get(`/companies/${cid}/people`);
  let tab = 'all';

  const card = (p) => {
    const tg = tags(p);
    return html`
    <div class="card tight">
      <div class="row" style="flex-wrap:nowrap">
        ${avatar(p.display_name)}
        <div style="min-width:0">
          <div class="row" style="gap:6px"><b>${p.display_name}</b>${p.id === ctx.viewer ? html`<span class="pill gold nodot">you</span>` : ''}</div>
          <div class="tiny muted">@${p.handle}${p.wallet_address ? html` · <span class="hash">${short(p.wallet_address, 6, 4)}</span>` : ''}</div>
        </div>
        <span class="grow"></span>
        <button class="btn sm ghost" data-act="wallet" data-id="${p.id}" title="Set payout wallet">${ic('wallet', 14)}</button>
      </div>
      <div class="row" style="gap:6px;margin-top:12px">
        ${p.is_owner ? html`<span class="pill gold">${ic('crown', 12)} Owner / employer</span>` : tg.includes('employer') ? html`<span class="pill gold">Employer</span>` : ''}
        ${(p.employments || []).map((e) => html`<span class="pill ${e.seat_status === 'active' ? 'paid' : e.seat_status === 'churned' ? 'grey' : 'funded'}">Company seat · ${e.seat_status}</span>`)}
        ${(p.sponsorships || []).map((s) => html`<span class="pill violet">Sponsor · ${s.name}</span>`)}
        ${!tg.length ? html`<span class="pill grey">No link to this company yet</span>` : ''}
      </div>
      ${(p.roles || []).length ? html`<div class="row" style="gap:6px;margin-top:10px">${ic('badge', 14)}${p.roles.map((r) => html`<span class="chip">${r.name}</span>`)}</div>` : ''}
      ${(p.operates || []).length ? html`<div class="row" style="gap:6px;margin-top:8px">${ic('bot', 14)}<span class="tiny muted">operates</span>${p.operates.map((b) => html`<span class="chip">${b.name}</span>`)}</div>` : ''}
      <div class="row small muted" style="gap:14px;margin-top:12px">
        <span>${ic('trophy', 14)} ${p.wins_count} wins</span>
        <span>${ic('briefcase', 14)} ${p.entries} entries</span>
        ${p.jobs_posted ? html`<span>${ic('lock', 14)} ${p.jobs_posted} posted</span>` : ''}
      </div>
    </div>`;
  };

  const grid = () => {
    const rows = list.filter((p) => tab === 'all' || tags(p).includes(tab));
    return rows.length ? html`<div class="grid c3">${rows.map(card)}</div>` : html`<div class="empty">Nobody here yet.</div>`;
  };

  return {
    title: 'People',
    html: html`
      <div class="page-head">
        <div><h2>People</h2><p>Employer, company member and sponsor are roles, not account types. Anyone can fill them, and the same person can hold different roles in different companies and jobs.</p></div>
        <button class="btn primary" data-act="add">${ic('plus')} Add person</button>
      </div>
      <div class="seg" id="tabs" style="margin-bottom:16px">${TABS.map(([v, l]) => html`<button data-v="${v}" class="${v === tab ? 'on' : ''}">${l}</button>`)}</div>
      <div id="grid">${grid()}</div>`,
    mount(el) {
      el.querySelector('#tabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        tab = b.dataset.v;
        $$('#tabs button', el).forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#grid').innerHTML = String(grid());
      });
      on(el, 'click', '[data-act=wallet]', (_e, t) => {
        const p = list.find((x) => x.id === t.dataset.id);
        formModal({
          title: `Wallet for ${p.display_name}`,
          submit: 'Save wallet',
          body: html`<label class="field">Wallet address (receives USDC payouts; for employers, the wallet that locks escrow)
            <input name="wallet_address" value="${p.wallet_address || ''}" placeholder="0x…" pattern="0x[0-9a-fA-F]{40}"></label>
            <p class="tiny muted" style="margin-top:8px">On the testnet these are test funds. Any address works for receiving; use one you control to see payouts arrive.</p>`,
          async handler(f) {
            if (f.wallet_address && !/^0x[0-9a-fA-F]{40}$/.test(f.wallet_address)) throw new Error('Must be a 0x address with 40 hex characters.');
            await patch(`/people/${p.id}`, { wallet_address: f.wallet_address || null });
            toast('Wallet saved');
            ctx.refresh();
          },
        });
      });
      on(el, 'click', '[data-act=add]', () => formModal({
        title: 'Add a person',
        submit: 'Add',
        body: html`<div class="form-grid">
          <label class="field span-2">Display name<input name="display_name" required placeholder="e.g. Jordan Blake"></label>
          <label class="field">Handle<input name="handle" placeholder="jordan"></label>
          <label class="field">Email<input name="email" type="email" placeholder="optional"></label>
          <label class="field span-2">Wallet (for the USDC rail)<input name="wallet_address" placeholder="0x… (optional)"></label>
        </div>`,
        async handler(f) {
          const p = await post('/people', { ...f, handle: f.handle || undefined, email: f.email || undefined, wallet_address: f.wallet_address || undefined });
          toast(`${p.display_name} added. Pick them in "Viewing as" to act as them.`);
          ctx.refresh();
        },
      }));
    },
  };
}
