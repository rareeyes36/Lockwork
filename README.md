# Lockwork

**Lock the payout. Ship the work. Hire the winner.**

Lockwork is a contest-to-hire workspace. An employer locks the full payout in escrow. People and AI bots compete by shipping the actual deliverable, so the bid is the work, not a price. The employer picks exactly one winner. Escrow pays them, and they join the company on a seat. Sponsors can co-fund jobs or supply fulfilment, and plugins decide where the work gets made.

This repo is a working demo: Express + Postgres, with a single-page UI that has a screen for every part of the product.

| | |
|---|---|
| **Backend** | Node 20+, Express 5, Postgres 14+ (`server/`) |
| **Schema** | 21 numbered migrations (`migrations/`), applied automatically on boot |
| **UI** | Plain HTML/CSS/JS modules with no build step (`public/`) |
| **Payments** | **USDC on Base Sepolia is real**: a Lockwork escrow contract with wallet-signed transactions, using test USDC. The card rail is simulated. |
| **Auth** | Demo stand-in: a "Viewing as" picker sends `X-Lockwork-As`, and the server enforces permissions for that person |

## Run it locally

```bash
# 1. Postgres: any local instance works
createdb contest_os    # or set DATABASE_URL in server/.env

# 2. Server: migrates and seeds the "Atlas Demo Co" on first boot
npm install
npm start              # → http://127.0.0.1:3847
```

The default `DATABASE_URL` is `postgresql://contest:contest_local_dev@127.0.0.1:5432/contest_os`. You can put it in a `.env` file at the repo root.

| Command (at the repo root) | What it does |
|---|---|
| `npm start` | Migrate, seed if the database is empty, serve on `$PORT` (3847) |
| `npm run seed` | Wipe and reseed the demo data (the UI's "Reset demo data" does the same) |
| `npm run migrate` | Apply pending migrations only |
| `npm test` | Fee-math unit tests |
| `npm run demo` | End-to-end API check against a running server (both rails, bot win, carve-out, refunds, permission rules) |
| `npm run demo:curl` | The same idea in curl |

## Deploy on Vercel (free)

The repo is set up for Vercel's zero-config Express support:
- `app.js` is the serverless entry point.
- `public/` is served by Vercel's CDN.
- `vercel.json` pins the Express framework preset.

Serverless has no boot step, so the first request on a fresh database runs the migrations and seeds the demo company. It takes a few seconds, once.

1. Import the repo in Vercel, or keep your existing project.
2. **Storage → Create Database → Neon (Postgres)**, free plan. Connect it to the project for all environments. That sets `DATABASE_URL`.
3. **Settings → Build & Deployment:**
   - Leave **Root Directory** empty.
   - Remove any **Output Directory** override.
   - Framework Preset shows Express (pinned by `vercel.json`).
4. **Redeploy.** Open the site. If `/api/health` returns 503, `DATABASE_URL` isn't set yet.

## Turn on real money (Base Sepolia testnet)

USDC jobs lock, pay out and refund through **your own escrow contract** (`contracts/LockworkEscrow.sol`), with real transactions signed in the employer's browser wallet. The server never holds keys. It verifies every transaction hash against the chain before updating the database, and each hash can back only one action. It uses **test USDC**, which has no dollar value.

One-time setup, about 10 minutes:
1. **Get a browser wallet.** MetaMask or Coinbase Wallet (the extension, or the app's built-in browser).
2. **Get free Base Sepolia ETH for gas.** Use the [Coinbase faucet](https://portal.cdp.coinbase.com/products/faucet) or any Base Sepolia faucet.
3. **Get free test USDC.** At [faucet.circle.com](https://faucet.circle.com), choose Base Sepolia.
4. **Deploy the escrow.** Open **`/deploy.html`** on your site, click **Connect wallet**, then **Deploy escrow**. It's one transaction, and your wallet becomes the 2.5% fee recipient.
5. **Point the site at the contract.** In Vercel → Settings → Environment Variables, set `LOCKWORK_ESCROW_ADDRESS` to the deployed address, then **Redeploy**.

After that:
- **USDC jobs you lock are real.** The job page shows **LIVE · TESTNET** and Basescan links for each transaction.
- **Existing demo data stays simulated.** The seeded USDC jobs keep their "sim" labels.
- **For the payout demo**, give the winner (e.g. Leo, via People → wallet icon) an address you control, such as a second MetaMask account. Then you can show the USDC arriving.
- **Backup plan:** if a wallet misbehaves live, the lock dialog has **Use simulation instead**.

How it maps to the product rules:
- **`lock(jobKey, amount)`:** the employer's wallet approves, then deposits. Fee 0.
- **`release(jobKey, winner, amount)`:** employer only. It pays 97.5% to the winner and 2.5% to the fee recipient. One escrow can be released in parts: carve-out sub-jobs pay their winners from the root escrow, and the root winner gets the rest (D1).
- **`refund(jobKey)`:** employer only. Everything left goes back to the employer. Fee 0.
- **Keys and limits:** `jobKey = keccak256(job id)`. There are no admin withdrawals, no upgrades and no pausing. The contract is **not audited**, so don't put real mainnet funds in it.

Optional env vars:
- `LOCKWORK_RPC_URL` (default `https://sepolia.base.org`)
- `LOCKWORK_CHAIN_ID` (default `84532`)
- `LOCKWORK_USDC_ADDRESS` (default: Circle's Base Sepolia USDC `0x036C…CF7e`)
- `LOCKWORK_EXPLORER_URL`

Developer commands:
- `npm run contracts:build`: recompile the contracts with solc and refresh the ABI/bytecode JSON.
- `npm run vendor:build`: rebuild the browser viem bundle in `public/vendor/`.
- `npm test`: runs the fee-math tests and the contract tests on an in-process chain.

## Or deploy on Render (free)

1. Push this repo to GitHub (done if you're reading this there).
2. In [Render](https://dashboard.render.com), choose **New → Blueprint** and pick this repo. Render reads `render.yaml` and creates:
   - `lockwork`: a free Node web service
   - `lockwork-db`: a free Postgres database, whose `DATABASE_URL` is wired in automatically
3. Click **Apply**. The first deploy takes a few minutes. On first boot the server runs the migrations and seeds the demo company.
4. Open the `https://lockwork-….onrender.com` URL Render gives you.

Before the meeting:

- **Wake it up early.** Free services sleep after 15 minutes idle and take about a minute to wake. Open the link a few minutes before you present.
- **Free Postgres expires 30 days after creation.** Upgrade it or recreate the Blueprint after that.
- **Reset the data.** Click "Reset demo data" in the sidebar to start from a clean seed. Set `DEMO_RESET=off` in Render to hide that button once real data matters.

## Demo script (about 5 minutes)

1. **Landing page (`/`)**: the pitch, the four steps, "2.5% only when you hire the winner", and the hybrid rails.
2. **Open the live demo → Overview.** Every stat is computed from escrow rows: money locked, paid to winners, fees, refunds, seats and MRR.
3. **Org tree.** Company → sub-teams → jobs → sub-jobs. The $10k USDC treasury job has two carve-outs, and one of them was already won by a **bot** (paid to its operator). Click **+ Sub-job** on the level-3 job to show the depth cap (D4) being enforced by the server.
4. **Jobs → "Pitch deck polish"**, a draft on USDC. Click **Lock with wallet** to run the simulated connect → approve → deposit flow, which ends with a tx hash.
5. Set **Viewing as → Leo Okafor**, then click **Submit an entry**. The default demo URL renders as a read-only preview inside the job page.
6. Set **Viewing as → Dante Final**. Click **Close entries → review**, then **Pick as winner**. The modal shows the release, the 2.5% fee and the winner's net before you confirm. You can grant a role on hire.
7. Show the **receipt** (fee, net, simulated release tx) and the **Hired** card, then **Employees & seats**: set the seat to active, then churned, and watch **Reputation** bank the retention days.
8. **Sponsors**: set **Viewing as → Priya Nair** and try to pick a winner on the video job. The server refuses with *"Sponsors fund and fulfil. They never pick the winner."*
9. **Roles / Bots / Plugins**: one lead bot per role (a second one is rejected), job-scoped bots stop when the job is decided, plugin subscriptions can be underwritten by a sponsor, and creating a role requires a minting role.
10. **Fee calculator**: the $10k tree. Charging only on outward payouts (D1) takes $100. Also charging on carve-outs would take $275, and double-charging would take $350.

## What's real vs simulated

**Real:**
- the escrow state machine (draft → locked → in review → paid / refunded) with row locks and transactions
- integer fee math: 250 bps in minor units
- nested budgets
- the depth cap
- bottom-up refunds
- one winner per job
- employments and seats
- reputation triggers
- roles and lead-bot uniqueness
- sponsor contributions
- plugin subscriptions
- all permission checks for the selected person

**Real on the testnet** (once `LOCKWORK_ESCROW_ADDRESS` is set): USDC lock, release and refund through the escrow contract, signed by the employer's wallet and verified by the server.

**Simulated (and labeled "sim" in the UI):**
- the card charge
- USDC jobs locked before the contract was configured, or through "Use simulation instead"
- bots, which are config stubs that enter and win like people do
- login
- seat billing

## Where Grok was heading, in brief

Grok's docs (`docs/`) were steering toward this order:

1. **Make the core loop boring and reliable first**: post → lock → submit → review → pay one → hire. Everything else is secondary to that loop. *(Done: `server/routes/jobs.js`.)*
2. **Use one escrow state machine for two rails.** Custodial goes first. On-chain (Base + USDC) comes second, as an adapter behind the same states, and marketing shouldn't lead with the chain until custodial is trusted. *(Done as simulations: `server/escrow/adapters.js`.)*
3. **Keep the story escrow-first.** "Lock the payout. Ship the work. Hire the winner." The fee is 2.5% on release only. Seats ($79/mo) are the compounding revenue, and refund rate is the number to watch. *(Landing page + `docs/MONEY_MODEL.md`.)*
4. **Build in the proposed rules for nested jobs**, which you never formally confirmed (`docs/OPEN_DECISIONS.md`):
   - **D1**: fee only on outward winner payouts
   - **D2**: bottom-up refunds
   - **D3**: the job's employer picks the winner; seats roll up to the company
   - **D4**: depth 3, no cycles

   *(Implemented as proposed. Tick the checklist in that doc when you confirm them.)*
5. **Then:** real custodial payments with KYC → a Base Sepolia contract with wallet connect → seat billing → reputation-gated escrow tiers. **Don't buy any domains yet**: `docs/NAMING_BUY_ORDER.md` stays frozen until you say go.

## Layout

```
docs/                design docs from the Grok sessions (brief, brand, money model, rails, decisions)
migrations/          001–021 SQL, applied in order by server/migrate.js
contracts/          LockworkEscrow.sol (+ MockUSDC for tests), compile.js, build-viem.js
app.js               Vercel entry: wraps the server app, migrates/seeds on first request
vercel.json          Vercel config (Express preset, function settings)
render.yaml          Render Blueprint (web service + Postgres)
public/              the SPA (index.html, css/, js/views/*, js/wallet.js), deploy.html,
                     contracts/ (ABI + bytecode), vendor/viem.js, demo-entry.html previews
server/
  server.js          Express app + boot (migrate, auto-seed, listen)
  routes/            people, companies (sub-teams, seats, activity), jobs (escrow + entries),
                     org (roles, bots), market (plugins, sponsors), meta (stats, reputation, seed)
  escrow/            feeMath.js (BigInt, 250 bps), adapters.js (custodial + USDC sim),
                     onchainBase.js (verifies real Base Sepolia escrow transactions)
  onchain/           TypeScript types for the future real Base adapter (design reference)
  access.js          "Viewing as" permission checks
  seed.js            the Atlas Demo Co data set
  scripts/           demo.js / demo.sh end-to-end API checks
  test/              unit tests
```

Fixed from the original stub: winner reputation was counted twice (the `/pay` route and trigger 017 both incremented it). Now only the trigger counts it.
