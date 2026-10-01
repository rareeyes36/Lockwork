# Lockwork — Seat keep 30/60/90 math (#4 / #19)

*Genius · 2026-10-01 · After Make Money shipped seat invoice stub (`custodial_sim`, $79, Stripe still 501).*
*Assumptions until live Stripe + real cohorts — do not present as audited actuals.*

## What the stub enables

| Signal | Source now |
|--------|------------|
| Attach | hire → open `seat_invoices` |
| Paid convert | `open` → `paid` (mark-paid sim) |
| Keep @ 30/60/90 | `seat_status=active` and invoice renewals still paid at day D |
| Churn | `void` / `seat_status=churned` |

Config live: `seat_billing.price_usd=79`, `rail=custodial_sim`, `stripe_live=false`. Fee stays **250 bps**.

## Funnel definitions

```
wins → attach_rate → paid_rate → keep@30 → keep@60 → keep@90
steady paying seats ≈ wins × attach × paid × keep@90
MRR ≈ paying_seats × $79
```

## Scenario bands (per win)

| Scenario | Attach | Paid | Keep30 | Keep60 | Keep90 | Paying/win |
|----------|--------|------|--------|--------|--------|------------|
| Bear (25% keep) | 55% | 85% | 70% | 55% | 45% | **21%** |
| Base (40% keep) | 70% | 90% | 80% | 70% | 63% | **40%** |
| Bull (55% keep) | 85% | 95% | 88% | 80% | 72% | **58%** |

Base band lands ~**40%** paying/win — matches `MONEY_MODEL.md` seat conversion. Bear ~21%, Bull ~58%.

## Stage MRR @ $79 (wins = jobs × 85%)

| Stage | Wins/mo | Bear MRR | **Base MRR** | Bull MRR | Base ARR |
|-------|---------|----------|--------------|----------|----------|
| Seed | 42 | $706 | $1,333 | $1,952 | **$15,991** |
| Early | 170 | $2,825 | $5,330 | $7,808 | **$63,964** |
| Growth | 850 | $14,127 | $26,652 | $39,041 | **$319,822** |
| Scale | 4250 | $70,633 | $133,259 | $195,205 | **$1,599,110** |

Early Base: ~$5.4k MRR / **~$64k ARR** — same print as the white-paper Early snapshot.

## LTV sketch (Base band)

If monthly churn after day 90 ≈ 8–12% of remaining seats:

| Assumption | Value |
|------------|-------|
| Price | $79/mo |
| Gross margin (ignore processor) | ~95% until Stripe fees |
| Expected paid months (rough) | ~8–12 if Keep90 holds and churn ~10%/mo after |
| Seat LTV (cash) | **~$630–$950** before Stripe take |
| Contest CAC (fee opportunity cost) | Prefer density over fee hike — one retained seat > +50 bps on a $2k job ($10) |

**Compare:** +50 bps fee on Early released GMV $340k = **+$1,700/mo**. One month of Base seats at Early = **~$5.4k**. Seats still win.

## Decision rules (when real keep lands)

1. If **Keep90 < 35%** of attached paid seats → fix product retention before any fee hike.
2. If **Attach < 50%** of wins → fix post-hire UX (one-click attach), not pricing.
3. If **Paid convert < 70%** of opens → Stripe / trust problem; don’t raise $79 yet.
4. If **Keep90 > 55%** and attach healthy → test **$99** before touching 250 bps.
5. Never raise fee to patch thin seats — destroys nesting trust and density.

## Instrument checklist (wire next)

| Metric | SQL sketch |
|--------|------------|
| Attach % | seats with invoice / wins in window |
| Paid % | paid invoices / open+paid |
| Keep30/60/90 | active seats with `seat_started_at` ≥ D days ago still active + last invoice paid |
| Released GMV | outward winner pays only (fee base) |
| Refund % | refunded funded / funded |

## Status

| Item | State |
|------|-------|
| #4 invoice path | **Shipped** (sim mark-paid) |
| Stripe live | Open (501) |
| This math | Model bands — re-run on first 30 real paid seats |
| Fee | **Hold 250 bps** |
| Next cash | #14 sponsors (Make Money) |

*Product:* https://lockwork-dun.vercel.app/ · *Package:* https://lockwork-dun.vercel.app/package*
