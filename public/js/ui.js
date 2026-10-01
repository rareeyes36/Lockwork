// Tiny UI toolkit: escaped templates, formatting, icons, modal, toast.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function val(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

/** Tagged template: interpolations are escaped unless wrapped in raw()/html``. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? val(vals[i]) : ''); });
  return new Raw(out);
}

/* ---------- formatting ---------- */

export function money(amount, currency = 'USD', { compact = false } = {}) {
  const n = Number(amount || 0);
  const opts = compact && Math.abs(n) >= 10000
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 };
  const s = n.toLocaleString('en-US', opts);
  return String(currency).toUpperCase() === 'USDC' ? `${s} USDC` : `$${s}`;
}
export const usd = (n) => money(n, 'USD');
export const short = (s, a = 6, b = 4) => (!s ? '' : s.length <= a + b + 1 ? s : `${s.slice(0, a)}…${s.slice(-b)}`);

export function date(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function ago(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const fut = s < 0;
  const a = Math.abs(s);
  const [n, u] = a < 60 ? [a, 's'] : a < 3600 ? [a / 60, 'm'] : a < 86400 ? [a / 3600, 'h'] : [a / 86400, 'd'];
  const v = `${Math.floor(n)}${u}`;
  return fut ? `in ${v}` : `${v} ago`;
}

const HUES = ['#0B1F3A', '#1B4F8A', '#334155', '#0D7A4F', '#475569', '#15355C', '#0E7490', '#64748B'];
function hue(key) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
export function avatar(name, { bot = false, sm = false, key } = {}) {
  const ini = String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="avatar ${bot ? 'bot' : ''} ${sm ? 'sm' : ''}" style="background:${hue(key || name)}">${bot ? raw(icon('bot', 16)) : ini}</span>`;
}

const STATUS_LABEL = {
  draft: 'Draft', funded: 'Locked', in_review: 'In review', paid: 'Paid',
  expired_refunded: 'Expired · refunded', cancelled_refunded: 'Cancelled · refunded',
};
export function statusPill(status) {
  const cls = status && status.endsWith('refunded') ? 'refunded' : status;
  return html`<span class="pill ${cls}">${STATUS_LABEL[status] || status}</span>`;
}
export function railBadge(rail, { sim = true } = {}) {
  return rail === 'onchain'
    ? html`<span class="pill blue nodot">${raw(icon('chain', 12))} USDC · Base</span>${sim ? html` <span class="sim">sim</span>` : ''}`
    : html`<span class="pill grey nodot">${raw(icon('card', 12))} Card · USD</span>`;
}
export function sourceBadge(src) {
  if (src === 'parent_carveout') return html`<span class="pill violet nodot">carve-out</span>`;
  if (src === 'expansion') return html`<span class="pill gold nodot">expansion</span>`;
  return '';
}

/* ---------- icons (inline SVG, stroke = currentColor) ---------- */

const P = {
  lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.3" r="1.4"/><path d="M12 16.7v1.6"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  tree: '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4M6 16v-4h12v4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.6c2.3.2 4 1.9 4.5 4.4"/>',
  badge: '<path d="M12 3l2.4 1.6 2.9-.1.9 2.8 2.3 1.8-.9 2.8.9 2.8-2.3 1.8-.9 2.8-2.9-.1L12 21l-2.4-1.6-2.9.1-.9-2.8-2.3-1.8.9-2.8-.9-2.8 2.3-1.8.9-2.8 2.9.1z"/><path d="M9 12l2 2 4-4"/>',
  bot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.3" cy="13.3" r="1.2"/><circle cx="14.7" cy="13.3" r="1.2"/><path d="M2.5 13v2M21.5 13v2"/>',
  seat: '<path d="M7 4h7a3 3 0 0 1 3 3v6H7z"/><path d="M5 13h14v3H5zM7 16v4M17 16v4"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  hand: '<path d="M3 13h3l3.5-2.5h3.2a1.6 1.6 0 0 1 0 3.2H10"/><path d="M6 19h7.5l6.5-5a1.7 1.7 0 0 0-2.3-2.4L14 14"/><path d="M3 11v10"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8 11h2M12 11h0M16 11h0M8 15h2M12 15h0M16 15v3M8 18h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  refund: '<path d="M4 10h11a5 5 0 0 1 0 10H9"/><path d="M8 6l-4 4 4 4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>',
  split: '<path d="M12 21v-7M12 14L6 8M12 14l6-6M6 8V4M18 8V4M4 6l2-2 2 2M16 6l2-2 2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>',
  shield: '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="3.5" y="8" width="17" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.2"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  repo: '<path d="M6 4h11a1 1 0 0 1 1 1v13H7.5A1.5 1.5 0 0 0 6 19.5z"/><path d="M6 19.5A1.5 1.5 0 0 0 7.5 21H18M9 8h6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  crown: '<path d="M4 8l4 4 4-7 4 7 4-4-2 11H6z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  team: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>',
  company: '<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2"/>',
};
export function icon(name, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export const ic = (name, size) => raw(icon(name, size));

/** Brand mark: padlock; the gear tooth only as secondary texture on the shackle. */
export function logo(size = 28) {
  return raw(`<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
    <path d="M10 14V10.5a6 6 0 0 1 12 0V14" fill="none" stroke="#0B1F3A" stroke-width="3" stroke-linecap="round"/>
    <path d="M15 3.4h2v2.2h-2z" fill="#0B1F3A" opacity=".45"/>
    <rect x="5.5" y="13" width="21" height="16" rx="4.5" fill="#0B1F3A"/>
    <circle cx="16" cy="20" r="2.4" fill="#ffffff"/><rect x="15" y="21" width="2" height="4.2" rx="1" fill="#ffffff"/>
  </svg>`);
}

/* ---------- DOM helpers ---------- */

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** Delegated events: on(root, 'click', '[data-act=pay]', (e, target) => …). */
export function on(root, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
}

export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (k in o) o[k] = [].concat(o[k], v);
    else o[k] = v;
  }
  return o;
}

/** Segmented control: <div class="seg" data-name="rail"><button data-v="custodial">…</button></div> */
export function bindSeg(root, onChange) {
  $$('.seg[data-name]', root).forEach((seg) => {
    const input = root.querySelector(`input[name="${seg.dataset.name}"]`);
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      e.preventDefault();
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      if (input) input.value = b.dataset.v;
      onChange && onChange(seg.dataset.name, b.dataset.v);
    });
  });
}

/* ---------- toast ---------- */

export function toast(msg, kind = 'ok') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
}

/* ---------- modal ---------- */

/**
 * openModal({ title, body, foot, wide, onMount(el, close) }) → close()
 * body/foot are html`` values.
 */
export function openModal({ title, body, foot, wide, onMount }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = String(html`
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}" style="${wide ? 'max-width:720px' : ''}">
      <div class="mh"><h3>${title}</h3><button class="x-btn" data-close aria-label="Close">×</button></div>
      <div class="mb">${body}</div>
      ${foot ? html`<div class="mf">${foot}</div>` : ''}
    </div>`);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  // Focus synchronously: a delayed focus can steal the caret from a field the
  // person (or a test) already started typing in.
  const first = bg.querySelector('input:not([type=hidden]), select, textarea');
  if (first) first.focus();
  onMount && onMount(bg.querySelector('.modal'), close);
  return close;
}

/**
 * Form modal: submits formData to handler; shows handler errors inline.
 * handler(data, el) may return a promise; on resolve the modal closes.
 */
export function formModal({ title, body, submit = 'Save', submitClass = 'primary', wide, onMount, handler }) {
  return openModal({
    title, wide,
    body: html`<form class="mform">${body}<div class="form-err hidden"></div><button type="submit" class="hidden"></button></form>`,
    foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn ${submitClass}" data-submit>${submit}</button>`,
    onMount(el, close) {
      const form = $('form', el);
      const err = $('.form-err', el);
      const btn = $('[data-submit]', el);
      bindSeg(form);
      const go = async (e) => {
        e && e.preventDefault();
        err.classList.add('hidden');
        btn.disabled = true;
        try {
          await handler(formData(form), el, close);
          close();
        } catch (ex) {
          err.textContent = ex.message;
          err.classList.remove('hidden');
        } finally {
          btn.disabled = false;
        }
      };
      form.addEventListener('submit', go);
      btn.addEventListener('click', go);
      onMount && onMount(el, close);
    },
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function options(list, { value = 'id', label = 'name', selected, blank } = {}) {
  return html`${blank !== undefined ? html`<option value="">${blank}</option>` : ''}${list.map((x) => html`<option value="${x[value]}" ${String(x[value]) === String(selected) ? raw('selected') : ''}>${typeof label === 'function' ? label(x) : x[label]}</option>`)}`;
}
