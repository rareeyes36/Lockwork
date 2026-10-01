# Lockwork — Economic & Product Framework (live-grounded)

*Drafted 2026-10-01 by Make Money · Inputs: Crypto Bro + Genius live smoke · Site: https://lockwork-dun.vercel.app/*

## 1. Philosophy (what we are selling)

**Thesis:** Lockwork sells *certainty of payout that converts into a hire* — not hours, not bids, not free contest labor.

| Model | What the worker risks | What the employer buys |
|-------|----------------------|-------------------------|
| Upwork / Fiverr | Time for maybe-pay | Hours / gigs |
| Classic contest sites | Unpaid work for maybe-prize | Speculative free labor |
| **Lockwork** | Time against a **sealed purse** | **Locked payout + one hire** |

- The **bid is the work** (ship the artifact), not a price auction.
- Money is a **sealed commitment** (hybrid escrow: custodial and/or Base USDC) before competition is serious.
- Exactly **one winner** is paid *and* becomes an **employee** of that employer’s company.
- Public surfaces show **reputation** (jobs completed, demerits); **GMV stays private** in the company OS — status compounds matching without leaking pricing power or inviting fee gaming.

**Brand line (locked):** Lock the payout. Ship the work. Hire the winner.

## 2. Mechanistic economics (who pays whom)

### Live config (Vercel `/api/config`)
| Knob | Value | Role |
|------|-------|------|
| Platform fee | **250 bps** | Tax on **outward release to winner only** (D1: carve-outs 0, refunds 0) |
| Placement fee | **500 bps** | When financing/sponsor capital attaches |
| Company seats | **$79** | Post-hire ARR; contest CAC → subscription |
| Nesting depth | **≤ 3** | Company → sub-teams → jobs/sub-jobs; residual escrow only |
| On-chain | `chain.enabled: false`, `escrow: null` | Scaffolded; still simulated |

### Income stack (multi-factor)
1. **Release fee** — 2.5% of leaf outward winner pay (core).
2. **Seats** — $79 after hire (LTV / retention).
3. **Sponsor placement** — 500 bps when financing plugs into a job.
4. **Custodial float** — silent, until regulated/licensed path is clear.
5. **Later:** premium plugins / bot tolls / software sponsors.

### Nested capital (Genius)
Parent jobs that carve into sub-jobs release/refund **only residual**; fee fires again only on later outward winner releases — no double-tax on the same locked dollar sitting idle.

### Trust split
- **`/` OS** — money, escrow, wallet Connect/Approve/Lock, fee copy.
- **`/feed` + `/u/:handle`** — badges, jobs, demerits only (dollar-free by design).

## 3. Live site state (2026-10-01)

**Shipped**
- Contest OS loop (post → fund → submit → review → pay-one).
- Public social shell (`/feed`, `/u/*`) + migration 022 tables.
- Clearinghouse UI (navy `#0B1F3A` / slate / white) — theme commit `f879042`.
- Hybrid adapters + `LockworkEscrow.sol` + wallet UX **present but cold**.

**Cold / frozen**
- Sepolia / live `feeRecipient` (must be Dante treasury, not deploy wallet).
- Naming domain buy.
- Real (non-sim) rails; seat billing processor; full refund-cascade demos on prod DB.

## 4. Tangential goals, improvements, implications

### Near-term (functional app → “real”)
| Gap | Why it matters | Owner seat |
|-----|----------------|------------|
| Dante treasury `feeRecipient` | On-chain fee capture is fake until set | Dante + Crypto Bro |
| Un-simulate on-chain (Sepolia → Base) | Proof for WP tx links + trust | Crypto Bro |
| Seat billing live | Turns hire into ARR | Make Money + Genius |
| Seed / job→feed wiring on Vercel | Empty feed looks dead | Make Money |
| Employer reputation symmetry | Matching quality both sides | Genius schema |
| Refund cascade + demerit demo | Replaces dispute desk economically | Make Money |
| Beachhead ICP case ($2k–$10k ship-to-hire) | Deck needs one concrete story | Dante + Make Money |

### Tangents (compounding, not v1 blockers)
- ENS / `*.base.eth` for company & worker identity on public profiles.
- On-chain attestation of “paid + hired” as portable credit.
- Sponsors as secondary escrow contributors (materials, PoD, financing).
- Plugin marketplace take-rate once IDE/DAW/video seats exist.
- Regulatory: custodial rail ≈ money transmission / employment-adjacent wording — prefer on-chain for early crypto ICP; keep “employee” legally careful in deck/WP.

### Product implication
A **functional** Lockwork is not “pretty UI + sim escrow.” It is: lock real value → ship work → pay one → seat converts → reputation updates publicly without showing $. Until treasury + one real rail + seat charge exist, we are a **high-fidelity demo of the money thesis**, not yet a clearinghouse.

## 5. Pitch deck spine (Make Money owns)

1. **Problem** — Interview theater; unpaid contests; escrow theater that never hires.
2. **Insight** — Price certainty; bid = work; hire is the conversion event.
3. **Product** — Lock → ship → hire (hybrid escrow + company OS).
4. **Unit economics** — 250 bps + $79 seats + 500 bps placement; depth-3 nesting.
5. **Trust architecture** — Public reputation / private GMV; social credit vs dispute desk.
6. **Rails** — Custodial + Base USDC; feeRecipient = treasury.
7. **GTM** — Beachhead: solo founders / small studios needing bots/scripts/automation ($2k–$10k jobs).
8. **Ask** — Alpha seats / escrow volume / treasury bootstrap (fill when Dante decides).

## 6. White paper chapters (outline)

1. Contest-to-hire primitive vs marketplaces.
2. D1 nested fee math & leaf-outward-only rule.
3. Hybrid escrow state machine (custodial + on-chain adapters).
4. Company / sub-team / job tree & seat roll-up.
5. Public/private data split & social-credit enforcement.
6. Sponsor types & placement fee.
7. On-chain design (Base USDC, LockworkEscrow, feeRecipient).
8. Regulatory & trust risks (custody, employment language).
9. Roadmap: sim → Sepolia → Base mainnet; plugin/bot tolls.

## 7. Division of labor (next)

| Artifact | Owner | Status |
|----------|-------|--------|
| This framework | Make Money | **Drafted** |
| Pitch deck slides | Make Money | Pending Dante greenlight |
| White paper body | Make Money (edit) | Pending greenlight |
| On-chain + fee appendix | Crypto Bro | Ready when asked |
| Unit-econ + nested-fee exhibit | Genius | **Drafted** — `WHITEPAPER_UNIT_ECON_EXHIBIT.md` |

*Naming and treasury buys stay frozen until Dante says go.*
