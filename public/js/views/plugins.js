import { html, ic, date, formModal, options, toast, on } from '../ui.js';
import { get, post, patch } from '../api.js';

const ICON = { video_edit: 'video', daw: 'music', ide: 'code', repo: 'repo' };
const WHAT = {
  video_edit: 'Entries are cuts and timelines; the demo view is a player.',
  daw: 'Entries are stems and sessions; the demo view is audio playback.',
  ide: 'Entries run in a cloud IDE; the demo view is a live preview.',
  repo: 'Entries are branches or PRs; the demo view is the diff plus CI status.',
};

export default async function plugins(ctx) {
  const cid = ctx.company.id;
  const [list, sponsors] = await Promise.all([get(`/companies/${cid}/plugins`), get(`/companies/${cid}/sponsors`)]);
  const softwareSponsors = sponsors.filter((s) => s.kinds.includes('software'));

  const card = (p) => html`
    <div class="card">
      <div class="row" style="flex-wrap:nowrap">
        <span class="avatar" style="background:${p.status === 'subscribed' ? 'var(--gold)' : 'var(--panel-3)'};color:${p.status === 'subscribed' ? 'var(--gold-ink)' : 'var(--muted)'}">${ic(ICON[p.key] || 'plug', 18)}</span>
        <div><b>${p.name}</b><div class="tiny muted">${p.description}</div></div>
        <span class="grow"></span>
        ${p.status === 'subscribed' ? html`<span class="pill paid">Subscribed</span>` : p.status === 'paused' ? html`<span class="pill grey">Paused</span>` : html`<span class="pill grey nodot">Not subscribed</span>`}
      </div>
      <p class="small muted" style="margin-top:12px">${WHAT[p.key] || ''}</p>
      ${p.sponsored_by ? html`<div class="row" style="margin-top:10px">${ic('hand', 14)}<span class="small">Seats underwritten by <b>${p.sponsored_by}</b></span></div>` : ''}
      ${p.subscribed_at ? html`<div class="tiny faint" style="margin-top:6px">since ${date(p.subscribed_at)}</div>` : ''}
      <div class="row" style="margin-top:14px;gap:8px">
        ${!p.subscription_id ? html`<button class="btn sm primary" data-act="sub" data-id="${p.id}">${ic('plus', 14)} Subscribe</button>` : ''}
        ${p.status === 'subscribed' ? html`<button class="btn sm" data-act="pause" data-id="${p.subscription_id}">${ic('pause', 14)} Pause</button>` : ''}
        ${p.status === 'paused' ? html`<button class="btn sm" data-act="resume" data-id="${p.subscription_id}">${ic('play', 14)} Resume</button>` : ''}
      </div>
    </div>`;

  return {
    title: 'Plugins',
    html: html`
      <div class="page-head">
        <div><h2>Plugins</h2><p>Plugins decide where the work gets made and what the read-only demo view looks like for a job type. A company subscribes to them, and a sponsor can underwrite them (software sponsorship).</p></div>
      </div>
      <div class="grid c2">${list.map(card)}</div>
      <div class="note" style="margin-top:16px">${ic('info')}<div>In v1, subscribing is an entitlement stub. Deep embeds (a real DAW, video editor or IDE) come later. Pausing keeps the subscription row but turns it off for new jobs.</div></div>`,
    mount(el) {
      on(el, 'click', '[data-act]', async (_e, t) => {
        try {
          if (t.dataset.act === 'sub') {
            if (!softwareSponsors.length) {
              await post(`/companies/${cid}/plugins`, { plugin_id: t.dataset.id });
              toast('Subscribed');
              return ctx.refresh();
            }
            formModal({
              title: 'Subscribe',
              submit: 'Subscribe',
              body: html`<label class="field">Underwritten by (optional)<select name="sponsor_id">${options(softwareSponsors, { blank: 'Company pays' })}</select></label>`,
              async handler(f) {
                await post(`/companies/${cid}/plugins`, { plugin_id: t.dataset.id, sponsor_id: f.sponsor_id || undefined });
                toast('Subscribed');
                ctx.refresh();
              },
            });
          }
          if (t.dataset.act === 'pause') { await patch(`/company-plugins/${t.dataset.id}`, { status: 'paused' }); toast('Paused'); ctx.refresh(); }
          if (t.dataset.act === 'resume') { await patch(`/company-plugins/${t.dataset.id}`, { status: 'subscribed' }); toast('Resumed'); ctx.refresh(); }
        } catch (ex) { toast(ex.message, 'err'); }
      });
    },
  };
}
