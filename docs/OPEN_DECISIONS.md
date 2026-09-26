# Lockwork — Open decisions (proposed rules)

*Public name: **Lockwork** · Runner-up: HireProof · Drafted by Genius for Dante pick · 2026-09-26*

Status: **PROPOSED** — not locked until Dante confirms each row.

---

## D1 — Nested fee incidence (**PROPOSED: leaf-outward only**)

| Rule | Detail |
|------|--------|
| Fee event | **250 bps only when money leaves the company tree to a winner payee** (outward `release` to employee/worker). |
| Carve-out | `budget_source = parent_carveout` moves value **inside** the tree → **0 bps**. Not a fee event. |
| Expansion | `budget_source = expansion` is a **new lock** (new capital). Fee applies when *that* escrow releases outward to a winner. |
| Parent job | Parent does **not** take 250 bps merely because children paid. If parent also has residual paid to a parent-level winner, that residual outward release **does** take 250 bps. |
| Refunds | **0 bps** always (`expired_refunded` / `cancelled_refunded`). |
| Both rails | Same incidence (custodial + on-chain). |

**External copy:** “2.5% when a winner is paid out of escrow — not when you split a job.”

**Reject:** charging 250 bps on every child *and* parent against the same capital (double dip → churn).

---

## D2 — Cancel / refund cascade (**PROPOSED: bottom-up, deterministic**)

1. **Cancel/expire a node** only if product rules allow (no open disallowed children — see below).
2. **Children first:** every funded descendant must be `paid` | `expired_refunded` | `cancelled_refunded` before parent can refund. (No orphan funded children.)
3. **Carve-out refund:** child `cancelled_refunded` / `expired_refunded` with `parent_carveout` → restore amount to parent escrow **remaining allocatable**; parent stays `funded`/`in_review` as applicable. **0 bps.**
4. **Expansion refund:** expansion child refund → return to the **expansion payer** (employer who locked expansion), not silently into parent carve-out pool. **0 bps.**
5. **Root refund:** when root refunds, all descendants must already be terminal; root funds return to original root payer(s) per rail.
6. **Partial tree:** employer may cancel a leaf without cancelling siblings; siblings unaffected.
7. **After `in_review`:** cancel allowed only under existing allow-list (no winner yet); if winner selected, only `release` path.
8. **Float:** refunds end float on that capital immediately; no fee clawback (never charged).

**Invariant:** Σ(child carve-outs still locked or paid) ≤ parent locked amount; restored carve-outs increase parent remaining.

---

## D3 — Sub-team fund & winner authority (**PROPOSED: company rollup**)

| Action | Who |
|--------|-----|
| Create sub-team | Employer with company mint rights (role-gated). |
| Post job under company or sub-team | Employer role on **that company** (optionally scoped to sub-team). |
| Fund / lock escrow | Payer = employer account that locks; must have fund permission on company. |
| Pick winner | **Job employer** (the posting employer for that job). Sponsors never veto. |
| Seat / employment | Always `company_id` (= workspace root). Sub-team is organizational context only in v1. |
| Seat billing | **Billed to the company** (root). Not to sub-team. |
| Fee accounting | Platform fee attributed to company + job; payer is the locking employer. |

**Copy:** seats are “company seats,” never “team seats.”

**v1 simplify:** one billing customer per company; sub-teams do not get separate invoices.

---

## D4 — Depth cap & cycles (**PROPOSED: depth 3, no cycles**)

| Rule | v1 |
|------|----|
| Max job depth | **3** (root = depth 1; child = 2; grandchild = 3). Deeper blocked in app + check. |
| Max sub-team depth | **3** under company (company not counted as team). |
| Cycles | **Forbidden** on `parent_job_id` and `parent_team_id` (no loops/tangents in v1). |
| `root_job_id` | Always set; equals self for root; used for tree fee/refund walks. |
| Later | Loops/tangents only with explicit product + ledger design (out of v1). |

---

## Schema coordination notes (for Make Money)

- Map `workspaces` → **company** in copy; keep table name until rename migration.
- `teams` = sub-teams only (`company_id` required) — already in 019 direction.
- Jobs: enforce D1 in release service (fee if payee outside tree / winner user); carve-out funding = internal ledger transfer.
- Add `jobs.depth` or compute from parent chain; reject insert if depth > 3.
- Cycle check on parent pointer before save.
- Employments: require `workspace_id` = company root; optional `team_id` later.

---

## Dante pick checklist

- [ ] D1 leaf-outward fee
- [ ] D2 bottom-up refund cascade
- [ ] D3 company seat/billing rollup + job employer picks winner
- [ ] D4 depth 3 / no cycles

Once checked, Genius hardens PAYOUT_HYBRID + MONEY_MODEL to “decided” and Make Money lands migration constraints.

## Genius fee stress (sample tree)

`$10k` root → carve `$4k` + `$3k` → one `$4k` leaf pays winner @ 250 bps:

| Policy | Platform fee | Note |
|--------|--------------|------|
| **D1 leaf-outward (preferred)** | **$100** | Winner net $3,900; carve-outs $0 |
| Fee on carve-outs + leaf | $275 | $175 pure split-tax vs D1 |
| Double-dip root + $4k leaf | $350 | Same capital taxed twice |
| Both leaves pay under D1 | $175 total | Still $0 on carve transfers |

**Rec:** Lock D1 — protects trust, fee still scales with outward GMV.
