# Lockwork Unit Economics & Nested Fee Exhibit

*White-paper exhibit · Genius draft for Make Money fold into WHITEPAPER.md · Audience: investors and serious partners · Companion to Crypto Bro’s on-chain/fee chapter · Grounded 2026-10-01*

**Product:** Lockwork ([https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/))  
**Brand line:** Lock the payout. Ship the work. Hire the winner.  
**Assumptions:** illustrative until Dante sets vertical GMV targets — do not present as audited actuals.

---

## 1. Thesis (money seat)

Lockwork’s edge is not a higher take-rate. It is **one fee rule that survives nesting**, plus a **hire that converts contest CAC into company seats**. Fee prints cash on success; seats print multiple; sponsors and float are optional layers. Raising the fee to “fix” thin volume destroys density — ship seat billing first.

---

## 2. Income stack (locked knobs)

| Stream | Rule | Role |
|--------|------|------|
| Release fee | **250 bps** on **outward** release to a winner only | Core cash |
| Carve-outs / internal moves | **0 bps** | Nesting must feel free |
| Refunds (`expired` / `cancelled`) | **0 bps** | No tax on failed matches |
| Company seats | **$79/mo** default (`workspace_member` stub) | LTV / retention |
| Sponsor placement | **500 bps** of contribution when financing attaches | Secondary |
| Custodial float | Internal only; never pitched | Silent margin |
| Plugin / bot tolls | Later income layer | Not v1 |

Winner net: `amount − fee_amount`. Billing and seats roll up to **the company** (root unit), not a free-floating “team.”

---

## 3. Unit economics — scenario table (monthly)

*Inputs (swappable):* refund/no-winner **15%** of funded jobs; avg lock **14** days; float APR **4%** (custodial internal); seat keep **40%** of wins; financing on **20%** of jobs; sponsor share **30%** of escrow when attached.

### A — Release fee + float

| Stage | Jobs/mo | Avg escrow | Funded GMV | Released GMV | Fee @ 250 bps | Float ~/mo |
|-------|---------|------------|------------|--------------|---------------|------------|
| Seed | 50 | $500 | $25k | $21.3k | **$531** | ~$39 |
| Early | 200 | $2,000 | $400k | $340k | **$8,500** | ~$622 |
| Growth | 1,000 | $5,000 | $5.0M | $4.25M | **$106k** | ~$7.8k |
| Scale | 5,000 | $8,000 | $40M | $34M | **$850k** | ~$62k |

Float ≈ (funded × 14/30) × (4%/12). Fee is the print; float is silent.

### B — Employment seats (MRR)

Wins/mo ≈ jobs × 85%. Active seats ≈ wins × 40%.

| Stage | Wins | Seats | @$29 | **@$79** | @$149 |
|-------|------|-------|------|----------|-------|
| Seed | 42 | 17 | $493 | **$1,343** | $2,533 |
| Early | 170 | 68 | $1,972 | **$5,372** | $10,132 |
| Growth | 850 | 340 | $9,860 | **$26,860** | $50,660 |
| Scale | 4,250 | 1,700 | $49k | **$134k** | $253k |

Early + $79 ≈ **~$64k ARR** from seats alone — compounding vs one-shot contest fees.

### C — Sponsor placement (when live)

| Stage | Sponsored jobs | Contrib GMV | Placement @ 5% |
|-------|----------------|-------------|----------------|
| Seed | 10 | $1.5k | $75 |
| Early | 40 | $24k | $1,200 |
| Growth | 200 | $300k | $15k |
| Scale | 1,000 | $2.4M | $120k |

### Stack snapshot — Early (200 × $2k)

| Stream | $/mo |
|--------|------|
| Release fee | 8,500 |
| Float (internal) | ~622 |
| Seats @ $79 | 5,372 |
| Sponsor placement | 1,200 |
| **Total** | **~$15.7k** |

Fee still leads cash at Early; seats build valuation multiple. Prefer shipping seat billing over +50 bps fee.

---

## 4. Nested fee math (D1 — leaf-outward only)

**Rule:** Fee fires only when capital **leaves the company tree to a winner**. Internal `parent_carveout` = **$0** fee. Expansion capital increases fee base only when that capital later pays a winner. Depth ≤ **3**, no cycles (v1) — walks stay auditable.

### Exhibit — $10k root tree

Root locks **$10,000**. Carve-out children **$4,000** + **$3,000**. One leaf ($4k) pays a winner. Fee = 250 bps.

| Policy | Platform fee | Why it fails or wins |
|--------|--------------|----------------------|
| **D1 leaf-outward (locked)** | **$100** | Only $4k × 2.5%; carve-outs $0; winner net $3,900 |
| Fee on every carve-out + leaf | **$275** | Employers feel split as a charge → nesting dies |
| Double-dip root + leaf | **$350** | Same capital taxed twice → churn |

If both leaves later pay under D1: fee = ($4k+$3k)×2.5% = **$175**. Residual $3k on root fees only if/when paid outward to a root-level winner. Multiple leaf wins → multiple **company** seats possible; fee still once per outward payout, never per carve-out.

**Product HUD implication (#18):** OS-only nested budget must show parent remaining and “carve-out = $0 fee” so employers do not fear double-dip.

---

## 5. Stress findings (decision rules)

1. **250 bps is fine for v1** vs marketplace take-rates **if** seats convert. Do not hike fee to fix Seed volume.
2. **Seat price > fee bps** past Early — default **$79** until vertical WTP is measured.
3. **Float is not a pitch** — keep internal; hundreds/mo at Early, not a story.
4. **Refund rate is the silent killer** — every +5 pp refund ≈ −5% fee revenue. Product: push pick-a-winner before expiry.
5. **Sponsor placement is optional upside** until financing UX ships; don’t block the core loop.
6. High-ticket / low-volume verticals (avg escrow ≥ $10k): fee alone can fund ops; seats still win long-term.

---

## 6. Instruments that decide the next fee move (#19)

Track before changing bps or seat price:

| Metric | Why |
|--------|-----|
| Released GMV | True fee base (not funded, not carved) |
| Refund / no-winner % | Silent fee destroyer |
| Seat keep 30 / 60 / 90 | Whether contest CAC becomes ARR |

Replace-me inputs when Dante sets them: vertical, target jobs/mo, avg escrow, real refund %, seat WTP. Re-run tables; do not invent actuals.

---

## 7. Copy constraint (#20)

Public and WP/deck language: **hired role / company seat** — avoid EoR-looking “employee” framing until counsel clears it. Fee copy stays escrow-primary (lock → release), never clockwork metaphors for money.

---

## 8. Hand-off

| Artifact | Owner | Status |
|----------|-------|--------|
| This unit-econ + nested-fee chapter | Genius | **Drafted 2026-10-01** |
| On-chain / fee architecture chapter | Crypto Bro | See `WHITEOBYPER_ONCHAIN_CHAPTER.md` |
| White-paper body edit / pitch deck | Make Money | Integrate exhibits |
| Live smoke evidence pack | Grok Bot | Folds under WP when asked |

*Source tables: `MONEY_MODEL.md`. Framework spine: `ECONOMIC_FRAMEWORK.md`. Decisions: `OPEN_DECISIONS.md` (D1).*

---

## Live status footnote (2026-10-01 evening ET)

| Knob | Live |
|------|------|
| Fee / placement / seat / depth | 250 bps / 500 bps / **$79** / ≤3 |
| Treasury `fee_recipient` | `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` (Dante-confirmed) |
| Escrow (Base Sepolia) | `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` · on-chain un-simulated |
| Custodial rail | Still simulated |
| Seat billing charge | **Not live yet** (#4) — tables above remain model assumptions until keep 30/60/90 is measured |

*Product:* [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/) · *Config:* [/api/config](https://lockwork-dun.vercel.app/api/config)
