# Hybrid payout module

## Goal
Lock job money so workers trust the purse, employers keep control until one winner is chosen, and both fiat-friendly and crypto-native employers and employees can play.

## Shared job escrow states
```
draft → funded → in_review → paid
                ↘ expired_refunded
                ↘ cancelled_refunded
                ↘ disputed (v2)
```

| State | Meaning |
|-------|---------|
| `draft` | Job written; no money locked |
| `funded` | Full payout locked; submissions open until deadline |
| `in_review` | Deadline hit or employer closed early; read-only demos |
| `paid` | Exactly one winner; funds released to them |
| `expired_refunded` | No winner / timeout rules; funds back to employer |
| `cancelled_refunded` | Employer cancelled under allowed rules; funds back |

Transitions are identical for both rails. Only the adapter methods differ.

## Adapter interface
```
EscrowAdapter
  lock(jobId, amount, currency, payer) → escrowRef
  release(escrowRef, winnerPayee) → txRef
  refund(escrowRef, reason) → txRef
  status(escrowRef) → funded | released | refunded | unknown
```

### Custodial adapter
- Payer: card, bank, or platform balance
- Hold: ledger entry `hold` against employer account
- Release: credit winner balance / payout method
- Refund: release hold back to employer
- Fast to ship; requires trust in the platform and compliance (KYC when real money moves)

### On-chain adapter
- Payer: wallet signs deposit into escrow contract (stablecoin, e.g. USDC)
- Hold: contract balance keyed by `jobId` / `escrowRef`
- Release: contract pays winner address (employer or oracle/relayer triggers with signed “winner chosen”)
- Refund: contract returns to employer wallet on cancel/expiry
- Transparent; slower UX (gas, wallet connect); chain + stablecoin choice is a product decision

## Who may trigger what
| Action | Actor |
|--------|--------|
| `lock` | Employer (when posting/funding) |
| `release` | System after employer selects **one** winner (or employer confirm) |
| `refund` | System on expiry; employer on allowed cancel; never a worker |

Workers never touch escrow. Lead bots do not move funds unless explicitly granted a future “treasury” role (out of v1).

## v1 implementation order
1. Shared state machine + DB fields: `rail`, `escrow_ref`, `amount`, `currency`, `state`
2. **Fake/custodial ledger in-process** so the full contest UI works end-to-end
3. Custodial adapter behind real payments provider when ready
4. On-chain adapter (one chain, one stablecoin) as second path — same UI, wallet connect on fund

Hybrid in product terms means both rails are first-class in the model from day one; shipping order can still be custodial-sim → custodial-live → on-chain without rewriting jobs.

## Open (non-blocking defaults)
- Default test rail: custodial sim
- First on-chain target: assume USDC on a low-fee L2 (pick concrete chain when integrating wallets)
- Platform fee: **250 bps** on `release` only (same rule both rails); see MONEY_MODEL.md

## Platform economics (Genius #1 — folded)
- **`platform_fee_bps`**: basis points taken only on escrow `release` (same % both rails).
- **`fee_amount`**: computed at release = `amount * platform_fee_bps / 10000`; winner receives `amount - fee_amount`.
- Custodial funds in `funded` / `in_review` may generate **internal float yield** for the platform; never promised or shown to employers/workers in v1.
- On-chain: prefer contract skim on release for parity; fallback post-release invoice only if chain constraints force it.
- Fee bps value: **decided** — `250` (2.5%) for now (Dante Final, 2026-09-26).

## Nested fee rule (proposed — Lockwork / Dante preferred)
- **250 bps only on outward release to a winner** (money leaves the company tree).
- **Internal carve-outs** parent→child: **0 bps**.
- **Expansion locks**: no fee at lock; 250 bps when that capital later releases outward.
- **Refunds**: 0 bps.
- See `OPEN_DECISIONS.md` §1. Status: proposed until Dante confirms.

## Nested escrow fee incidence (PROPOSED — see OPEN_DECISIONS.md D1)

Pending Dante lock. Working rule for implementation drafts:

- **250 bps** only on **outward release** to a winner payee (money leaves the company tree).
- **`parent_carveout`**: internal tree transfer → **0 bps** (not a release to a winner).
- **`expansion`**: new capital lock → 250 bps when *that* escrow releases outward.
- Parent is not charged merely because children paid; residual parent→winner release *is* charged.
- Refunds: always **0 bps**.

Refund cascade and depth caps: OPEN_DECISIONS.md D2 / D4.
