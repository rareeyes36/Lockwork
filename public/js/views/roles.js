import { html, ic, avatar, formModal, options, toast, on } from '../ui.js';
import { get, post, del } from '../api.js';

export default async function roles(ctx) {
  const cid = ctx.company.id;
  const [list, bots] = await Promise.all([get(`/companies/${cid}/roles`), get(`/companies/${cid}/bots`)]);
  const byParent = {};
  list.forEach((r) => { (byParent[r.parent_role_id || 'root'] ||= []).push(r); });

  const roleCard = (r, depth) => html`
    <div class="card tight" style="margin-left:${depth * 26}px;${depth ? 'border-left:3px solid var(--line-2)' : ''}">
      <div class="row between">
        <div class="row" style="gap:8px">
          <b style="font-size:1.02rem">${r.name}</b>
          ${r.can_mint_roles ? html`<span class="pill gold nodot">${ic('badge', 12)} can mint roles</span>` : ''}
        </div>
        <div class="row" style="gap:6px">
          <button class="btn sm" data-act="assign" data-id="${r.id}">${ic('plus', 14)} Assign</button>
          <button class="btn sm ghost" data-act="child" data-id="${r.id}">Sub-role</button>
        </div>
      </div>
      <div class="row" style="gap:10px;margin-top:12px">
        <span class="tiny muted" style="width:70px">Lead bot</span>
        ${r.lead_bot
          ? html`<span class="chip">${ic('crown', 13)} ${r.lead_bot.name} <span class="pill ${r.lead_bot.status === 'active' ? 'green' : 'grey'}">${r.lead_bot.status}</span></span>`
          : html`<button class="btn sm ghost" data-act="lead" data-id="${r.id}">${ic('bot', 14)} Empty slot: set a lead bot</button>`}
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <span class="tiny muted" style="width:70px">Holders</span>
        ${r.assignments.length ? r.assignments.map((a) => html`<span class="chip">${a.principal_type === 'bot' ? ic('bot', 13) : ''}${a.name}<button class="x" data-act="unassign" data-id="${a.id}" aria-label="Remove">×</button></span>`) : html`<span class="small faint">Nobody yet</span>`}
      </div>
    </div>
    ${(byParent[r.id] || []).map((c) => roleCard(c, depth + 1))}`;

  const assignModal = (role) => formModal({
    title: `Assign "${role.name}"`,
    submit: 'Assign',
    body: html`<label class="field">Person or bot
      <select name="who">
        <optgroup label="People">${ctx.people.map((p) => html`<option value="u:${p.id}">${p.display_name}</option>`)}</optgroup>
        ${bots.length ? html`<optgroup label="Bots">${bots.map((b) => html`<option value="b:${b.id}">${b.name} (${b.kind.replace('_', '-')})</option>`)}</optgroup>` : ''}
      </select></label>`,
    async handler(f) {
      const [k, id] = f.who.split(':');
      await post(`/roles/${role.id}/assignments`, k === 'u' ? { user_id: id } : { bot_agent_id: id });
      toast('Role assigned');
      ctx.refresh();
    },
  });

  const newRole = (parentId) => formModal({
    title: 'Create a role',
    submit: 'Create role',
    body: html`<div class="stack">
      <label class="field">Role name<input name="name" required placeholder="e.g. Video Editor"></label>
      <label class="field">Reports to<select name="parent_role_id">${options(list, { blank: 'Top level', selected: parentId })}</select></label>
      <label class="field inline"><input type="checkbox" name="can_mint_roles" value="1"> Holders can create more roles</label>
      <div class="note">${ic('info')}<div>Only the owner or someone holding a role that can mint roles can create roles. You're acting as <b>${ctx.viewerPerson ? ctx.viewerPerson.display_name : '—'}</b>.</div></div>
    </div>`,
    async handler(f) {
      await post(`/companies/${cid}/roles`, { name: f.name, parent_role_id: f.parent_role_id || null, can_mint_roles: Boolean(f.can_mint_roles) });
      toast('Role created');
      ctx.refresh();
    },
  });

  const leadModal = (role) => formModal({
    title: `Lead bot for "${role.name}"`,
    submit: 'Set lead bot',
    body: html`<div class="stack">
      <label class="field">Promote an existing bot<select name="bot_id">${options(bots, { blank: '— or create a new one below —', label: (b) => `${b.name} (${b.kind.replace('_', '-')})` })}</select></label>
      <label class="field">…or new bot name<input name="name" placeholder="e.g. Atlas-Lead"></label>
      <label class="field">Operator<select name="operator_user_id">${options(ctx.people, { label: 'display_name', selected: ctx.viewer })}</select></label>
      <p class="small muted">A lead bot can manage the bots and people under its role. Each role gets at most one, and the database enforces that.</p>
    </div>`,
    async handler(f) {
      if (f.bot_id) {
        await post(`/bots/${f.bot_id}/promote`, { role_id: role.id, as_lead: true });
      } else {
        if (!f.name) throw new Error('Pick a bot or name a new one.');
        const b = await post(`/companies/${cid}/bots`, { name: f.name, kind: 'lead', managing_role_id: role.id, operator_user_id: f.operator_user_id });
        await post(`/roles/${role.id}/assignments`, { bot_agent_id: b.id });
      }
      toast('Lead bot set');
      ctx.refresh();
    },
  });

  return {
    title: 'Roles',
    html: html`
      <div class="page-head">
        <div><h2>Roles</h2><p>Roles are sets of capabilities that people or bots can hold. Roles form a hierarchy, holders of a minting role can create sub-roles, and each role has one lead-bot slot.</p></div>
        <button class="btn primary" data-act="new">${ic('plus')} New role</button>
      </div>
      <div class="col" style="gap:12px">
        ${(byParent.root || []).length ? (byParent.root || []).map((r) => roleCard(r, 0)) : html`<div class="empty">No roles yet.</div>`}
      </div>
      <div class="row" style="margin-top:16px;gap:8px">${avatar(ctx.viewerPerson ? ctx.viewerPerson.display_name : '?', { sm: true })}<span class="small muted">Acting as ${ctx.viewerPerson ? ctx.viewerPerson.display_name : '—'}. Switch "Viewing as" to someone without a minting role to see creating a role get blocked.</span></div>`,
    mount(el) {
      on(el, 'click', '[data-act]', async (_e, t) => {
        const role = list.find((r) => r.id === t.dataset.id);
        try {
          if (t.dataset.act === 'new') newRole();
          if (t.dataset.act === 'child') newRole(role.id);
          if (t.dataset.act === 'assign') assignModal(role);
          if (t.dataset.act === 'lead') leadModal(role);
          if (t.dataset.act === 'unassign') { await del(`/role-assignments/${t.dataset.id}`); toast('Removed'); ctx.refresh(); }
        } catch (ex) { toast(ex.message, 'err'); }
      });
    },
  };
}

