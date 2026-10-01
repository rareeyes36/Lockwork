# Lockwork — Pitch Deck Outline

*Make Money draft · 2026-10-01 · Spine: ECONOMIC_FRAMEWORK.md §5*  
*Brand: Lock the payout. Ship the work. Hire the winner.*  
*Live: [https://lockwork-dun.vercel.app/](https://lockwork-dun.vercel.app/) — Base Sepolia escrow LIVE; custodial still simulated; seats not yet billed.*  
*Copy rule (#20): prefer “hired into company / seat” over EoR-looking “employee.”*

**Live config (Vercel `/api/config`, 2026-10-01 evening ET):** 250 bps leaf-outward · 500 bps placement · $79 seats · depth ≤ 3 · `chain.enabled: true` · escrow `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` · treasury / `fee_recipient` `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` · Base Sepolia · on-chain `simulated: false` · custodial still simulated

---

## Slide 1 — Title

**Title:** Lockwork

**Bullets:**
- Lock the payout. Ship the work. Hire the winner.
- Contest-to-hire clearinghouse — sealed purse → ship artifact → one winner hired into the company
- Live demo: https://lockwork-dun.vercel.app/

**Speaker notes:**
Open on the brand line, not a category label. We are not “Upwork for crypto.” We sell certainty of payout that converts into a hire. Flag the live URL early: treasury + Base Sepolia escrow are live; on-chain rail is un-simulated on testnet; custodial still simulated; seat billing (#4) still stubbing. Keep “hire / company seat” language; avoid employment-agency framing.

---

## Slide 2 — Problem

**Title:** Interview theater. Unpaid contests. Escrow that never hires.

**Bullets:**
- Marketplaces sell hours and bids — workers risk time for maybe-pay
- Classic contest sites harvest speculative free labor; prize optional or opaque
- “Escrow” in most products is custody theater — no hire, no seat, no reputation that compounds
- Founders still run interview theater for a single shippable bot, script, or automation job

**Speaker notes:**
Name the three failures in one breath: Upwork/Fiverr (hours), 99designs-style contests (unpaid work), and soft escrow that never becomes a hire. Beachhead pain is concrete: a solo founder needs a $2k–$10k deliverable this week and might keep the winner on a seat. Do not lead with crypto ideology — lead with wasted time and unpaid work.

---

## Slide 3 — Insight

**Title:** Price certainty. Bid = work. Hire is the conversion event.

**Bullets:**
- Money is a **sealed commitment** before competition is serious
- The bid is the **artifact** (ship the work), not a price auction
- Exactly **one winner** is paid *and* hired into that employer’s company / seat
- Public reputation compounds matching; GMV stays private (no fee gaming)

**Speaker notes:**
This is the category claim. Lockwork sells the conversion event: locked payout → ship → hire. Contrast table (if designing visuals): marketplace vs contest vs Lockwork. Emphasize “hired into company / seat” — the win is not a prize file; it is a production relationship billed as a company seat.

---

## Slide 4 — Product

**Title:** Lock → Ship → Hire

**Bullets:**
- Employer posts a job, locks full payout (custodial and/or Base USDC)
- Humans and bots compete by submitting the work; employer reviews read-only demos
- Employer picks exactly one winner → release → winner gets a **company seat**
- Company OS nests sub-teams and jobs (depth ≤ 3); sponsors and plugins attach later
- Live loop shipped on demo: post → fund → submit → review → pay-one

**Speaker notes:**
Walk the core loop in 30 seconds. Show clearinghouse UI vibe (navy `#0B1F3A` / slate / white) if screenshot available. Hybrid escrow = one state machine, two adapters. Nested jobs carve budget inside the company tree without feeling like a new charge. Plugins (IDE/repo stubs) and sponsors are second-order — do not derail the demo story.

---

## Slide 5 — Unit economics

**Title:** 250 bps + $79 seats + 500 bps placement

**Bullets:**
- **Release fee:** 250 bps only on outward winner pay (carve-outs 0, refunds 0)
- **Seats:** $79/mo after hire — contest CAC → company ARR
- **Placement:** 500 bps when financing/sponsor capital attaches
- **Nesting:** depth ≤ 3; residual escrow only; no double-tax on idle locked dollars
- Early snapshot (illustrative): ~200 × $2k jobs → ~$15.7k/mo stack; seats alone ~$64k ARR

**Speaker notes:**
Fee prints cash on success; seats print multiple. Do not pitch float. Stress: do not hike fee to “fix” Seed — ship seat billing. Nested example in one line: $10k root, carve $4k+$3k, one $4k leaf pays → platform $100, not $275/$350 under worse policies. Full tables live in Genius exhibit (`WHITEPAPER_UNIT_ECON_EXHIBIT.md`). Assumptions are illustrative until Dante sets vertical targets.

---

## Slide 6 — Trust architecture

**Title:** Public reputation. Private GMV.

**Bullets:**
- **`/` Company OS** — money, escrow, wallet Connect/Approve/Lock, fee copy, nested budgets
- **`/feed` + `/u/:handle`** — jobs completed, badges, demerits only (dollar-free by design)
- Social credit + one revision round replaces a human dispute desk in v1 (#24)
- Status compounds matching without leaking pricing power

**Speaker notes:**
Trust split is a product feature, not a missing dashboard. Investors who want “show GMV on profiles” get the wrong product — that invites fee gaming and pricing leaks. v1: dispute desk flag stays off; social-credit-only story (see SOCIAL_CREDIT.md). Employer reputation symmetry is on the roadmap (#7).

---

## Slide 7 — Rails

**Title:** Custodial + Base USDC. One fee rule. Treasury takes the skim.

**Bullets:**
- Shared escrow states: draft → funded → in_review → paid | refunded
- Custodial adapter (card/balance) + on-chain adapter (Base USDC, `LockworkEscrow.sol`)
- Fee incidence identical on both rails (D1 leaf-outward)
- **`feeRecipient` = Dante treasury (LIVE)** `0x47D0A167FF6A5508440ef6D8902076A7aaD0844C` — never the deploy/hot wallet
- **Escrow LIVE on Base Sepolia:** `0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722` ([Basescan](https://sepolia.basescan.org/address/0xa24D580f255F00Aa8AEd0fb60526bE549aBDC722))
- On-chain `simulated: false`; **custodial still simulated**; seat billing (#4) and filmed lock→release smoke still open

**Speaker notes:**
Honest about hybrid status. Treasury + Sepolia escrow are live (Dante-confirmed treasury). Remaining: filmed lock→release smoke, custodial un-simulate, seat billing live, Base mainnet. Do not claim Base mainnet or invent tx receipts. Crypto Bro chapter has the full architecture for appendix / deep dive.

---

## Slide 8 — GTM beachhead

**Title:** Solo founders & small studios — $2k–$10k ship-to-hire

**Bullets:**
- ICP: founder/studio lead who needs one concrete deliverable this week and might keep the winner
- Beachhead jobs: bots, scripts, automation (IDE/repo plugins demo-real)
- Closed alpha: invite-only companies; link jobs; escrow funded / week as north star
- Narrative: *Lock pay. Compete by shipping. One hire into the company.*
- Not first: enterprise procurement, $20 commodity gigs, open-ended retainers

**Speaker notes:**
Channels: builder X, Indie Hackers, crypto/builder Discords — not LinkedIn spray. Success metrics: funded jobs/week, winner-selected %, seat keep intent (even pre-billing). Case study (#8) still needed for receipts — placeholder until Dante + Make Money land one ICP story.

---

## Slide 9 — The Ask (placeholder)

**Title:** Ask — *fill when Dante decides*

**Bullets (placeholders):**
- [ ] Alpha company seats / closed-alpha invite capacity
- [ ] Escrow volume commitment (seed jobs on real rail once live)
- [x] Treasury bootstrap — Dante treasury live `0x47D0…844C` (confirmed 1:1 with Crypto Bro)
- [ ] Naming pack — **DROPPED**; stay on Vercel URL (do not push domain buys)
- [ ] Optional: advisory / design-partner studios for beachhead vertical

**Speaker notes:**
Do not invent a raise number. Treasury is live; ask slide still scaffolded until Dante sets the instrument (alpha seats vs escrow volume vs capital). Frame remaining gates honestly: seat billing, custodial live, filmed Sepolia smoke, then Base mainnet.

---

## Slide 10 — Closing / Appendix cue

**Title:** Lockwork

**Bullets:**
- Lock the payout. Ship the work. Hire the winner.
- Demo: https://lockwork-dun.vercel.app/
- Deep dive: white paper (`WHITEPAPER.md`) · on-chain chapter · unit-econ exhibit
- Contact / next step: *[Dante / Make Money — fill]*

**Speaker notes:**
Leave them with the brand line and honest live status: Sepolia escrow + treasury live; custodial sim + seats still open. Offer white paper for fee math and rail detail. Q&A traps: employment-agency regulation (use hire/seat copy; counsel pass #17), “when is money real?” (Sepolia live → filmed smoke → custodial/seats → Base mainnet), “why not higher take-rate?” (seats > fee hike). Also: “who owns unselected submissions?” → **worker property**; review license only; IP rides **paid + seat**, not submit.

---

## Design / production notes

| Item | Guidance |
|------|----------|
| Visual system | Navy `#0B1F3A` / slate / white (clearinghouse UI) |
| Logo | Padlock or sealed purse primary; gear tooth secondary only |
| Charts | Unit-econ Early stack bar; nested $10k tree one-pager from Genius exhibit |
| Screenshots | OS fund/lock; `/feed` dollar-free; wallet Connect/Approve/Lock (Sepolia); Basescan escrow |
| Language ban | Avoid leading with “employee / EoR / staffing agency”; prefer hired into company / seat |
| IP / unselected work | Losers keep IP; review license only; exclusive assignment only on **paid + hire/seat**. Sponsors ≠ license farm. Q&A trap: “who owns the other entries?” → worker property. |
| Honesty | Every money slide: “Sepolia live; custodial sim; seats not billed” footnote if needed |

## Ownership

| Piece | Owner | Status |
|-------|-------|--------|
| This outline | Make Money | **Draft landed 2026-10-01** |
| Slide design / Figma | Make Money (or design partner) | Pending |
| Ask numbers | Dante | Blocked |
| ICP case receipts (#8) | Dante + Make Money | Pending |
| Unit-econ exhibit | Genius | Ready — fold into WP |
| On-chain appendix | Crypto Bro | Ready — fold into WP |

*Do not push Lockwork app or buy domains from this artifact. Markdown-only under `make-money-app/`.*
