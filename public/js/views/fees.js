// Interactive fee calculator: the $10k tree from OPEN_DECISIONS.md (D1).

import { html, ic, usd } from '../ui.js';

const BPS = 250;
const fee = (x) => Math.floor(Math.round(x * 100) * BPS / 10000) / 100;

function compute({ root, a, b, payA, payB, payRoot }) {
  const residual = Math.max(0, root - a - b);
  const leaves = (payA ? a : 0) + (payB ? b : 0);
  const d1 = fee(leaves) + (payRoot ? fee(residual) : 0);
  const carveTax = fee(a) + fee(b) + d1;
  const doubleDip = fee(root) + fee(leaves);
  const net = leaves + (payRoot ? residual : 0) - d1;
  const refunded = (payA ? 0 : a) + (payB ? 0 : b) + (payRoot ? 0 : residual);
  return { residual, leaves, d1, carveTax, doubleDip, net, refunded };
}

export default async function fees() {
  const s = { root: 10000, a: 4000, b: 3000, payA: true, payB: false, payRoot: false };

  const out = () => {
    const r = compute(s);
    const max = Math.max(r.d1, r.carveTax, r.doubleDip, 1);
    const bar = (v, color) => html`<div class="bar" style="height:14px"><span style="width:${(v / max) * 100}%;background:${color}"></span></div>`;
    return html`
      <div class="card">
        <div class="card-head"><h3>${ic('calc')} Result</h3><span class="pill gold nodot">2.5% on outward payouts only</span></div>
        <div class="grid fit">
          <div class="stat green"><div class="k">Winners receive</div><div class="v">${usd(r.net)}</div></div>
          <div class="stat gold"><div class="k">Lockwork fee (D1)</div><div class="v">${usd(r.d1)}</div></div>
          <div class="stat"><div class="k">Refunded (0 fee)</div><div class="v">${usd(r.refunded)}</div></div>
        </div>
        <div class="divider"></div>
        <div class="col" style="gap:14px">
          <div><div class="row between small"><b>D1: fee only when money leaves the tree to a winner</b><b class="num" style="color:var(--gold-2)">${usd(r.d1)}</b></div>${bar(r.d1, 'var(--gold)')}</div>
          <div><div class="row between small"><span class="muted">Alternative: also charge on every carve-out</span><span class="num">${usd(r.carveTax)}</span></div>${bar(r.carveTax, 'var(--violet)')}<div class="tiny faint">+${usd(r.carveTax - r.d1)} for simply splitting the job</div></div>
          <div><div class="row between small"><span class="muted">Alternative: charge the root and the leaves (double dip)</span><span class="num">${usd(r.doubleDip)}</span></div>${bar(r.doubleDip, 'var(--red)')}<div class="tiny faint">the same capital is charged twice</div></div>
        </div>
      </div>`;
  };

  const tree = () => html`
    <div class="card tree">
      <ul><li>
        <div class="node company"><span class="ic" style="background:var(--gold);color:var(--gold-ink)">${ic('lock', 15)}</span><span class="name">Root job</span><b class="num">${usd(s.root)}</b><span class="tiny muted">residual ${usd(Math.max(0, s.root - s.a - s.b))}</span></div>
        <ul>
          <li><div class="node"><span class="pill violet nodot">carve-out · 0 fee</span><span class="name">Leaf A</span><b class="num">${usd(s.a)}</b><span class="grow"></span>${s.payA ? html`<span class="pill paid">pays winner</span>` : html`<span class="pill refunded">refunded to root</span>`}</div></li>
          <li><div class="node"><span class="pill violet nodot">carve-out · 0 fee</span><span class="name">Leaf B</span><b class="num">${usd(s.b)}</b><span class="grow"></span>${s.payB ? html`<span class="pill paid">pays winner</span>` : html`<span class="pill refunded">refunded to root</span>`}</div></li>
        </ul>
      </li></ul>
    </div>`;

  return {
    title: 'Fee calculator',
    html: html`
      <div class="page-head">
        <div><h2>Fee calculator</h2><p>Lockwork charges 2.5% only when escrow releases money to a winner. Locking is free, carving budget into sub-jobs is free, and refunds are free. This is the $10k example from the design docs. Change it to see why charging only on outward payouts builds trust.</p></div>
      </div>
      <div class="grid split">
        <div class="col" style="gap:16px">
          <div class="card">
            <div class="form-grid" id="calc">
              <label class="field">Root job escrow<input type="number" name="root" value="${s.root}" min="0" step="100"></label>
              <div></div>
              <label class="field">Leaf A (carve-out)<input type="number" name="a" value="${s.a}" min="0" step="100"></label>
              <label class="field">Leaf B (carve-out)<input type="number" name="b" value="${s.b}" min="0" step="100"></label>
              <label class="field inline"><input type="checkbox" name="payA" checked> Leaf A pays a winner</label>
              <label class="field inline"><input type="checkbox" name="payB"> Leaf B pays a winner</label>
              <label class="field inline span-2"><input type="checkbox" name="payRoot"> Root pays its residual to a root-level winner</label>
            </div>
            <div class="form-err hidden" id="calc-err"></div>
          </div>
          <div id="tree">${tree()}</div>
        </div>
        <div id="out">${out()}</div>
      </div>`,
    mount(el) {
      el.querySelector('#calc').addEventListener('input', (e) => {
        const t = e.target;
        s[t.name] = t.type === 'checkbox' ? t.checked : Math.max(0, Number(t.value) || 0);
        const err = el.querySelector('#calc-err');
        const over = s.a + s.b > s.root;
        err.textContent = over ? 'Carve-outs can’t exceed the root budget. Use an expansion budget for new capital.' : '';
        err.classList.toggle('hidden', !over);
        if (over) return;
        el.querySelector('#out').innerHTML = String(out());
        el.querySelector('#tree').innerHTML = String(tree());
      });
    },
  };
}
