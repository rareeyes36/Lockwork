# Migrations

The server applies these automatically on boot (`server/migrate.js`), in lexical order, and records each file in `schema_migrations`, so a rerun does nothing. You can also run them by hand with `npm run migrate` from `server/`.

A database that was migrated by hand before the runner existed gets baselined: 001–019 are marked as applied and only newer files run.

Manual alternative (Postgres 14+):

```bash
for f in $(ls -1 *.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Order matters: the `jobs.winner_submission_id` FK is added in `009`, after `submissions` exists.

- `015_genius_economics.sql`: release fee columns, the employment seat stub, sponsor_contributions.
- `017_reputation_counters.sql`: triggers that bump `wins_count` on paid jobs and bank `employment_days` on seat churn.
- `018_recursive_jobs.sql`: parent/child jobs, budget_source, root_job_id.
- `019_company_subteams.sql`: teams as sub-teams under a company (workspaces); jobs.team_id.
- `020_nested_escrow_ledger.sql`: jobs.depth (≤ 3), plus job_escrows.carved_out_amount and refund_amount, so a parent that splits into sub-jobs releases or refunds only its residual (D1/D2).
- `021_chain_txs.sql`: records every verified on-chain transaction hash so one lock, release or refund transaction can back only one action.
- `022_profile_feed.sql`: `employer_reputation`, `feed_events`, `form_state` for the public `/feed` + `/u/:handle` shell (no money columns); backfills employer counters from existing jobs.
- `023_seat_billing.sql`: `seat_invoices` — company seat charges that stick after hire (custodial-sim mark-paid; Stripe reserved).
- `024_placement_billing.sql`: `placement_invoices` — sponsor placement fee @ 500 bps (custodial-sim mark-paid; Stripe reserved). Separate from release fee 250 bps.
