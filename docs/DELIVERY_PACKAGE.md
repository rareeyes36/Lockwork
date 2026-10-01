# Lockwork — Delivery package (2026-10-01)

**Product:** [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/)  
**Live config:** [https://lockwork-dun.vercel.app/api/config](https://lockwork-dun.vercel.app/api/config)  
**Repo:** [https://github.com/rareeyes36/Lockwork](https://github.com/rareeyes36/Lockwork) · branch `claude/website-atlas-demo-review-4m6403`

## Pitch deck (direct link)

- [docs/PITCH_DECK.md](https://github.com/rareeyes36/Lockwork/blob/claude/website-atlas-demo-review-4m6403/docs/PITCH_DECK.md)

## White paper (direct links)

- **Full paper:** [docs/WHITEPAPER.md](https://github.com/rareeyes36/Lockwork/blob/claude/website-atlas-demo-review-4m6403/docs/WHITEPAPER.md)
- **On-chain / fee chapter (Crypto Bro):** [docs/WHITEPAPER_ONCHAIN_CHAPTER.md](https://github.com/rareeyes36/Lockwork/blob/claude/website-atlas-demo-review-4m6403/docs/WHITEPAPER_ONCHAIN_CHAPTER.md)
- **Unit-econ / nested-fee exhibit (Genius):** [docs/WHITEPAPER_UNIT_ECON_EXHIBIT.md](https://github.com/rareeyes36/Lockwork/blob/claude/website-atlas-demo-review-4m6403/docs/WHITEPAPER_UNIT_ECON_EXHIBIT.md)

## This package index

- [docs/DELIVERY_PACKAGE.md](https://github.com/rareeyes36/Lockwork/blob/claude/website-atlas-demo-review-4m6403/docs/DELIVERY_PACKAGE.md)

## Live settlement (Base Sepolia testnet)

| Item | Value |
|------|--------|
| Fee / placement / seat / depth | 250 bps / 500 bps / $79 / ≤3 |
| Treasury `fee_recipient` | `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` |
| Escrow | `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` |
| Explorer | [Base Sepolia Basescan](https://sepolia.basescan.org/address/0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722) |
| On-chain rail | `simulated: false` (testnet) |
| Custodial rail | still `simulated: true` |
| Closed alpha | `true` |
| `demo_reset` | still `true` — set Vercel `DEMO_RESET=off` |

## Completeness (honest)

| # | Item | Status |
|---|------|--------|
| 1 | Treasury feeRecipient | **Done** (Dante-confirmed) |
| 2 | Sepolia escrow + on-chain un-sim | **Done** (testnet; mainnet not claimed) |
| 3 | Un-sim custodial | Open |
| 4 | Live seat billing @ $79 | **In progress** (Make Money) |
| 9 | Pitch deck | **Draft delivered** (markdown) |
| 10 | White paper | **Draft delivered** (markdown) |
| 11 | Naming buys | Dropped / deferred |
| 14 | Sponsors live | After seats |
| 21 | `demo_reset` off | Needs your Vercel env |

## Money read (Genius)

Fee model intact (D1 leaf-outward 250 bps). Early model stack ~$15.7k/mo at 200×$2k with seats @ $79. **Do not hike fee** — ship seat charge next. Unit-econ tables are assumptions until keep 30/60/90 is measured on live seats.
