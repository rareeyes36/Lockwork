# Naming buy order — Lockwork

**STATUS: FROZEN DRAFT — DO NOT PURCHASE until Dante explicitly says go.**

*Drafted 2026-09-26 · Owner: Dante Final · Executor: Crypto Bro / agents must not register.*

---

## Priority pack (buy when Dante says go)

| # | Asset | Where | Est. cost | Availability intel (2026-09-26) |
|---|-------|-------|-----------|----------------------------------|
| 1 | **lockwork.eth** | ENS — [app.ens.domains/lockwork.eth](https://app.ens.domains/lockwork.eth) | ~$5/yr + mainnet gas | **AVAILABLE** |
| 2 | **lockwork.io** | Namecheap (or equivalent registrar) | ~$35 first year (typical .io) | **AVAILABLE** |

### Why this pack

- **ETH-native identity:** `lockwork.eth` matches crypto/builder beachhead and hybrid escrow story (on-chain rail is real, not cosplay).
- **Cheap web beachhead:** `lockwork.io` is a workable public URL without paying Afternic .com premiums.
- Together: wallet/profile recognition + linkable marketing site. Enough for alpha stickers and GTM; .com can wait.

---

## Near-free add-ons (recommend with priority pack when Dante says go)

| Asset | Where | Est. cost | Intel (2026-09-26) |
|-------|-------|-----------|---------------------|
| **lockwork.base.eth** | [base.org/names](https://www.base.org/names) | Free 1yr if CB Verification / CB One / listed NFT; else ~0.001 ETH/yr (~$2.69) | **AVAILABLE** (`available()=true`) |
| **Farcaster fname `lockwork`** | Farcaster | Free | **AVAILABLE** |

These are cheap/free Basement identity — strong fit with Base + USDC escrow. Still **no register until Dante says go**.

---

## Hold / optional (do not buy unless Dante expands the order)

| Asset | Status / note | Action |
|-------|---------------|--------|
| **hireproof.eth** | AVAILABLE — runner-up brand (NAMING_GTM) | Hold; buy only if protecting runner-up |
| **lock-work.eth** | AVAILABLE — hyphen trap | Optional defensive; low priority |
| **lockwork.co** | ~$999 | Skip unless Dante expands budget |
| **lockwork.com** | ~$12,500 Afternic | **Skip unless war chest** — not in priority pack |
| **lockwork.app** | **TAKEN** | Do not pursue |
| **Unstoppable `lockwork.*`** | Polygon UNS `exists=false` (unminted); USD list prices API blocked | Optional L2 naming later — out of this pack |
| **SNS `.sol`** | Registrations paused | **Skip for ETH v1** |

---

## Estimated all-in cost (priority pack only)

| Line | Low | High | Notes |
|------|-----|------|-------|
| lockwork.eth registration | ~$5 | ~$5 | 1 year ENS |
| Mainnet gas (ENS register) | ~$5 | ~$40 | Volatile; Base not used for ENS root |
| lockwork.io | ~$30 | ~$45 | Registrar promo vs list |
| **Pack total** | **~$40** | **~$90** | Excludes .com / .co / extras |

Near-free add-ons (recommend): `lockwork.base.eth` (free–~$3/yr) + Farcaster fname `lockwork` (free).  
Optional defensive: hireproof.eth (~$5+gas), lock-work.eth (~$5+gas).  
**Not in estimate:** lockwork.com ($12.5k), lockwork.co (~$999). ENSv2 may later price root names ~$8/yr — re-check at go.

---

## Exact buy checklist (when Dante says go — still no execution now)

**Trigger words from Dante:** `"buy"` / `"register"` / `"go"` for the **named assets** below. Until then: freeze.

1. Re-check availability live:
   - ENS: open `app.ens.domains/lockwork.eth` — confirm still free.
   - Registrar: Namecheap search `lockwork.io` — confirm still free and price.
2. Confirm paying wallet / card and who holds recovery (Dante-owned — not agent hot keys for long-term).
3. Register **lockwork.eth** first (or .io first if gas spike — Dante call); set resolver + reverse record later. Note: ENSv2 may move root pricing toward ~$8/yr later.
4. Register **lockwork.io**; enable WHOIS privacy; point DNS only after Dante picks host.
5. Claim **lockwork.base.eth** on base.org/names (use free tier if CB Verification / CB One / listed NFT qualifies).
6. Claim Farcaster fname **lockwork** (free) if still available.
7. Screenshot receipts; store renewal dates in brand ops (not in git secrets).
8. Do **not** auto-buy hireproof.eth / lock-work.eth / .co / .com / Unstoppable / SNS unless Dante adds them to the order.
9. Trademark knockout still open (see Risks) — registration ≠ mark clearance.

**Crypto Bro / agents must not register until user says "buy" / "register" / "go" for named assets.**

---

## Risks

| Risk | Note |
|------|------|
| **Front-run** | Public drafts may tip squatters; act quickly *after* go, not before |
| **Price change** | .io promo ends; ENS gas spikes; Afternic .com moves |
| **Trademark still open** | USPTO / counsel knockout not done — domain ≠ legal clear to brand everywhere |
| **Wrong registrar account** | Must land under Dante-controlled login/recovery |
| **Agent overreach** | Any purchase without explicit go is a process failure |

---

## Explicit freeze line

> **Crypto Bro / agents must not register, buy, or spend on any naming asset until Dante (user) explicitly says `"buy"` / `"register"` / `"go"` for the named assets in this pack.**  
> This file is a frozen draft checklist only. Availability intel dated **2026-09-26** — re-verify at purchase time.

---

## Related

- [`NAMING_GTM.md`](./NAMING_GTM.md) — Lockwork decided; HireProof runner-up
- [`BRAND.md`](./BRAND.md)
- [`ONCHAIN_ESCROW_ADAPTER.md`](./ONCHAIN_ESCROW_ADAPTER.md) — Base + USDC rail (separate from ENS mainnet gas)
