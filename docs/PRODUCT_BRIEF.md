# Contest Company OS — Product Brief
*Public name: **Lockwork** (runner-up: HireProof). Internal: Contest OS / `contest_os`. Owner: Dante Final. Stack lean: crypto/web3 escrow + automation.*

## One-sentence pitch
A workspace where employers lock a payout, humans and bots compete by shipping the work, one winner is hired, and sponsors + plugins turn that win into real production.

## Brand (decided)
Public name **Lockwork**. Primary: Lock + Work (escrow + bid=work). Soft-lean clockwork as secondary dual-read only. One-liner: *Lock the payout. Ship the work. Hire the winner.* Details: [NAMING_GTM.md](./NAMING_GTM.md).

## Core loop (must work before anything else)
1. Employer creates a **Workspace** and posts a **Job** (single-task, clear requirements, deadline).
2. Employer locks the full **Payout** in escrow (prefer stablecoin / crypto for automated release).
3. Workers (humans or bots with roles) **submit work** — the bid *is* the work, not a price.
4. Employer reviews submissions in **read-only demo view**.
5. Employer approves **exactly one** winner.
6. Escrow pays the winner. Winner becomes **Employee** of that Employer (relationship + role in the workspace).
7. Optional: spun-up bots for that job shut down or get promoted into ongoing roles.

## Entities

| Entity | What it is |
|--------|------------|
| **User** | Human account. Can hold roles, post jobs, submit, sponsor, manage. |
| **Bot Agent** | Automated worker. Always sits in a role. Can be lead or subordinate. |
| **Role** | Named capability set inside a workspace (or company). Assignable to users or bots. |
| **Lead Bot** | At most **one** lead bot per role scope that can manage other bots/users under that role. |
| **Workspace** | Employer's container for jobs, roles, bots, plugins, sponsors. |
| **Company** | Higher-level org (brand, multi-workspace, hiring at scale). Deferred past v1 core loop. |
| **Job** | Single-task posting with requirements, deadline, escrowed payout. |
| **Submission** | Work artifact(s) + demo link; read-only to employer until decision. |
| **Employment link** | Winner ↔ Employer bond after approval. |
| **Integration (plugin)** | Subscribed capability in a workspace: video edit, DAW, IDE, repo, etc. |
| **Sponsor** | Party that contributes, finances, supplies software, materials, or real-world services (PoD, manufacture, shipping). |

## Roles & authority
- Humans with a role can **create more roles** for users or bot agents (permission-gated).
- A role may include **one lead bot** that manages other bots (or users) that hold roles under it.
- Users or lead bots can **spin up bots for a job** inside the workspace (job-scoped agents).
- Role graph is hierarchical: Employer → roles → assignees (human/bot) → optional sub-roles.

## Integrations (plugins)
- Employer **subscribes** integrations per workspace.
- Examples: video edit, DAW, IDE, repo.
- Plugins define *where* and *how* work is produced and what a "demo view" means for that job type.
- Sponsors may underwrite or supply a plugin (software sponsorship).

## Sponsors
Types (can overlap):
- **Contributing** — labor, reviews, assets
- **Financing** — funds payout, runway, or escrow top-ups
- **Software** — seats, licenses, plugin access
- **Materials / services** — print-on-demand, manufacture, shipping, other real-world fulfillment

Sponsors attach to a workspace or a specific job. They do not replace the employer’s pick of the one winner.

## Company mechanics (v2+)
- Multi-workspace brand
- Shared role templates
- Bulk hiring from contest winners
- Sponsor marketplaces
- Cross-job employee history / reputation

## v1 cut (build this only)
**In**
- Auth (human users)
- Workspace create
- Roles: assign human; create roles; one lead-bot slot per role
- Job post + deadline + escrow payout
- Submit work (file/link) + read-only review
- Pick one winner → pay → employment link
- Job-scoped bot spin-up (even if bots are stubs/API wrappers at first)
- Plugin stubs: subscribe “repo” + “ide” as empty adapters (UI + entitlement only)

**Out of v1**
- Full company org chart UI
- Rich DAW / video editors (subscribe only; deep embed later)
- Manufacture / shipping fulfillment automation
- Multi-winner or split payouts
- Open public discovery feed (invite/link jobs first)

## Crypto / web3 note
- Job payout held in escrow contract or custodial stablecoin vault until winner selection or refund on expiry / cancel rules.
- Employment link and role grants can later be represented as on-chain attestations; not required for v1 UX.

## Open defaults (user skipped)
- First job vertical: **general** (demo URL + file attachments). Plugins specialize later.
- Name / branding: **Lockwork** (decided 2026-09-26); HireProof runner-up

## Next build step
1. ~~Name the product~~ → **Lockwork**.
2. Freeze the data model (schema) from this brief.
3. Choose escrow path: on-chain stablecoin vs custodial.
4. Clickable wire of: Post job → Submit → Review → Pay one.

## Payout rail (decided): Hybrid
- **One** job escrow state machine for all jobs.
- **Two adapters:**
  1. **Custodial** — card/fiat (or platform balance); platform holds funds until release/refund.
  2. **On-chain** — stablecoin escrow contract; wallet locks funds; contract releases to winner or refunds on cancel/expiry.
- Employer selects rail when locking payout. Winner is paid on the **same** rail.
- Contest rules (deadline, single winner, refund on expiry/cancel) are rail-agnostic.

## Money levers folded (Genius shortlist)
1. **Release fee** — `platform_fee_bps` on escrow release only (both rails); custodial float internal-only.
2. **Employment seat** — win converts to workspace seat stub (`seat_status`); billing after custodial live. *(user pick B)*
3. **Financing sponsor contributions** — `sponsor_contributions` co-lock/top-up; sponsors never veto winner. *(user pick C)*
5. **Reputation gate** — `worker_reputation` facts in v1; invite/escrow-tier gates later. *(user pick E)*

Platform fee: **250 bps (2.5%)** — locked for now. Park #4, #6, #7 until core loop prints.

Stress scenarios (assumptions + tables): see [MONEY_MODEL.md](./MONEY_MODEL.md).

## Reputation gate (Genius #5 — user pick E)
- Store facts only in v1: contest wins + employment retention days (not raw win count alone).
- Later: reputation unlocks invite priority and higher-escrow job tiers.
- No stake-to-submit (preserves bid = work).
- Anti-farm: weight **employment retention days** over win count; bot-only win streaks do not unlock top tiers alone.
- Money path: indirect — denser proven shippers → higher escrow GMV → more release fees, seats, sponsor deals.
- Counter wiring: [REPUTATION.md](./REPUTATION.md) + migration `017_reputation_counters.sql`.

## Design direction (Dante, 2026-09-26)
- Vocabulary: root unit is **the company** (never “team”); **sub-teams** only inside a company; people are **employees / employers / sponsors** (not “users”). Roles anyone can fill — sponsor need not be a legal company.
- Recursive jobs: funded jobs spawn sub-jobs with own budgets (parent carve-out or expansion); branch / tangent / loop → fractal org from funded work.
- Full note: [DESIGN_DIRECTION.md](./DESIGN_DIRECTION.md)


## Design direction (Dante Final — locked 2026-09-26)
See also `DESIGN_DIRECTION.md`.

### Vocabulary
- **Company** = what you’d normally call a team/group (not a legal-entity requirement in product copy).
- Never say **users**. People are **employers**, **employees**, or **sponsors** — roles anyone (human or bot) can fill. A sponsor need not be a real legal company; same for employer/employee. One person can hold different roles across companies/jobs.

### Recursive jobs (fractal org)
- A **funded** job can spawn **sub-jobs**, each with its own budget from **parent carve-out** or **expansion budget** (new capital).
- Jobs may **branch**, **tangent**, or **loop** recursively. The company grows from funded work, not a fixed org chart first.
- Escrow nests: child budgets cannot exceed available parent/expansion funds without an explicit expansion lock.
- Winner/employment can attach at any job node; company membership follows funded wins per product rules.
- Recursion is first-class — not a rename of “tasks.”


## Org tree correction (Dante Final — same day)
See `DESIGN_DIRECTION.md` (refreshed).

- **The company** is the root unit. Never call the top level a “team.”
- **Teams** exist only as **sub-teams inside a company** (and may nest).
- Whole structure is a **tree**: company → sub-teams → jobs / sub-jobs (same fractal pattern).
- `workspaces` in v1 schema = **the company** container. Sub-teams are a new `teams` table under that company. Jobs hang off the company or a sub-team.
