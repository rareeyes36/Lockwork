# Lockwork On-Chain Escrow & Fee Architecture

*White-paper chapter · Crypto Bro · Audience: investors and serious partners · Grounded to live product state as of 2026-10-01 evening ET*

**Product:** Lockwork (live: [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/) · feed: [/feed](https://lockwork-dun.vercel.app/feed) · deploy helper: [/deploy.html](https://lockwork-dun.vercel.app/deploy.html))  
**Brand line:** Lock the payout. Ship the work. Hire the winner.  
**Status:** Base Sepolia escrow **LIVE**; Dante treasury **LIVE** as `feeRecipient`; custodial still simulated.

---

## 1. Thesis

Lockwork sells **certainty of payout that converts into a hire** — not billable hours, not reverse auctions, and not unpaid speculative contests. The employer locks a sealed purse before competition is serious; workers compete by shipping the artifact (the bid *is* the work); exactly one winner is paid and joins that employer’s company. Hybrid escrow — custodial ledger plus Base USDC — makes the purse enforceable across fiat-friendly and crypto-native participants without turning the product into either a traditional money-transmitter desk or a prize-only contest site.

---

## 2. Why hybrid beats pure TradFi escrow and pure contest sites

| Model | Failure mode for this job | Lockwork response |
|-------|---------------------------|-------------------|
| Classic contest sites | Unpaid labor; prize optional or opaque; no hire | Money locked before submissions matter; one paid winner becomes a seat-bearing hire |
| Pure TradFi escrow / marketplace hold | Workers must trust platform custody alone; crypto-native capital sits outside the loop | Same state machine on a custodial rail *and* an on-chain rail; employer chooses rail at fund time |
| Pure on-chain contest | Wallet friction for every employer; weak fiat path; employment/seat economics ignored | Custodial-sim first for product completeness; on-chain as first-class second path; seats ($79) convert contest CAC into ARR |

**Shared product contract (both rails):** funds move only through `lock` → competition → `release` (one winner) or `refund` (employer). Workers never call escrow. Platform fee is identical on both rails: **250 bps only on outward release to a winner**. Nested company trees may carve capital internally at **0 bps**; fee fires again only when that capital later leaves the tree to a winner payee.

Hybrid is therefore not a branding choice. It is the minimum architecture that (a) proves the purse before work, (b) serves both settlement cultures, and (c) keeps fee incidence auditable under one rule set.

---

## 3. Rail mechanics: lock → compete → release / refund

### Shared escrow states

```
draft → funded → in_review → paid
                ↘ expired_refunded
                ↘ cancelled_refunded
                ↘ disputed (v2 — not in alpha)
```

| State | Meaning |
|-------|---------|
| `draft` | Job written; no capital locked |
| `funded` | Full payout locked; submissions open until deadline |
| `in_review` | Deadline or early close; demos read-only; contract/ledger still holds funds |
| `paid` | Exactly one winner; funds released |
| `expired_refunded` / `cancelled_refunded` | Full return to employer; **0** platform fee |
| `disputed` | Deferred to v2 |

Both rails implement the same `EscrowAdapter` surface: `lock`, `release`, `refund`, `status`. Job records carry `rail`, `escrow_ref`, `amount`, `currency`, and `state`. Rail is chosen at fund time; there is no mid-job bridge between custodial and on-chain in v1.

### Who may call what

| Action | Actor | Notes |
|--------|--------|------|
| `lock` | **Employer** | Custodial: card/bank/balance hold. On-chain: wallet Connect → Approve USDC → Lock |
| `release` | **System and/or employer** after exactly one winner is selected | Push payout; workers have no `claim()` in v1 |
| `refund` | **System** on expiry; **employer** on allowed cancel | Never a worker |
| Workers / lead bots | — | No fund moves in v1 |

### Preferred on-chain path (design target)

- **Chain:** Base L2 (mainnet chain id `8453`; test: Base Sepolia `84532`)
- **Asset:** Native USDC (6 decimals); integer fee math only
- **UI:** Vercel-hosted Lockwork OS; wallet Connect → Approve → Lock on fund
- **Contract:** `LockworkEscrow.sol` — **LIVE on Base Sepolia** at `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` ([Basescan](https://sepolia.basescan.org/address/0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722))
- **Events (minimum):** `Locked`, `Released`, `Refunded`
- **Auth:** employer for own escrow and/or platform relayer after the product state machine authorizes; release/refund use checks-effects-interactions + nonReentrant patterns

**Live `/api/config` (2026-10-01 evening ET):** `chain.enabled: true` · escrow `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` · `fee_recipient` `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` · `feeBps` 250 · Base Sepolia · on-chain `simulated: false` · **custodial still `simulated: true`** · `demo_reset` may still be true. Sepolia USDC candidate `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. This is **live testnet settlement**, not Base mainnet.

---

## 4. Fee incidence (250 bps, D1 leaf-outward)

| Event | Platform fee |
|-------|----------------|
| Lock (any rail) | **0** |
| Internal `parent_carveout` | **0** |
| Expansion lock (new capital into a child) | **0** at lock; fee when that capital later releases outward |
| Outward `release` to a winner | **250 bps** (2.5%) |
| Refund (`expired_refunded` / `cancelled_refunded`) | **0** |
| Sponsor placement (when financing attaches) | **500 bps** of contribution (separate line) |

Integer math (USDC 6-dec):

```
fee_amount = amount * 250 / 10000   // floor
winner_net = amount - fee_amount
```

### Numeric example (flat job)

Employer locks **4,000 USDC**. One winner is selected.

| Line | Amount |
|------|--------|
| Locked | 4,000.000000 USDC |
| Platform fee (250 bps) | 100.000000 USDC → `feeRecipient` |
| Winner net | 3,900.000000 USDC |

### Nested example (D1 — no double tax on idle capital)

Root locks **$10,000**. Carve-outs: **$4,000** and **$3,000** to children (**0** fee on the transfers). One leaf ($4,000) pays a winner → platform fee **$100**; winner net **$3,900**. If both leaves later pay winners under D1, fee = ($4k + $3k) × 2.5% = **$175**. Residual root capital fees only if/when paid outward to a root-level winner. Max nesting depth in v1: **3**.

On-chain v1 escrows are **flat** job deposits; nested carve-outs remain custodial/ledger until a later policy consciously moves trees on-chain. Fee *incidence* still follows D1 on every rail so employers are never taxed for splitting budget inside the company tree.

**Related income stack (not on-chain skim):** company seats **$79**/mo after hire (billing rolls up to the company); optional sponsor placement at **500 bps**; custodial float is internal-only and never promised or shown on public surfaces.

**`feeRecipient` — LIVE:** Dante treasury `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` (confirmed by Dante in 1:1 with Crypto Bro). Policy unchanged: treasury wallet (multisig / hardened custody preferred), **never** the deploy or agent hot wallet. On-chain fee capture is wired on Sepolia; custodial fee path remains simulated.

---

## 5. Public reputation vs private GMV

Lockwork splits trust surfaces deliberately:

| Surface | Shows | Does not show |
|---------|-------|----------------|
| Company OS (`/`) | Escrow state, wallet Connect/Approve/Lock, fee copy, nested budgets | — (money belongs here) |
| Public `/feed` and `/u/:handle` | Jobs completed, badges, demerits, employment-days style reputation | Escrow amounts, GMV, fee tallies, purse sizes |

Status compounds matching quality without leaking pricing power or inviting fee gaming. GMV and released volume stay inside the company OS and operator metrics. Public profiles are **ENS-ready later** (`*.eth` / Base names as identity handles) — identity binding is a roadmap item, not a live claim. Product naming assets (`lockwork.eth`, `lockwork.io`, and related) remain **unexecuted**; this chapter does not claim domain ownership.

---

## 6. Trust assumptions and risks

### Assumptions investors should underwrite

1. Employers will lock real value before treating submissions as serious.
2. Exactly-one-winner + hire conversion is the product event (not “best of N prizes”).
3. Both rails remain fee-parity under D1 so switching rails does not change the economic contract.
4. Workers never control escrow keys or claim paths in v1 — reduces social-engineering surface.
5. Public dollar-free reputation is a feature, not a temporary omission.

### Material risks (draft mitigations)

| Risk | Mitigation posture |
|------|--------------------|
| **Custodial rail ≈ money transmission / employment-adjacent regulation** | Prefer on-chain for early crypto ICP; keep “hire / company seat” wording careful in decks and filings; delay promising float yield |
| **`feeRecipient` key custody** | Dante treasury multisig (or equivalent); never single hot EOA for mainnet fees; never deploy wallet as recipient |
| **Spoofed winner oracle** | Winner set only after authenticated product selection; release restricted to system/employer roles |
| **Wrong chain / wrong USDC** | Hard chain-id checks; verify Circle/BaseScan addresses immediately before any deploy (Sepolia vs Base mainnet differ) |
| **Wallet UX friction** | Base for low gas; clear Connect → Approve → Lock; optional Permit2 later |
| **Stuck funds** | Explicit refund paths; pause/rescue/upgrade policy only with Dante-approved admin design |
| **Testnet → mainnet gap** | Sepolia escrow live; filmed lock→release smoke + custodial un-simulate still required before Base mainnet |
| **Naming / trademark** | Buy order frozen until Dante executes; registration ≠ mark clearance |

---

## 7. Roadmap gates (cash-relevant order)

Suggested execution order aligns with the approval backlog cash order **1 → 2 → 4 → 14 → 9/10**:

| Gate | Outcome |
|------|---------|
| **1. Treasury address** | **DONE** — `feeRecipient` = Dante treasury `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` |
| **2. Sepolia** | **DONE (deploy)** — escrow `0xa24D…C722` live; lock→release smoke receipt **not yet filmed** |
| **3. Base mainnet** | Re-verify native USDC; audit/review gate; production bytecode; relayer gas policy documented |
| **4. Un-simulate / seats** | On-chain un-simulated; **custodial still simulated**; seat billing ($79) still open (#4); turn off `demo_reset` |
| **Docs / GTM** | Pitch deck + this white-paper family with live Sepolia facts |

Shipping order for adapters remains: shared state machine → **custodial-sim** (already first; full contest UI) → custodial-live → **on-chain** as second path without rewriting jobs.

---

## 8. Open items still needing Dante

Agents and partners must **not** invent tx receipts, buy domains, deploy contracts, or flip production env vars. Remaining open items:

1. ~~Treasury `feeRecipient` 0x~~ — **LIVE** `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` (Dante-confirmed). Optional: harden to multisig.  
2. **Naming spends** — **DROPPED**; stay on Vercel URL. Do not purchase domains.  
3. Confirm Base-only + USDC-only v1 scope and re-verify USDC addresses at mainnet deploy time  
4. Relayer model for release/refund gas; pause / rescue / upgrade (immutable vs proxy)  
5. Whether nested carve-outs ever move on-chain (v1 default: no)  
6. Regulatory copy pass for custody and hire/seat language before external fundraising use of this chapter  
7. Filmed lock→release smoke on Sepolia; custodial un-simulate; seat billing live (#4); `demo_reset` off on prod  

**Live product:** [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/) — contest OS loop shipped; **Base Sepolia escrow + Dante treasury LIVE**; custodial still simulated; seat billing not yet charged. Live testnet settlement of the sealed-purse thesis — not Base mainnet, not a fully live custodial clearinghouse.

---

*Related internal specs (folded, not restated wholesale): `ONCHAIN_ESCROW_ADAPTER.md`, `PAYOUT_HYBRID.md`, `ECONOMIC_FRAMEWORK.md`, `MONEY_MODEL.md`, `NAMING_BUY_ORDER.md`.*
