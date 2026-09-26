# Reputation counters (Genius #5)

Facts in v1. Invite / escrow-tier **gates later**. No stake-to-submit.

## Events

| Event | Effect |
|-------|--------|
| `jobs.status` → `paid` | Upsert winner principal; `wins_count += 1` (user or bot from `winner_submission_id`) |
| `employments` INSERT | Ensure `worker_reputation` row for `employee_user_id` |
| `employments.seat_status` → `churned` | Set `ended_at` if null; `employment_days +=` whole days from `seat_started_at` (else `started_at`) to `ended_at` |

Bots can earn wins. Only users earn `employment_days` (employment link is human).

## Non-goals (v1)
- Auto-changing `escrow_tier` (`open` / `mid` / `high`) — stays `open` until gate policy ships
- Decrementing wins on dispute/reversal (no dispute table yet)
- Stake, bonds, or pay-to-submit

## Later gate sketch (do not enforce yet)
Weight **employment_days** above raw `wins_count` so bot-farm win streaks cannot alone unlock `high`. Example policy TBD after real conversion data from MONEY_MODEL.md instruments.

## Implementation
- Table: migration `016_reputation_gate.sql`
- Triggers: migration `017_reputation_counters.sql`
- App should still set `winner_submission_id` before/with status `paid` (invariant already in SCHEMA)
