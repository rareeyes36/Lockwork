# Lockwork White Paper

*Draft body · Make Money · 2026-10-01*  
*Product: Lockwork · Brand line: Lock the payout. Ship the work. Hire the winner.*  
*Live demo: [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/) — Base Sepolia escrow live; custodial still simulated; seat billing not yet charged.*  
*Audience: investors, design partners, serious operators.*  
*Copy rule (#20): prefer “hired into company / seat” over EoR-looking “employee.”*  
*Shareable package: [pitch](https://lockwork-dun.vercel.app/pitch) · [white paper](https://lockwork-dun.vercel.app/whitepaper) · [index](https://lockwork-dun.vercel.app/package)*

**Companion chapters (folded by reference — read in full):**
- Crypto Bro — On-chain escrow & fee architecture → [`WHITEPAPER_ONCHAIN_CHAPTER.md`](./WHITEPAPER_ONCHAIN_CHAPTER.md)
- Genius — Unit economics & nested-fee exhibit → [`WHITEPAPER_UNIT_ECON_EXHIBIT.md`](./WHITEPAPER_UNIT_ECON_EXHIBIT.md) (also [`WHITEPAPER_UNIT_ECON_CHAPTER.md`](./WHITEPAPER_UNIT_ECON_CHAPTER.md))

**Live config (Vercel `/api/config`, 2026-10-01 evening ET):** platform fee **250 bps** leaf-outward · placement **500 bps** · seats **$79** · nesting depth **≤ 3** · `chain.enabled: true` · Base Sepolia · escrow `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` · `fee_recipient` / treasury `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` · `feeBps` 250 · on-chain `simulated: false` · custodial still `simulated: true` · `demo_reset` may still be true

---

## Abstract

Lockwork is a contest-to-hire clearinghouse. Employers lock a sealed payout before competition is serious; workers (humans and bots) compete by shipping the artifact — the bid *is* the work; exactly one winner is paid and **hired into that employer’s company** on a billable seat. Hybrid escrow (custodial ledger + Base USDC) enforces the purse under one fee rule: **2.5% only on outward release to a winner**. Internal budget carve-outs and refunds are **0 bps**. Public surfaces show reputation without GMV; money lives in the company OS. This paper states the primitive, the nested fee math, the rail architecture, the trust split, sponsor economics, regulatory posture, and the roadmap from Sepolia live escrow to Base mainnet and custodial/seat live settlement.

---

## Table of contents (framework §6)

1. [Contest-to-hire primitive vs marketplaces](#1-contest-to-hire-primitive-vs-marketplaces)
2. [D1 nested fee math & leaf-outward-only rule](#2-d1-nested-fee-math--leaf-outward-only-rule)
3. [Hybrid escrow state machine](#3-hybrid-escrow-state-machine-custodial--on-chain-adapters)
4. [Company / sub-team / job tree & seat roll-up](#4-company--sub-team--job-tree--seat-roll-up)
5. [Public/private data split & social-credit enforcement](#5-publicprivate-data-split--social-credit-enforcement)
6. [Sponsor types & placement fee](#6-sponsor-types--placement-fee)
7. [On-chain design (folded Crypto Bro chapter)](#7-on-chain-design-base-usdc-lockworkescrow-feerecipient)
8. [Regulatory & trust risks](#8-regulatory--trust-risks-custody-hireseat-language)
9. [Roadmap](#9-roadmap-sim--sepolia--base-mainnet-pluginbot-tolls)
10. [Unit economics exhibit (folded Genius)](#10-unit-economics--nested-fee-exhibit-genius)
11. [Smoke evidence pack (placeholders)](#11-smoke-evidence-pack-grok--25-under-10)
12. [Open items & ownership](#12-open-items--ownership)

---

## 1. Contest-to-hire primitive vs marketplaces

### Thesis

Lockwork sells **certainty of payout that converts into a hire** — not billable hours, not reverse auctions, and not unpaid speculative contests.

| Model | What the worker risks | What the employer buys |
|-------|----------------------|-------------------------|
| Upwork / Fiverr | Time for maybe-pay | Hours / gigs |
| Classic contest sites | Unpaid work for maybe-prize | Speculative free labor |
| **Lockwork** | Time against a **sealed purse** | **Locked payout + one hire into the company** |

### Core loop

1. Employer creates a **company** (workspace root) and posts a **job** (clear requirements, deadline).
2. Employer **locks** the full payout in escrow (custodial and/or Base USDC).
3. Workers submit **work** — files, demos, repos — not price bids.
4. Employer reviews submissions in read-only demo view.
5. Employer selects **exactly one** winner.
6. Escrow **releases** to the winner; winner is **hired into the company** on a seat (`employments` / seat billing).
7. Optional: job-scoped bots shut down or promote; sponsors and plugins attach to production.

**Brand line (locked):** Lock the payout. Ship the work. Hire the winner.

### Why this is a category, not a feature

Marketplaces optimize matching price to hours. Contest sites optimize free optionality for the poster. Lockwork optimizes **conversion**: locked capital → shipped artifact → retained seat. Fee, reputation, and GTM all hang off that conversion event. A functional Lockwork is not “pretty UI + sim escrow”; it is lock real value → ship → pay one → seat converts → reputation updates publicly without showing dollars.

---

## 2. D1 nested fee math & leaf-outward-only rule

**Decision status:** DECIDED for alpha (OPEN_DECISIONS D1; REFUND_POLICY).

| Event | Platform fee |
|-------|----------------|
| Lock (any rail) | **0** |
| Internal `parent_carveout` | **0** |
| Expansion lock (new capital) | **0** at lock; fee when that capital later releases outward |
| Outward `release` to a winner | **250 bps (2.5%)** |
| Refund (`expired_refunded` / `cancelled_refunded`) | **0** |

**External copy:** “2.5% when a winner is paid out of escrow — not when you split a job.”

Integer math (USDC 6-dec style): `fee_amount = amount * 250 / 10000` (floor); winner net = `amount − fee_amount`.

### Nested example ($10k root)

Root locks **$10,000**. Carve-outs **$4,000** + **$3,000** to children (**$0** fee on transfers). One leaf ($4,000) pays a winner → platform fee **$100**; winner net **$3,900**. If both leaves later pay under D1: fee = **$175**. Residual root capital fees only if/when paid outward to a root-level winner. Depth cap **3**; no cycles (D4).

**Reject:** charging on every carve-out + leaf ($275) or double-dipping root + leaf ($350) — same capital taxed twice destroys nesting trust.

Full scenario tables, Early stack snapshot, and stress findings: see **§10** (Genius exhibit).

---

## 3. Hybrid escrow state machine (custodial + on-chain adapters)

One job escrow state machine; two adapters. Rail chosen at fund time; no mid-job bridge in v1.

```
draft → funded → in_review → paid
                ↘ expired_refunded
                ↘ cancelled_refunded
                ↘ disputed (automated social-credit path; no human desk in v1)
```

| Adapter | Lock | Hold | Release / refund |
|---------|------|------|------------------|
| **Custodial** | Card / bank / platform balance | Ledger `hold` | Credit winner / return to employer |
| **On-chain** | Wallet deposits USDC into escrow | Contract balance by `escrowRef` | Contract pays winner or refunds employer |

**Adapter surface:** `lock` · `release` · `refund` · `status`. Job fields: `rail`, `escrow_ref`, `amount`, `currency`, `state`.

**Who may trigger:** Employer locks; system/employer releases after one winner; system on expiry / employer on allowed cancel refunds; **workers never touch escrow**.

**Refund cascade (D2):** bottom-up, deterministic — children terminal before parent refunds; carve-out restores to parent remaining; expansion returns to expansion payer; **0 bps** always on refund paths. No fee clawback (fee never charged on refund).

Shipping order: shared state machine → custodial-sim (shipped for UI completeness) → custodial-live → on-chain as second path without rewriting jobs.

Detail and live config honesty: **§7** / [`WHITEPAPER_ONCHAIN_CHAPTER.md`](./WHITEPAPER_ONCHAIN_CHAPTER.md).

---

## 4. Company / sub-team / job tree & seat roll-up

### Vocabulary

- **Company** = root unit (schema `workspaces` in v1 — copy says company, never “team” at the top).
- **Sub-teams** nest under a company only (depth ≤ 3).
- People hold roles: **employer**, **winner hired into company / seat**, **sponsor** — not generic “users” in product copy.
- Jobs hang off company or sub-team; funded jobs may spawn sub-jobs (parent carve-out or expansion).

### Authority (D3)

| Action | Who |
|--------|-----|
| Fund / lock | Employer with fund permission on the company |
| Pick winner | Job’s posting employer; sponsors never veto |
| Seat / hire link | Always on `company_id` (root) |
| Seat billing | Billed to the **company**, not the sub-team |

Win → company seat (`employments`); billing rolls up after custodial/seat processor is live. Default stub price: **$79/mo**. Multiple leaf wins under one parent may create multiple company seats; fee still once per outward payout.

---

## 5. Public/private data split & social-credit enforcement

### Trust split

| Surface | Shows | Hides |
|---------|-------|-------|
| Company OS (`/`) | Escrow state, Connect/Approve/Lock, fee copy, nested budgets | — (money belongs here) |
| Public `/feed`, `/u/:handle` | Jobs completed, badges, demerits, employment-days style facts | Escrow amounts, GMV, fees, purse sizes |

Status compounds matching without leaking pricing power or inviting fee gaming.

### Reputation & social credit (v1 posture)

- Facts: wins, employment retention days; later gates weight retention over raw wins (anti-farm).
- Social credit starts at 100; symmetric demerits on finalized disputes; one revision round; match blocks after post-pay worker disputes.
- **No human dispute desk in v1** (#24). Automated credit + matching separation replaces adjudication theater.
- Fee clawback remains rare by design (fee only on successful outward release).

See `REPUTATION.md`, `SOCIAL_CREDIT.md`, `PROFILE_FEED.md`.

---

## 6. Sponsor types & placement fee

Sponsors attach to a company or job. They do **not** pick the winner.

| Type | Contribution |
|------|----------------|
| Contributing | Labor, reviews, assets |
| Financing | Escrow co-lock / top-up |
| Software | Seats, licenses, plugin access |
| Materials / services | PoD, manufacture, shipping |

**Placement fee:** **500 bps** of financing contribution when that path is live (separate from release fee). Optional upside until financing UX ships — do not block the core loop on sponsors (#14).

Later income layers (not v1): plugin marketplace take-rate, bot tolls, software sponsors at scale.

---

## 7. On-chain design (Base USDC, LockworkEscrow, feeRecipient)

> **Fold-in:** The full Crypto Bro chapter is the canonical deep dive.  
> **Read in full:** [`WHITEPAPER_ONCHAIN_CHAPTER.md`](./WHITEPAPER_ONCHAIN_CHAPTER.md)

### Summary for body readers

- **Target chain:** Base L2 (mainnet `8453`; test Base Sepolia `84532`).
- **Asset:** Native USDC (6 decimals); integer fee math only.
- **Contract:** `LockworkEscrow.sol` **LIVE on Base Sepolia** at escrow `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` ([Basescan](https://sepolia.basescan.org/address/0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722)).
- **Events (minimum):** `Locked`, `Released`, `Refunded`.
- **UI path:** Connect → Approve USDC → Lock on fund (`/deploy.html` helper available).
- **Fee skim:** on release to `feeRecipient`.
- **`feeRecipient` / treasury (LIVE):** `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` — Dante-confirmed treasury in 1:1 with Crypto Bro; **never** the deploy/hot wallet.
- **Live `/api/config` (2026-10-01 evening ET):** `chain.enabled: true`, escrow + fee_recipient wired as above, Base Sepolia, on-chain `simulated: false`, **custodial still simulated**, `demo_reset` may still be true. Not Base mainnet.
- On-chain v1 escrows are **flat** job deposits; nested carve-outs remain custodial/ledger until a later policy moves trees on-chain. Fee *incidence* still follows D1 on every rail.

### Why hybrid beats pure TradFi or pure contest (from chapter)

Hybrid is the minimum architecture that (a) proves the purse before work, (b) serves fiat-friendly and crypto-native settlement cultures, and (c) keeps fee incidence auditable under one rule set.

*Do not invent tx receipts, buy domains, deploy contracts, or flip production env from this document. Naming buys are dropped — stay on the Vercel URL.*

---

## 8. Regulatory & trust risks (custody, hire/seat language)

*Brief pass for backlog #17 — not legal advice; counsel review before external fundraising use.*

### Posture

| Topic | Draft posture |
|-------|----------------|
| **Custodial rail** | May implicate money-transmission / custody regimes depending on jurisdiction and fact pattern. Prefer **on-chain for early crypto ICP**; delay promising float yield; float stays internal-only and unpitched. |
| **Hire / seat language** | Product creates a **company seat / hired role** after a contest win. Avoid EoR, staffing-agency, and “we employ them for you” framing in deck/WP/marketing until counsel clears employment-adjacent claims (#20). Prefer: *hired into the company*, *company seat*, *winner join*. |
| **Contest / prize characterization** | Emphasize sealed purse + hire conversion, not speculative unpaid contests or gambling framing. |
| **`feeRecipient` custody** | Treasury multisig (or equivalent); never single hot EOA for mainnet fees. |
| **Public GMV** | Kept private partly to reduce gaming; also reduces surface for misleading “earnings” claims on profiles. |
| **Naming / trademark** | Domain buys **dropped** for now — stay on Vercel URL; registration ≠ mark clearance. |

### Material product risks (non-legal)

Spoofed winner oracle → authenticated selection only. Wrong chain/USDC → hard chain-id checks. Wallet friction → Base + clear Connect/Approve/Lock. Stuck funds → explicit refund paths; pause/rescue only with Dante-approved admin design. Testnet→mainnet gap → Sepolia escrow is live; filmed lock→release smoke + custodial un-simulate still required before Base mainnet.

---

## 9. Roadmap: sim → Sepolia → Base mainnet; plugin/bot tolls

Suggested cash order (Genius / backlog): **1 → 2 → 4 → 14 → 9/10**.

| Gate | Outcome |
|------|---------|
| **1. Treasury `feeRecipient`** | **DONE** — Dante treasury `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` wired |
| **2. Sepolia** | **DONE (deploy)** — escrow `0xa24D…C722` live; lock→release smoke receipt **not yet filmed** |
| **3. Seat billing live @ $79** | Contest CAC → ARR — **still open (#4)** |
| **4. Un-simulate rails** | On-chain un-simulated; **custodial still simulated**; turn off `demo_reset` on prod |
| **14. Sponsor attach** | 500 bps placement live |
| **Docs** | This WP + pitch deck (Make Money) |
| **Later** | Base mainnet audit gate; ENS / `*.base.eth` identity; on-chain paid+hired attestation; plugin/bot tolls; employer reputation symmetry |

**Near-term product gaps** (not all WP-blocking): feed population from real job events; refund-cascade demo; one $2k–$10k ICP case study; turn off `demo_reset` on production; migration 022 on Vercel Postgres; closed-alpha invite path.

On-chain Sepolia escrow + treasury are live; custodial remains simulated and seat billing is not yet charged. Lockwork is a **live testnet settlement demo of the sealed-purse thesis**, not yet Base mainnet or a fully live custodial clearinghouse.

---

## 10. Unit economics & nested-fee exhibit (Genius)

> **Fold-in:** Genius exhibit is ready and is the canonical numeric appendix.  
> **Read in full:** [`WHITEPAPER_UNIT_ECON_EXHIBIT.md`](./WHITEPAPER_UNIT_ECON_EXHIBIT.md)  
> **Also:** [`WHITEPAPER_UNIT_ECON_CHAPTER.md`](./WHITEPAPER_UNIT_ECON_CHAPTER.md) (same exhibit family)

### Body digest (do not treat as audited actuals)

**Income stack:** 250 bps outward release · $79 seats · 500 bps placement · float internal-only · plugin/bot tolls later.

**Assumptions (swappable):** 15% refund/no-winner; 14-day avg lock; 4% float APR internal; 40% seat keep; 20% financing attach; 30% sponsor share when attached.

**Early snapshot (200 × $2k/mo):** release fee ~$8.5k + seats ~$5.4k + placement ~$1.2k + float ~$0.6k ≈ **~$15.7k/mo**; seat ARR alone ~**$64k**.

**Stress rules:** Keep 250 bps; ship seat billing before fee hikes; float is not a pitch; refund rate is the silent killer; sponsors optional until UX exists.

**Instruments before next fee move (#19):** released GMV, refund %, seat keep 30/60/90.

*Replace-me inputs when Dante sets vertical, target jobs/mo, avg escrow, real refund %, seat WTP.*

---

## 11. Smoke evidence pack (Grok — #25 under #10)

*Placeholders for live smoke checklist as WP evidence. Fill when Grok Bot runs the pack against production/demo; do not invent pass/fail.*

| Check | Expected | Evidence (link / screenshot / timestamp) | Status |
|-------|----------|------------------------------------------|--------|
| `/api/config` fee knobs | `platform_fee_bps: 250`, placement 500, seats 79, depth ≤ 3 | *pending Grok smoke* | ☐ |
| Rails honesty | `chain.enabled: true` on Base Sepolia; on-chain `simulated: false`; custodial still simulated | config + Basescan escrow | ☑ testnet |
| Dollar-free public | `/feed` and `/u/:handle` show no escrow $, GMV, or fee tallies | *pending* | ☐ |
| Fee parity copy | OS fee copy matches D1 (“2.5% when winner paid / not when you split”) | *pending* | ☐ |
| Core loop reachable | post → fund → submit → review → pay-one on demo | *pending* | ☐ |
| Nested carve-out HUD | Parent remaining; carve-out = $0 fee messaging (when shipped) | *pending* | ☐ |
| Refund path 0 fee | Cancel/expiry path shows no platform fee | *pending* | ☐ |
| `feeRecipient` | Treasury live `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` (Dante-confirmed) | config | ☑ |
| Lock→release smoke | Filmed Basescan receipt for lock → release with fee skim | *not yet filmed* | ☐ |
| Seat charge | $79 post-hire charge that sticks | *pending billing live (#4)* | ☐ |

**Demo URL for evidence captures:** https://lockwork-dun.vercel.app/

*When filled, this section becomes the investor-facing “we measured the demo” appendix under white paper item #10.*

---

## 12. Open items & ownership

### Blocked on Dante (do not invent)

1. ~~Treasury `feeRecipient` 0x~~ — **DONE** (`0x47D0A167FF6A5508440ef6D8902076A7aaD0844C`; Dante-confirmed). Hardened multisig upgrade still optional.
2. Naming spends — **DROPPED for now**; stay on Vercel URL (`lockwork-dun.vercel.app`). Do not push domain buys.
3. Ask numbers for pitch deck Slide 9
4. Vertical GMV targets to replace illustrative unit-econ assumptions
5. Counsel pass on custody + hire/seat language before external fundraise use
6. Seat billing live (#4); custodial un-simulate; filmed lock→release smoke; turn off `demo_reset`

### Artifact ownership

| Artifact | Owner | Status |
|----------|-------|--------|
| This white paper body | Make Money | **Draft landed 2026-10-01** |
| Pitch deck outline | Make Money | **Draft landed** — `PITCH_DECK.md` |
| On-chain / fee chapter | Crypto Bro | **Ready** — folded §7 |
| Unit-econ / nested-fee exhibit | Genius | **Ready** — folded §10 |
| Smoke evidence pack | Grok Bot | Placeholders §11 — run when asked |
| Framework spine | Make Money | `ECONOMIC_FRAMEWORK.md` |

### Related internal specs

`PRODUCT_BRIEF.md` · `MONEY_MODEL.md` · `PAYOUT_HYBRID.md` · `OPEN_DECISIONS.md` · `REFUND_POLICY.md` · `ONCHAIN_ESCROW_ADAPTER.md` · `SOCIAL_CREDIT.md` · `REPUTATION.md` · `NAMING_GTM.md` · `APPROVAL_BACKLOG.md`

---

*End of draft body. Updated 2026-10-01 evening ET for live Sepolia escrow + treasury. No contract deploys, no domain buys, no invented tx receipts from this workstream.*
