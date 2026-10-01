# Lockwork — Sponsor placement stress (#14)

*Genius · 2026-10-01 · After Make Money shipped attach financing + 500 bps placement invoice (`custodial_sim`).*
*IP rule held: sponsors = capital attach, not license farm on unselected work.*

## Locked knobs

| Lever | Rule |
|-------|------|
| Release fee | 250 bps outward winner only |
| Placement fee | **500 bps** of financing contribution |
| Seats | $79 company seat |
| Carve-outs / refunds | 0 bps |

## Early stack baseline (200 × $2k, 15% refund)

| Stream | $/mo |
|--------|------|
| Release fee | $8,500 |
| Seats @ 40% keep | $5,372 |
| Float (internal, ~) | ~$622 |

## Placement under attach-rate stress

*When attached: sponsor contributes 30% of job escrow; placement = 5% of that contribution.*

| Attach % of jobs | Sponsored jobs | Contrib GMV | Placement @ 500 bps | vs seats | vs release fee |
|------------------|----------------|-------------|---------------------|----------|----------------|
| 10% | 20 | $12,000 | **$600** | 11% of seat MRR | 7% of fee |
| 20% | 40 | $24,000 | **$1,200** | 22% of seat MRR | 14% of fee |
| 35% | 70 | $42,000 | **$2,100** | 39% of seat MRR | 25% of fee |

**Money_MODEL base (20% attach):** placement **$1,200/mo** — Early total ≈ **$15,694/mo** (fee 54% · seats 34% · placement 8% · float small).

## Does placement cannibalize seats?

| Risk | Verdict |
|------|---------|
| Sponsor replaces hire | **No** if product forces winner → seat path unchanged; placement is on capital, not a seat substitute |
| Employer skips seat because sponsor “paid enough” | Watch attach UX — seat is company ARR; financing is job-level. Keep separate invoices |
| Fee stacking feels expensive | Release 2.5% on winner pay + 5% on *sponsor slice only* — not 7.5% on full purse. Copy must say that |
| IP grab via sponsor | Blocked by ToS spine — capital ≠ license farm |

## Sensitivity: sponsor share of escrow

At 20% job attach, Early:

| Sponsor share | Contrib GMV | Placement |
|---------------|-------------|-----------|
| 15% | $12,000 | $600 |
| 30% | $24,000 | $1,200 |
| 50% | $40,000 | $2,000 |

## Decision rules

1. **Hold 250 bps** — placement is optional upside; don’t hike release fee.
2. Placement stays **on contribution only** — never on full escrow or carve-outs.
3. If attach > 35% and seats still convert, sponsors are gravy; if seats drop when sponsors rise, fix seat UX not fee.
4. Stripe 501 on placement invoices = same gate as seats — sim mark-paid is demo, not ARR.
5. Re-run when first 20 live placement invoices exist.

## Status

| Item | State |
|------|-------|
| #14 attach + 500 bps invoice | **Shipped** (sim) |
| Early placement @ 20% | ~$1,200/mo model |
| Cannibalization of seats | Not implied by math if invoices stay separate |
| Fee | **Hold 250 bps** |

*Companion:* `SEAT_KEEP_306090.md` · *Product:* https://lockwork-dun.vercel.app/
