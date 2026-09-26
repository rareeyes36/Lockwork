# Lockwork — Money model stress (Genius)

*Product public name: Lockwork. Internal code: contest_os.*

*Assumptions only — replace when Dante sets target GMV / vertical. Fee live placeholder: **250 bps**.*

## Locked mechanics
| Lever | Rule |
|-------|------|
| Release fee | 250 bps on **outward** release to a winner only (not carve-outs); both rails. See OPEN_DECISIONS D1 (proposed) |
| Winner net | `amount - fee_amount` |
| Refunds | No platform fee on `expired_refunded` / `cancelled_refunded` |
| Float | Custodial internal only; never shown to employers/employees |
| Seats | Win → company seat (`employments`); billing rolls up to **the company**; after custodial live |
| Sponsor placement | Fee on financing contribution when live (model uses 500 bps) |

## Assumptions (stated so they can be swapped)
| Knob | Value | Why |
|------|-------|-----|
| Refund / no-winner rate | 15% of funded jobs | Escrow that never releases → $0 fee |
| Avg days locked | 14 | Funded → paid / refund |
| Custodial float APR | 4% | Conservative treasury; internal |
| Seat conversion | 40% of wins keep active seat | Rest churn `pending` → `churned` |
| Default seat price tested | $29 / **$79** / $149 mo | Recommend $79 until vertical known |
| Financing attach rate | 20% of jobs | Early sponsor penetration |
| Sponsor share of escrow | 30% when attached | Co-lock / top-up |
| Placement fee | 500 bps of contribution | Separate from release fee |

## Scenario table (monthly)

### A — Release fee + float
| Stage | Jobs/mo | Avg escrow | Funded GMV | Released GMV | Fee @ 250 bps | Float ~/mo |
|-------|---------|------------|------------|--------------|---------------|------------|
| Seed | 50 | $500 | $25k | $21.3k | **$531** | ~$39 |
| Early | 200 | $2,000 | $400k | $340k | **$8,500** | ~$622 |
| Growth | 1,000 | $5,000 | $5.0M | $4.25M | **$106k** | ~$7.8k |
| Scale | 5,000 | $8,000 | $40M | $34M | **$850k** | ~$62k |

Float ≈ (funded × 14/30) × (4%/12). Small vs fee until Scale — fee is the print; float is silent margin.

### B — Employment seats (MRR)
Wins/mo ≈ jobs × 85%. Active seats ≈ wins × 40%.

| Stage | Wins | Seats | @$29 | **@$79** | @$149 |
|-------|------|-------|------|----------|-------|
| Seed | 42 | 17 | $493 | **$1,343** | $2,533 |
| Early | 170 | 68 | $1,972 | **$5,372** | $10,132 |
| Growth | 850 | 340 | $9,860 | **$26,860** | $50,660 |
| Scale | 4,250 | 1,700 | $49k | **$134k** | $253k |

At Early + $79: **~$64k ARR** from seats alone — this is the compounding lever vs one-shot contest fees.

### C — Sponsor placement (when live)
| Stage | Sponsored jobs | Contrib GMV | Placement @ 5% |
|-------|----------------|-------------|----------------|
| Seed | 10 | $1.5k | $75 |
| Early | 40 | $24k | $1,200 |
| Growth | 200 | $300k | $15k |
| Scale | 1,000 | $2.4M | $120k |

## Stack snapshot — Early (200 × $2k)
| Stream | $/mo |
|--------|------|
| Release fee | 8,500 |
| Float (internal) | ~622 |
| Seats @ $79 | 5,372 |
| Sponsor placement | 1,200 |
| **Total** | **~$15.7k** |

Seat ARR in that snapshot: **~$64k**. Fee still leads cash; seats build valuation multiple.

## Stress findings
1. **250 bps is fine for v1** vs Upwork-style take-rates if seats convert. Do not raise fee to “fix” Seed — kill conversion and invite density.
2. **Seat price matters more than +50 bps fee** past Early. Prefer shipping seat billing over fee hikes.
3. **Float is not a pitch** — keep internal; at Early it’s hundreds/mo, not a story.
4. **Refund rate is the silent killer** — every +5 pp refund ≈ −5% fee revenue. Product: push employers to pick a winner before expiry.
5. **Sponsor placement is optional upside** until financing UX exists; don’t block core loop on it.
6. If vertical is high-ticket (avg escrow ≥ $10k) at low volume, fee alone funds the company; seats still win long-term.

## Recommendation (until Dante sets targets)
- Keep **250 bps**.
- Default seat plan stub: **`workspace_member` @ $79/mo** (change one constant later).
- Instrument: released GMV, refund rate, seat conversion 30/60/90 — those three decide the next fee move.
- Reputation gate (E): feed `employment_days` into conversion quality later; don’t monetize tiers in v1.

## Replace-me inputs
When available: vertical, target jobs/mo, avg escrow, real refund %, seat willingness-to-pay. Re-run this file; do not invent “actuals.”

## Nested trees (proposed — OPEN_DECISIONS.md)

- Carve-outs do not create fee GMV; only outward winner payouts do.
- Expansion capital increases fee base when those jobs pay winners.
- Multiple leaf wins under one parent → multiple **company** seats possible; fee still once per outward payout, not per carve-out.
- Depth cap 3 / no cycles (v1) keeps escrow walks auditable.
- Model tables above still treat “Released GMV” as **outward** winner GMV (aligns with D1).

## Nested fee stress — $10k root tree (Dante D1 locked preference)

Setup: root locks **$10,000**. Carve-out children **$4,000** + **$3,000**. One leaf ($4k) pays a winner. Fee = 250 bps.

| Policy | Platform fee | Notes |
|--------|--------------|-------|
| **D1 leaf-outward (preferred)** | **$100** | Only $4k × 2.5%; carve-outs $0; winner net $3,900 |
| Fee on every carve-out + leaf pay | **$275** | $100+$75 carve taxes + $100 leaf — employers feel split as a charge |
| Double-dip root release + leaf | **$350** | $250 on $10k + $100 on $4k — same capital taxed twice; churn risk |

If both leaves later pay winners under D1: fee = ($4k+$3k)×2.5% = **$175** (still no fee on the carve transfers). Residual $3k on root fees only if/when paid outward to a root-level winner.

**Paste lines for OPEN_DECISIONS:** see Genius reply to Make Money (3–5 lines).

