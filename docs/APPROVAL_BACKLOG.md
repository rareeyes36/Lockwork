# Lockwork — Improvements pending Dante approval

**Dante 2026-10-01:** said **“Proceed with all optimally”** — treat as **approve 1–25**, execute in cash order **1 → 2 → 4 → 14 → 9/10**.  
**Still BLOCKED** on Dante providing **treasury 0x** (`feeRecipient`) and **executing naming spends** (sign/buy). Agents must not invent a treasury address, deploy contracts, set production env, or purchase domains until those inputs land.

*Reply with numbers (e.g. `9 10` or `1–8`), `none`, or edits if you narrow scope.*  
*Frozen until named: treasury, Sepolia, naming buys.*

## Core → functional clearinghouse
1. Set Dante treasury as `feeRecipient` (not deploy wallet) — **BLOCKED on Dante treasury 0x**
2. Flip on-chain: Sepolia deploy → `LOCKWORK_ESCROW_ADDRESS` → un-simulate onchain rail — **BLOCKED on treasury 0x** (then Crypto Bro)
3. Un-simulate custodial rail (real card/balance path)
4. Live seat billing @ $79 (charge that sticks post-hire)
5. Feed populates from real job events (not empty / seed-only)
6. Refund-cascade demo (carve-outs/refunds = 0 fee, nested unwind)
7. Employer reputation symmetry on `/u` (not worker-only)
8. One $2k–$10k ICP ship-to-hire case study (receipts for deck)

## Docs / GTM
9. Pitch deck (Make Money owns) — **IN PROGRESS / draft landed** → `PITCH_DECK.md` (slide-by-slide outline; Ask slide placeholder until Dante)
10. White paper — on-chain/fee (Crypto Bro) + unit-econ/nested-fee (Genius); Make Money edits body — **IN PROGRESS / drafts landed** → `WHITEPAPER.md` (folds `WHITEPAPER_ONCHAIN_CHAPTER.md` §7 + Genius `WHITEPAPER_UNIT_ECON_EXHIBIT.md` / `WHITEPAPER_UNIT_ECON_CHAPTER.md` §10; Grok smoke placeholders §11). Regulatory brief folded (#17).
11. Naming buys when you say buy: `lockwork.eth` + `lockwork.io` (near-free: `lockwork.base.eth`, Farcaster fname) — **1:1 with Dante only** (agents do not purchase)

## Compounding (after core)
12. ENS / Base name as company+worker identity
13. On-chain “paid+hired” attestation (portable credit)
14. Sponsor attach path live (500 bps placement) — **DONE** (custodial_sim invoices; Stripe reserved; platform fee still 250 bps)
15. Plugin / bot tolls (later income layer)
16. Social-credit / demerit enforcement wired to fee clawback rarity
17. Regulatory copy pass (custody + “employee/hire” wording for WP/deck) — *brief note landed in `WHITEPAPER.md` §8 + deck copy rule; full counsel pass still open*

## Money / clarity (Genius)
18. OS-only nested budget HUD (parent remaining / carve-out = $0 fee)
19. Metrics instrumentation: released GMV, refund %, seat keep 30/60/90
20. “Hired role / company seat” copy pass before EoR-looking “employee” language — *applied in deck + WP drafts*

## Product ops (Make Money add)
21. Turn off `demo_reset` on production / alpha (no wipe-button on live)
22. Apply migration 022 (+ feed seed path) on Vercel Postgres so public shell isn’t an empty skin
23. Closed-alpha invite / company onboarding path for beachhead ICP (solo founders / small studios)
24. Dispute desk v2 flag kept off; document social-credit-only for v1 in deck/WP — *documented in WP §5 + deck trust slide*

## Suggested cash order (Genius)
**1 → 2 → 4 → 14 → 9/10** — treasury, real rail, seat billing, sponsors, then paper.  
*9/10 drafts started in parallel (no treasury required for markdown).*

## Ops (Grok Bot)
25. Live smoke checklist (config + dollar-free public + fee parity) as WP evidence pack — *folds under **10**; placeholders in `WHITEPAPER.md` §11 — run when asked*
26. Keep Alpha/Kraken paper kill-switch pause separate — **not** a Lockwork ship gate (out of scope for this backlog)

*Current full set: **1–25** treated approved under “Proceed with all optimally” (26 out-of-band). Execution still gated on treasury 0x + naming sign/buy (1:1 Dante).*

### Make Money status note (2026-10-01 ET)
- **9 / 10:** drafts under `/workspace/make-money-app/` — `PITCH_DECK.md`, `WHITEPAPER.md`
- **1 / 2:** blocked on Dante treasury 0x
- **11:** naming 1:1 with Dante only
- No feeRecipient set, no deploys, no domain buys, no Lockwork app push from this workstream
