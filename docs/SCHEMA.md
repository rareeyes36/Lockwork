# Contest Company OS — v1 schema

Postgres-oriented. UUIDs for public ids. Timestamps `timestamptz`. Money as `numeric(20,8)` + `currency` text (ISO or `USDC`).

## users
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| handle | citext unique | display handle |
| email | citext unique null | optional until auth hardens |
| display_name | text | |
| wallet_address | text null | for on-chain rail |
| created_at | timestamptz | |

## bot_agents
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid fk → workspaces | |
| name | text | |
| kind | text | `lead` \| `worker` \| `job_scoped` |
| managing_role_id | uuid null fk → roles | role this bot leads (only one lead per role) |
| parent_bot_id | uuid null fk → bot_agents | optional hierarchy |
| job_id | uuid null fk → jobs | set when spun up for a job |
| status | text | `active` \| `stopped` |
| config_json | jsonb | model/tools/stubs |
| created_at | timestamptz | |

## workspaces
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| employer_user_id | uuid fk → users | owner |
| name | text | |
| slug | citext unique | |
| created_at | timestamptz | |

## roles
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid fk → workspaces | |
| name | text | |
| parent_role_id | uuid null fk → roles | hierarchy |
| can_mint_roles | bool | holders may create child roles |
| created_by_user_id | uuid null fk → users | |
| created_at | timestamptz | |
| **constraint** | | at most one `bot_agents` with `kind=lead` and `managing_role_id = this id` |

## role_assignments
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| role_id | uuid fk → roles | |
| principal_type | text | `user` \| `bot` |
| user_id | uuid null fk → users | |
| bot_agent_id | uuid null fk → bot_agents | |
| assigned_at | timestamptz | |
| **check** | | exactly one of user_id / bot_agent_id set matching principal_type |
| **unique** | | (role_id, principal_type, coalesce(user_id, bot_agent_id)) |

## jobs
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid fk → workspaces | |
| employer_user_id | uuid fk → users | |
| title | text | |
| requirements | text | single-task brief |
| deadline_at | timestamptz | |
| status | text | mirrors escrow: `draft` \| `funded` \| `in_review` \| `paid` \| `expired_refunded` \| `cancelled_refunded` |
| winner_submission_id | uuid null fk → submissions | set on pay; exactly one |
| created_at | timestamptz | |

## job_escrows
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| job_id | uuid unique fk → jobs | 1:1 |
| rail | text | `custodial` \| `onchain` |
| amount | numeric(20,8) | full job payout |
| currency | text | e.g. `USD`, `USDC` |
| state | text | same as job escrow states |
| escrow_ref | text null | provider id or chain escrow id |
| payer_user_id | uuid fk → users | |
| winner_payee_user_id | uuid null fk → users | set on release |
| funded_at | timestamptz null | |
| released_at | timestamptz null | |
| refunded_at | timestamptz null | |
| meta_json | jsonb | chain, tx hashes, ledger ids |

## submissions
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| job_id | uuid fk → jobs | |
| submitter_type | text | `user` \| `bot` |
| submitter_user_id | uuid null fk → users | |
| submitter_bot_id | uuid null fk → bot_agents | |
| demo_url | text null | read-only demo |
| notes | text null | |
| status | text | `submitted` \| `withdrawn` \| `selected` \| `rejected` |
| created_at | timestamptz | |
| **unique** | | one active submission per (job_id, submitter) in v1 |

## submission_assets
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| submission_id | uuid fk → submissions | |
| kind | text | `file` \| `link` |
| url | text | storage URL or external link |
| label | text null | |
| created_at | timestamptz | |

## employments
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid fk → workspaces | |
| employer_user_id | uuid fk → users | |
| employee_user_id | uuid fk → users | winner |
| job_id | uuid fk → jobs | originating contest |
| role_id | uuid null fk → roles | optional role granted on hire |
| started_at | timestamptz | |
| **unique** | | (workspace_id, employee_user_id, job_id) |

## plugin_catalog
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| key | text unique | `video_edit` \| `daw` \| `ide` \| `repo` | …
| name | text | |
| description | text | |

## workspace_plugins
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid fk → workspaces | |
| plugin_id | uuid fk → plugin_catalog | |
| status | text | `subscribed` \| `paused` |
| config_json | jsonb | entitlements / stub config |
| subscribed_at | timestamptz | |
| **unique** | | (workspace_id, plugin_id) |

## sponsors
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| workspace_id | uuid null fk → workspaces | workspace-level |
| job_id | uuid null fk → jobs | or job-level |
| sponsor_user_id | uuid null fk → users | if human/org account |
| name | text | display |
| kinds | text[] | `contributing` \| `financing` \| `software` \| `materials` \| `services` |
| details | text null | PoD, shipping, manufacture notes |
| created_at | timestamptz | |
| **check** | | workspace_id or job_id not both null |

## Indexes (minimum)
- jobs (workspace_id, status), jobs (deadline_at) where status = funded
- submissions (job_id)
- role_assignments (role_id), role_assignments (user_id), role_assignments (bot_agent_id)
- job_escrows (state), job_escrows (rail)

## Invariants (enforce in app + DB where possible)
1. Exactly **one** winner_submission_id when job status = `paid`.
2. Escrow `release` only after winner set; amount unchanged after `funded`.
3. At most **one** lead bot per role (`managing_role_id`).
4. Job-scoped bots require `job_id`; stop or reassign when job leaves `funded`/`in_review` (product rule).
5. Hybrid: `rail` immutable after `funded`.

## Out of schema v1
- Full `companies` table (defer)
- Dispute / arbitration tables
- On-chain attestation of employment
- Plugin deep session state (lives in plugin adapters)

## Schema deltas (Genius fold #1–#3 + #5)

### job_escrows additions
| column | type | notes |
|--------|------|-------|
| platform_fee_bps | int not null default 250 | fee at release only |
| fee_amount | numeric(20,8) null | set on release |
| net_to_winner | numeric(20,8) null | amount - fee_amount on release |

### employments additions (Genius #2)
| column | type | notes |
|--------|------|-------|
| seat_status | text | `pending` \| `active` \| `churned` — v1 stub |
| seat_plan | text null | e.g. `workspace_member`; billing later |
| seat_started_at | timestamptz null | when paid seat activates |

Contest win = CAC; paid seat = ARR. Live billing after custodial rail.

### seat_invoices (backlog #4 — company seat billing)
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| employment_id | uuid fk → employments | hire this seat belongs to |
| workspace_id | uuid fk → workspaces | company billed (never sub-team) |
| amount | numeric(20,8) | snapshotted from `seat_price_usd` at charge |
| currency | text | default `USD` |
| plan | text | `workspace_member` |
| state | text | `open` \| `paid` \| `void` |
| rail | text | `custodial_sim` (invoice recorded / mark-paid stub) \| `stripe` (reserved, not live) |
| invoice_ref | text null | e.g. `seat-sim-…` |
| period_start / period_end | timestamptz | monthly window |
| paid_at / voided_at | timestamptz null | |
| meta_json | jsonb | `{ sim, stripe_live }` now; Stripe payment ids later |
| created_at | timestamptz | |

**API:** `POST /employments/:id/seat-invoices` → open charge; `POST /seat-invoices/:id/pay` → paid + seat `active`; `POST /employments/:id/seat-attach` → one-shot. Amount from config `seat_price_usd` ($79). Does not touch release fee (250 bps) or escrow.


### sponsor_contributions (Genius #3 — new table)
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| sponsor_id | uuid fk → sponsors | |
| job_id | uuid fk → jobs | |
| kind | text | `co_lock` \| `top_up` \| `placement` |
| amount | numeric(20,8) | |
| currency | text | |
| state | text | `pledged` \| `locked` \| `released` \| `refunded` |
| placement_fee_bps | int null | snapshot (500); charged via placement_invoices on lock/attach |
| created_at | timestamptz | |

**Hard rule:** sponsors never veto winner selection. Financing sponsors may co-lock % of escrow or top-up only.

### placement_invoices (backlog #14 — sponsor placement fee @ 500 bps)
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| contribution_id | uuid fk → sponsor_contributions | financing attach this fee belongs to |
| workspace_id | uuid fk → workspaces | company billed |
| job_id | uuid fk → jobs | |
| amount | numeric(20,8) | snapshotted: contribution.amount × placement_fee_bps / 10000 |
| currency | text | from contribution |
| placement_fee_bps | int | default 500 (snapshot) |
| state | text | `open` \| `paid` \| `void` |
| rail | text | `custodial_sim` (invoice recorded / mark-paid stub) \| `stripe` (reserved, not live) |
| invoice_ref | text null | e.g. `place-sim-…` |
| paid_at / voided_at | timestamptz null | |
| meta_json | jsonb | `{ sim, stripe_live }` now; Stripe payment ids later |
| created_at | timestamptz | |

**API:** `POST /contributions/:id/placement-invoices` → open charge (contribution must be locked); `POST /placement-invoices/:id/pay` → paid; `POST /contributions/:id/placement-attach` → lock (if pledged) + invoice + mark-paid one-shot; `POST /jobs/:id/sponsor-attach` → create locked financing contrib + pay fee. Refund of a pledged/locked-unpaid contribution voids open placement invoices; **no platform release fee** on that unwind. Does not touch release fee (`platform_fee_bps` 250) or escrow.

### worker_reputation (Genius #5 — facts now, gates later)
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| principal_type | text | `user` \| `bot` |
| user_id | uuid null fk → users | |
| bot_agent_id | uuid null fk → bot_agents | |
| wins_count | int not null default 0 | paid job wins |
| employment_days | int not null default 0 | sum of retention days across employments |
| escrow_tier | text not null default open | open / mid / high — gate logic later |
| updated_at | timestamptz | |

**v1:** maintain counters on job `paid` and employment start/churn. **Later:** gate invite lists and max job escrow by `escrow_tier`. No stake-to-submit.
**check:** exactly one of user_id / bot_agent_id matching principal_type; unique per principal.

**Counter wiring (migration 017):**
1. `jobs` → `paid` with `winner_submission_id` → `wins_count += 1` for submitter (user or bot).
2. `employments` INSERT → ensure reputation row for employee.
3. `seat_status` → `churned` → set `ended_at`; add whole days from `seat_started_at` (fallback `started_at`) to `employment_days`.
4. `escrow_tier` remains `open` in v1 (no auto-promotion).

See [REPUTATION.md](./REPUTATION.md).

### employments additions (reputation retention)
| column | type | notes |
|--------|------|-------|
| ended_at | timestamptz null | set on seat churn; used for employment_days |

## Schema deltas (Dante design direction — recursive jobs + vocabulary)

### Vocabulary mapping (app layer)
- `users` table = accounts (humans). Product UI never calls them “users”; display as employer / employee / sponsor by role context.
- `workspaces` ≈ **company** container (v1); full `companies` table still deferred but copy says “company.”

### jobs additions (recursive)
| column | type | notes |
|--------|------|-------|
| parent_job_id | uuid null fk → jobs | null = root job |
| budget_source | text | `root` \| `parent_carveout` \| `expansion` |
| budget_parent_escrow_id | uuid null fk → job_escrows | carve-out source when parent_carveout |
| root_job_id | uuid null fk → jobs | denormalized root for tree queries |

Constraints:
- Child job amount ≤ remaining allocatable parent/expansion funds (enforce in app + later ledger).
- `budget_source = root` iff `parent_job_id` is null.
- Cycles: allow intentional loops only via explicit product rule later; v1 migration allows parent pointer, app forbids cycles until loop UX exists.

### employment / roles copy
- Employment joins a winner to a **company** (workspace) as **employee** of an **employer**.

## Schema deltas (company → sub-team tree)

### Mapping
- `workspaces` = **the company** (root). Product copy: “company,” never “team” for this row.
- New `teams` = **sub-teams** only (children of a company or of another sub-team).

### teams (new)
| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| company_id | uuid fk → workspaces | always set — company root |
| parent_team_id | uuid null fk → teams | null = direct child of company |
| name | text | |
| created_at | timestamptz | |

### jobs additions
| column | type | notes |
|--------|------|-------|
| team_id | uuid null fk → teams | null = job hangs directly under company |

Roles / employments / plugins remain company-scoped (workspace_id); optional team scope can follow later.
