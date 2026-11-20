# M0 — Account Foundation & Settings — Milestone Document

Baseline assumption for all estimates: **one solo full-stack developer**, ideal dev-days (focused days, no meetings), stack per Master PRD recommendations (multi-tenant web app, relational DB, server-side pure calculation library). Ranges reflect uncertainty, not padding.

**v1 positioning:** single-user workspaces (one agent = one tenant). No roles, invitations, or member management in v1 — the schema is team-ready (membership table, fixed `owner` role) but no team features are built. This removes the old M0.4 (members & roles) from the critical path entirely.

## Sequencing note

M0 is the root of the dependency graph: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 can run parallel to M6; M7 needs M1+M4+M5). Nothing else can start before M0.1–M0.2 exist; M0.3 (lists) must land before M1's deal form.

---

## Milestone M0.1 — Auth & personal workspace (2–4 days)

**Objective:** an agent can sign up and land in their own empty, tenant-isolated app shell.

**Deliverables checklist**
- [ ] Auth (email+password, verification, reset; Google OAuth if the stack makes it ≤ half a day), session management
- [ ] Workspace auto-created on sign-up; `deal_id_sequence` column; membership table with the single `owner` row (team-ready schema, no team UI)
- [ ] Tenant scoping middleware (every query workspace-scoped)
- [ ] App shell with Settings navigation stubs; ₱/decimal formatting helpers
- [ ] Friction-gate confirmation component (typed/checked confirm + audit hook) — the v1 replacement for role-gating, reused by every module
- [ ] CI + migrations + seed script for dev fixtures

**Tasks (≤1 day each):** schema (users, workspaces, memberships) · auth endpoints + email plumbing · scoping middleware + tests · app shell/layout · formatting utils + confirmation component · CI pipeline.

**Definition of done:** two test agents in two workspaces can never read each other's rows (integration test proves it); passwords hashed; all routes authenticated; sign-up → workspace is atomic.

**Demo script:** sign up as `agent@solo.test` → verify → land in "JD's Book" with empty Settings; sign up a second agent, prove isolation.

**Dependencies:** none.

## Milestone M0.2 — Tax settings & audit trail (2–3 days)

**Objective:** the four tax settings editable with validation, caching, and an audit log.

**Deliverables checklist**
- [ ] TaxSettings row auto-created with defaults (12% / 10% / ₱3,600,000 / 3)
- [ ] Settings screen with sheet captions (incl. the solo-agent 5%-EWT explainer), percent-entry → decimal storage
- [ ] AuditLogEntry table + write path + audit log viewer (filterable)
- [ ] Settings read cache + invalidation
- [ ] Recompute-confirmation contract stubbed (fires event M1 will consume)

**Tasks:** TaxSettings schema/API with range validation · audit write path + viewer UI · settings UI + validation states · cache layer + tests · recompute event contract doc/stub.

**Definition of done:** invalid values (VAT = 0, threshold ≤ 0, idle < 1) rejected server-side; every change produces an audit row with old→new; unit tests cover boundaries.

**Demo script:** change EWT 10% → 5% (the sworn-declaration path); show audit entry `ewt_rate: 0.1000 → 0.0500` with timestamp; change it back.

**Dependencies:** M0.1.

## Milestone M0.3 — Configuration lists (3–4 days)

**Objective:** Property Types, Developers, Lead Sources fully manageable and consumable by M1.

**Deliverables checklist**
- [ ] Three entities + CRUD APIs, case-insensitive uniqueness, trim
- [ ] Archive semantics + reference-count checks (delete blocked when referenced)
- [ ] List screens: inline add/rename, archive toggle, reference counts, drag sort (Lead Sources), empty states
- [ ] Seed-offer flow (accept/edit/skip the workbook's example sets)
- [ ] Read APIs for dropdowns (active) and reporting (active+archived)
- [ ] CSV/XLSX export per list

**Tasks:** schemas + uniqueness/validation · archive/reference logic + tests · list UI component (shared) ×3 instances · seed-offer UI · export endpoints · dropdown API + caching.

**Definition of done:** acceptance criteria 4, 6, 8 of the PRD pass; a referenced type cannot be hard-deleted via API even with a forged request.

**Demo script:** add Developer "Abrown Inc." (Net) and "Megaworld GERI" (Gross); rename a Lead Source and show it propagate (stub deal fixture); attempt to delete a referenced Property Type → blocked with count → archive instead.

**Dependencies:** M0.1; M0.2 for audit writes.

## Milestone M0.4 — Account polish & data ownership (1–2 days)

**Objective:** the solo-agent account essentials that replace the old team milestone.

**Deliverables checklist**
- [ ] Account screen (name, email, password change with session invalidation)
- [ ] Full-workspace export (all tables, one zip of CSV/XLSX) — the "it's my data" guarantee
- [ ] Account deletion behind typed confirmation, preceded by the export offer
- [ ] Rate limiting / auth hardening pass

**Tasks:** account screen · export-all job · deletion flow · hardening checklist.

**Definition of done:** deletion is irreversible only after typed confirmation; export contains every user-visible table; auth endpoints rate-limited.

**Demo script:** export the workspace zip; delete the account; sign-up again from scratch.

**Dependencies:** M0.1–M0.3.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M0.1 Auth & personal workspace | 2–4 |
| M0.2 Tax settings & audit | 2–3 |
| M0.3 Configuration lists | 3–4 |
| M0.4 Account polish & data ownership | 1–2 |
| **Total** | **8–13** |

(Down from 11–16 in the team-scoped draft: invitations, role matrix middleware, member UI, and workspace switching are all v2.)

Assumptions: framework with batteries (auth libraries, ORM); no SSO; email via a transactional provider; UI from a component library, custom-styled later.

## Test plan

Unit tests (per PRD formulas/rules; fixtures from the workbook where applicable):
1. Defaults on workspace creation = 0.12 / 0.10 / 3,600,000.00 / 3; exactly one `owner` membership.
2. Validation boundaries: vat_rate ∈ (0,1); ewt_rate ∈ [0,1); threshold > 0; chase_idle_months ≥ 1 integer.
3. Threshold comparator handed to M1 is strict `>`: List = 3,600,000.00 (exempt) and 3,600,000.01 (VAT-able) — fixture for prompt edge case 1.
4. Rate consumption: with defaults, `net_of_vat(8,000,000) = 7,142,857.142857…` stored/displayed ₱7,142,857.14 (D021 input leg); with ewt 0.05, `ewt(44,642.86) = 2,232.14`.
5. Uniqueness: "megaworld geri " vs "Megaworld GERI" collision; rename collision.
6. Archive: referenced item delete → blocked; archived item absent from dropdown API, present in reporting API with `(inactive)` marker data.
7. Friction gates: every money-restating mutation requires the confirmation token; API calls without it are rejected (parameterized across settings mutations).
8. Audit: every mutating endpoint writes exactly one entry with correct old→new diff.
9. Tenant isolation: cross-workspace read attempts return empty/404 (never 200 with data).
10. Sign-up atomicity: user + workspace + membership + tax settings created in one transaction (failure rolls all back).
