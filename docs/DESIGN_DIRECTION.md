# Contest Company OS — Design direction (locked from Dante Final)

*Captured 2026-09-26 · Refined same day · Stored beside NAMING_GTM.md*

## Role model (vocabulary)

| Instead of… | Use… | Notes |
|-------------|------|--------|
| Top-level “team” / “group” | **The company** | Root unit is always **the company**. Never call the top level a team. |
| Flat “team” as org root | **Sub-team** | Teams exist **only** as sub-teams **inside** a company. |
| User | **Employee**, **Employer**, or **Sponsor** | People are not “users.” |

### Roles (anyone can fill them)

- **Employer** — posts and funds work; picks the one winner.
- **Employee** — ships work; may win and join the company (or a sub-team under it).
- **Sponsor** — contributes capital, software, materials, or services.

These are **roles**, not org types. A sponsor does **not** have to be a real legal company — just a person (or bot) serving that function. Same for employer and employee: the same person can act in different roles across companies / sub-teams / jobs.

**Copy rules:** Never name the root “a team.” Say **the company**. Prefer **sub-team** when you mean a branch under the company. Avoid “users” and bare “groups.”

## Org tree (structure)

The whole structure is a **tree**:

```
company                          ← root (never called “team”)
├── sub-team
│   ├── sub-team …
│   ├── job
│   │   └── sub-job …
│   └── job …
└── job
    └── sub-job …
```

- **Company** at the root.
- **Sub-teams** branch beneath the company (and may nest).
- **Jobs** and **sub-jobs** nest the same way (under company or under a sub-team).
- Same fractal pattern for org nodes and for funded work.

## Recursive job model (fractal work)

A **funded job** can break into **sub-jobs**, each with its own budget:

- Budget source: **parent job budget** (carve-out) **or** an **expansion budget** (new capital added).
- Jobs may **branch**, **tangent**, or **loop** recursively.
- The org grows from **funded work** under the company tree — fractal shape from escrowed jobs, not a fixed chart first.

### Implications for schema / product

- Company is the root entity; sub-teams are children of company (or of other sub-teams).
- Jobs need parent/child links and budget provenance (parent carve-out vs expansion); jobs hang off company or sub-team.
- Escrow rules must nest: child budgets cannot exceed available parent/expansion funds without an explicit expansion lock.
- Winner/employment can attach at any job node; membership rolls up toward **the company**.
- Recursion is first-class for both sub-teams and jobs.

## Status

- Brand (soft-lean clockwork): primary **Lock + Work**; clockwork secondary only. Primary line: *Lock the payout. Ship the work. Hire the winner.* Secondary: *Lockwork — the hire that runs like clockwork, because the payout was locked.* Logo: padlock/purse primary; gear tooth texture only. Fee copy escrow-primary. See `NAMING_GTM.md`.
- Naming: **Lockwork** public (HireProof runner-up); internal `Contest OS` / `contest_os` (see `NAMING_GTM.md`).
- Vocabulary + company→sub-team→job tree + recursive jobs: **design direction from Dante** — source-of-truth until revised in chat.
