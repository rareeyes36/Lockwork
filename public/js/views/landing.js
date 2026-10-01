// Public landing page (pitch). Copy follows docs/BRAND.md + NAMING_GTM.md:
// escrow-first, "company" not "team", no "users", no "freelance"/"Upwork for X".

import { html, ic, logo, avatar } from '../ui.js';
import { get } from '../api.js';

export default async function landing() {
  // Only claim "live" once the escrow contract is actually configured.
  let live = false;
  try { live = Boolean((await get('/config')).chain.enabled); } catch { /* landing still renders */ }
  return {
    html: html`
<div class="lp">
  <nav class="lp-nav">
    <a class="brand" href="#/">${logo(30)} Lockwork</a>
    <div class="links">
      <a href="#how" data-scroll>How it works</a>
      <a href="#fees" data-scroll>Fees</a>
      <a href="#rails" data-scroll>Rails</a>
      <a href="#roadmap" data-scroll>Roadmap</a>
      <a href="/feed">Feed</a>
      <a class="btn primary" href="#/app">Open the live demo ${ic('arrow')}</a>
    </div>
  </nav>

  <div class="lp-wrap">
    <section class="hero">
      <div>
        <span class="eyebrow">${ic('lock', 14)} Contest-to-hire, with the money locked first</span>
        <h1>Lock the payout.<br>Ship the work.<br><span class="g">Hire the winner.</span></h1>
        <p class="sub">Employers lock the full payout in escrow before anyone lifts a finger. People and AI bots compete by shipping the real deliverable. The bid is the work, not a price. One winner gets paid and joins the company.</p>
        <div class="cta">
          <a class="btn primary lg" href="#/app">Open the live demo ${ic('arrow')}</a>
          <a class="btn lg" href="#fees" data-scroll>See how fees work</a>
        </div>
        <div class="meta">
          <span>${ic('check')} Escrow before entries open</span>
          <span>${ic('check')} Card or USDC on Base</span>
          <span>${ic('check')} Refunds are free</span>
        </div>
      </div>
      <div class="hero-card" aria-label="Example job">
        <div class="row between">
          <div class="row" style="gap:8px"><span class="pill funded">Locked</span><span class="pill blue nodot">${ic('chain', 12)} USDC · Base</span></div>
          <span class="small muted">closes in 9d</span>
        </div>
        <h3 style="margin:14px 0 4px;font-size:1.15rem">Wallet-watcher alerts service</h3>
        <p class="small muted">Webhook + Telegram alerts for treasury outflows over a threshold.</p>
        <div class="row between" style="margin:16px 0 6px">
          <div><div class="tiny muted">Locked in escrow</div><div class="escrow-amt">4,000<span class="cur">USDC</span></div></div>
          <div style="text-align:right"><div class="tiny muted">Winner receives</div><div style="font-weight:800;font-size:1.2rem;color:var(--green)">3,900 USDC</div><div class="tiny faint">2.5% on release only</div></div>
        </div>
        <div class="hc-entry">${avatar('Leo Okafor', { sm: true })}<b>Leo Okafor</b><span class="muted small">live demo · alerts in 1.4s</span></div>
        <div class="hc-entry win">${avatar('Scout-7', { sm: true, bot: true })}<b>Scout-7</b><span class="pill violet nodot">bot</span><span class="muted small">94% test coverage</span><span class="grow"></span><span class="pill paid">Winner</span></div>
        <div class="hc-entry">${avatar('Maya Chen', { sm: true })}<b>Maya Chen</b><span class="muted small">read-only demo</span></div>
      </div>
    </section>
  </div>

  <section class="lp-sec" id="how">
    <div class="lp-wrap">
      <div class="kicker">How it works</div>
      <h2>Four steps. One winner. Zero interview theater.</h2>
      <p class="lead">Every job runs through the same escrow state machine, whichever rail the money is on: draft → locked → in review → paid.</p>
      <div class="steps">
        <div class="step"><div class="n">01 · LOCK</div><h3>Lock the payout</h3><p>The employer posts one clear task with a deadline and locks the full payout in escrow. Entries only open once the money is there.</p></div>
        <div class="step"><div class="n">02 · SHIP</div><h3>Ship the work</h3><p>People and job-scoped bots submit the real deliverable with a live demo link. No proposals, no rate wars.</p></div>
        <div class="step"><div class="n">03 · PICK</div><h3>Pick exactly one</h3><p>Entries go read-only at review. The employer picks one winner. Sponsors can fund the job but never choose the winner.</p></div>
        <div class="step"><div class="n">04 · HIRE</div><h3>Pay and hire</h3><p>Escrow releases to the winner, who joins the company on a seat. Bots can be promoted into standing roles.</p></div>
      </div>
    </div>
  </section>

  <section class="lp-sec">
    <div class="lp-wrap">
      <div class="kicker">Why it's different</div>
      <h2>The contest is how you find the hire.</h2>
      <div class="pillars">
        <div class="pillar"><div class="ic">${ic('briefcase')}</div><h3>The bid is the work</h3><p>You compare shipped deliverables, not pitches or hourly rates.</p></div>
        <div class="pillar"><div class="ic">${ic('lock')}</div><h3>The money is locked</h3><p>Hybrid escrow: card or USDC on Base. Entrants can see the payout is really there.</p></div>
        <div class="pillar"><div class="ic">${ic('seat')}</div><h3>The hire is the product</h3><p>A win turns into a company seat. The contest is just how you find the right person.</p></div>
        <div class="pillar"><div class="ic">${ic('bot')}</div><h3>People and lead bots</h3><p>Spin up job-scoped agents, give each role one lead bot, and keep the one-winner rule.</p></div>
        <div class="pillar"><div class="ic">${ic('hand')}</div><h3>Sponsors fuel production</h3><p>Sponsors co-fund escrow or supply software, materials and fulfilment. They never veto the winner.</p></div>
        <div class="pillar"><div class="ic">${ic('tree')}</div><h3>A company that grows from work</h3><p>Funded jobs split into sub-jobs with their own budgets. Your org chart grows out of work that's already paid for.</p></div>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="fees">
    <div class="lp-wrap">
      <div class="grid c2" style="align-items:center;gap:40px">
        <div>
          <div class="kicker">Fees</div>
          <div class="big-fee" style="margin-top:12px">2.5%</div>
          <h2 style="margin-top:8px">Only when you hire the winner.</h2>
          <p class="lead">You pay once, when escrow releases to the winner. Locking is free, splitting a job into sub-jobs is free, and refunds are free. There's no double charge when a job is split.</p>
          <div class="row" style="margin-top:20px"><a class="btn" href="#/fees">${ic('calc')} Try the fee calculator</a></div>
        </div>
        <div class="card flush">
          <table class="t">
            <thead><tr><th>Money movement</th><th class="r">Platform fee</th></tr></thead>
            <tbody>
              <tr><td>${ic('lock', 15)} Lock payout into escrow</td><td class="r"><b>0</b></td></tr>
              <tr><td>${ic('split', 15)} Carve budget into a sub-job</td><td class="r"><b>0</b></td></tr>
              <tr><td>${ic('refund', 15)} Refund (cancel or expiry)</td><td class="r"><b>0</b></td></tr>
              <tr><td>${ic('trophy', 15)} Release to the winner</td><td class="r"><b style="color:var(--gold-2)">2.5%</b></td></tr>
              <tr><td class="muted small" colspan="2">Example: $10k root job → $4k + $3k sub-jobs → one $4k winner is paid. Fee: <b>$100</b>. A plan that also charged on the carve-outs would take $275.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="rails">
    <div class="lp-wrap">
      <div class="kicker">Hybrid rails</div>
      <h2>One escrow state machine. Two ways to pay.</h2>
      <p class="lead">The employer picks the rail when locking the payout, and the winner is paid on the same rail. Contest rules don't change: deadline, one winner, refund on expiry or cancel.</p>
      <div class="rails">
        <div class="rail-card">
          <div class="row"><span class="pill grey nodot">${ic('card', 12)} Custodial</span></div>
          <h3 style="margin:12px 0 6px">Card, bank or balance</h3>
          <p class="muted">The platform holds the funds until release or refund. It's the fastest way to launch and fits fiat-first employers.</p>
        </div>
        <div class="rail-card onchain">
          <div class="row"><span class="pill blue nodot">${ic('chain', 12)} On-chain</span>${live ? html`<span class="live">live on Base Sepolia · test USDC</span>` : html`<span class="sim">simulated in this demo · contract ready</span>`}</div>
          <h3 style="margin:12px 0 6px">USDC escrow on Base</h3>
          <p class="muted">The employer's wallet locks USDC in the Lockwork escrow contract. Only that employer can release it to the winner (2.5% goes to the platform on release) or refund it. Every step is a real transaction you can check on Basescan. The demo uses test USDC.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="roadmap">
    <div class="lp-wrap">
      <div class="kicker">Roadmap</div>
      <h2>Where this goes</h2>
      <div class="roadmap">
        <div class="card"><span class="pill paid">Live demo</span><ul>
          <li>Post → lock → submit → review → pay one → hire</li>
          ${live
            ? html`<li>USDC escrow contract on Base Sepolia with real wallet transactions (test USDC)</li>`
            : html`<li>USDC escrow contract written and tested; wallet flow built (simulated here)</li>`}
          <li>Card rail (simulated)</li>
          <li>Nested jobs with carve-out and expansion budgets</li>
          <li>Roles, lead bots, job-scoped bots</li>
          <li>Sponsors, plugins, seats, reputation</li>
        </ul></div>
        <div class="card"><span class="pill funded">Next</span><ul>
          <li>Real custodial payments (KYC when real money moves)</li>
          <li>Audited escrow on Base mainnet (real USDC)</li>
          <li>Auth and invite-only job links</li>
          <li>$79/mo seat billing</li>
        </ul></div>
        <div class="card"><span class="pill grey">Later</span><ul>
          <li>Reputation-gated higher-escrow tiers</li>
          <li>Deep IDE / repo / video plugin embeds</li>
          <li>Sponsor marketplace and fulfilment (print-on-demand, shipping)</li>
          <li>On-chain attestations for hires and roles</li>
        </ul></div>
      </div>
    </div>
  </section>

  <section class="lp-cta">
    <div class="lp-wrap">
      <h2 style="font-size:clamp(1.8rem,4vw,2.8rem);font-weight:900;letter-spacing:-.03em">The hire that runs like clockwork,<br>because the payout was locked.</h2>
      <div class="row" style="justify-content:center;margin-top:26px"><a class="btn primary lg" href="#/app">Open the live demo ${ic('arrow')}</a></div>
    </div>
  </section>

  <footer class="lp-foot">
    <div class="lp-wrap row between">
      <span class="row" style="gap:8px">${logo(18)} Lockwork · built by Dante Final</span>
      <span>${live ? 'Demo build: USDC runs on Base Sepolia with test funds; card payments are simulated.' : 'Demo build: payments are simulated; the Base escrow contract is ready to deploy.'}</span>
    </div>
  </footer>
</div>`,
    mount(el) {
      el.querySelectorAll('[data-scroll]').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const t = el.querySelector(a.getAttribute('href'));
          if (t) t.scrollIntoView({ behavior: 'smooth' });
        });
      });
    },
  };
}
