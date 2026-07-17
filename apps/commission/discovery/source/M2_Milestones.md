# M2 — Yield Summary & Realized Analytics — Milestone Document

Baseline: solo full-stack dev, ideal dev-days (focused days, no meetings), stack per Master PRD (relational DB, server-side pure calculation library shared with M1). M2 is a **pure read model** — no mutations, no schema for user input — so the risk is in aggregation correctness and the M3 feed contract, not UI complexity.

## Sequencing note

Overall dependency-safe order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10**; **M2/M3 can run parallel to M6**; M7 depends on M1, M4, and M5. M2 needs only M1 (deal fields + events) and M0 (auth/formatting) — it does **not** need M4/M5/M6, which is why it can start the moment M1.2 ships and run alongside the collections track. **M3 cannot start its live-linked planning math before M2.3 (PlanningBasis API) exists**, so within the M2/M3 pair, build M2 first; M2.1's classifier fixtures also double as regression cover for M1's importer output.

**Main schedule risks:** (a) the M1 event contract — if `deal.updated` payloads lack old values, −old/+new restatement needs a redesign (lock the payload shape with M1.2 before starting M2.2); (b) Open Question 2 (Cancelled deals) is the only open item that can change fixture values — get the owner's parity confirmation before M2.1's expected-values table is frozen.

---

## Milestone M2.1 — Segment classifier & aggregation functions (2–3 days)

**Objective:** the complete, pure, fixture-proven aggregation core — classifier, per-segment aggregates, report assembly, planning basis — no persistence, no UI.

**Deliverables checklist**
- [ ] `classifySegment(deal) → Resale | Developer | Rental | Referral` (PRD §3.2, single source of truth)
- [ ] `buildYieldReport(deals, yearFilter) → YieldSummaryReport` (§3.3: 5 rows, total, memos, avg prices)
- [ ] `buildPlanningBasis(deals) → PlanningBasis` (§3.4, full-precision decimals, nulls on empty)
- [ ] Partition-invariant check + unclassified-deal reporting (Rule 9)
- [ ] Fixture suite: all 21 workbook deals → every §9 criterion-1/2/3/4 value centavo-exact; empty-year, Referrer-exclusion, rentals-excluded cases
- [ ] Decimal-only guarantee test (no float path; §3.4 identity 6,488,497.25 ÷ 17 = 381,676.31)

**Tasks (≤1 day each):** classifier + predicate tests over 21 fixtures · segment/footer aggregation functions · planning-basis function + null semantics · invariant check + synthetic bad-deal fixtures · full fixture suite wiring (expected-values table from PRD §9).

**Definition of done:** with the 21-deal fixture set, the report reproduces exactly — SALES SUBTOTAL 17 / ₱159,280,945.00 / ₱6,488,497.25 / 4.0736%; Resale 4.8643%; Developer 3.6537%; Rental 8.3333%; memos ₱357,142.87 / (₱75,000.00); blended avg ₱9,369,467.35 — in CI, decimal-exact; 100% branch coverage on classifier + guards.

**Demo script:** run the suite; feed the 21 fixtures + yearFilter "2027" to a REPL and show zeroed rows with planning basis still 4.0736% / ₱9,369,467.35.

**Dependencies:** M1.1 (deal shape + decimal utilities). Pure functions — can start before M1's UI exists.

## Milestone M2.2 — Materialized aggregates & event-driven restatement (2–3 days)

**Objective:** aggregates persist per (workspace, segment, booked_year), restate on M1 deal events, and never drift.

**Deliverables checklist**
- [ ] `yield_aggregate` table (§3.5) + migration; O(segments × years) report reads
- [ ] Event consumers for `deal.created/updated/archived/restored`: −old/+new application, segment/year moves handled, idempotent per event
- [ ] Reconciliation job (nightly + on-demand endpoint): recompute from raw deals via M2.1 functions, zero-drift assertion + alarm
- [ ] basis_version increment on any sales-segment change; restatement latency ≤2 s
- [ ] Workspace-scoping + auth/tenant-isolation tests (read-only surface — nothing to friction-gate)

**Tasks (≤1 day each):** aggregate schema + migration + read queries · event consumers + −old/+new math (incl. segment/year moves) · idempotency/retry tests (duplicate event ⇒ no double-count; out-of-order events) · reconciliation job + drift alarm + on-demand endpoint · latency instrumentation + tenancy/auth tests.

**Definition of done:** PRD criterion 8 passes as an integration test — archive D021 ⇒ subtotal 16 / ₱151,280,945.00 / ₱6,133,905.41 / 4.0546%, AllTimePrice ₱9,455,059.06; restore ⇒ criterion-1 values exactly; reconciliation reports zero drift after 500 random mutations (property test).

**Demo script:** import the workbook → edit D021's list price ₱8,000,000 → ₱9,000,000 in M1 → watch the Developer row and blended yield restate within 2 s → revert → original values return; run reconciliation → "0 drift."

**Dependencies:** M2.1; M1.2 (deal events); M0.1 (tenancy).

## Milestone M2.3 — PlanningBasis API for M3 (1–2 days)

**Objective:** the versioned, full-precision feed M3 consumes live — the module's most important external contract.

**Deliverables checklist**
- [ ] Internal API: `{all_time_yield, all_time_price, all_time_sales_deals, all_time_sales_volume, all_time_sales_gci, basis_version, computed_at}` — full-precision decimals, nulls when no sales deals
- [ ] Contract doc + consumer test double for the M3 team (i.e., future-you)
- [ ] Precision proof in CI: fees-per-deal from API values = ₱381,676.31 (identity §3.4); display-rounded inputs would give 381,674.62 — test asserts the good path
- [ ] < 50 ms P95 read (cached, invalidated by basis_version)

**Tasks:** API endpoint + serializer (decimal-safe, no float JSON) · contract doc + fixture double · precision/identity CI test + cache.

**Definition of done:** PRD criteria 4 and 11 pass; an M3 stub renders 44.33 deals needed end-to-end from live M2 data (16,920,000 ÷ 381,676.31).

**Demo script:** GET the planning basis → 0.0407361800… / 9,369,467.3529… ; archive D021 → basis_version bumps, yield reads 4.0546%.

**Dependencies:** M2.2. **Blocks M3's live-link milestone.**

## Milestone M2.4 — Yield Summary screen & polish (2–3 days)

**Objective:** the user-facing report at full sheet parity: filter, table, memos, averages, planning-basis card, drill-through, export, mobile.

**Deliverables checklist**
- [ ] Screen per PRD §6: year filter (sole blue input), 5-row segment table with locked-computed styling + formula tooltips, TOTAL + memo lines with the "already inside" caption, avg-price block, Planning Basis card with its "ignores the filter" label
- [ ] Drill-through: segment row → M1 deal list pre-filtered (FR-M2-12)
- [ ] Empty states (no deals; empty filter year), partition-invariant warning banner
- [ ] CSV/XLSX export (yields at 4 dp) — FR-M2-09
- [ ] Mobile cards at 360 px; live refresh on restatement (push or 2 s poll)
- [ ] Perf pass: 1,000-deal fixture, render < 500 ms P95 (PRD criterion 13)

**Tasks:** table + footer + planning card · filter + drill-through wiring · empty/warning states · export endpoint · mobile + live-refresh · perf test with synthetic fixture.

**Definition of done:** PRD criteria 1–3, 5–7, 10, 12–13 pass as UI/integration tests; a screenshot of the screen against the open workbook shows value-for-value parity.

**Demo script:** "Import the v30.20 workbook → open Yield Summary → SALES SUBTOTAL reads **17 / ₱159,280,945.00 / ₱6,488,497.25 / 4.0736%**, Rental reads 8.3333%, Referral is empty; flip the filter to 2027 → zeros, planning card unmoved; click the Resale row → 7 deals listed; export → same numbers."

**Dependencies:** M2.2 (data), M2.3 (planning card), M1.3 (deal list for drill-through), M0.4 (account polish & data ownership).

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M2.1 Classifier & aggregation functions | 2–3 |
| M2.2 Materialized aggregates & restatement | 2–3 |
| M2.3 PlanningBasis API | 1–2 |
| M2.4 Screen & polish | 2–3 |
| **Total** | **7–11** |

Assumptions: M1's decimal library and event bus exist and are trusted; no charting library (table parity only); reconciliation runs on the app's existing job runner; Open Questions 1–5 resolved or explicitly deferred without blocking (only OQ2 — Cancelled deals — could change fixtures, and only if the owner opts out of sheet parity).

## Test plan

Every formula unit-tested with the workbook's verified numbers as fixtures (all 21 deals; 2026 filter ≡ All in live data):

1. **Classifier:** each of the 21 deals lands in its expected segment (7 Resale, 10 Developer, 4 Rental, 0 Referral); synthetic Referrer deal → Referral regardless of transaction type; synthetic Sale+N/A+non-Referrer → unclassified, invariant fires (Rule 9).
2. **Segment aggregates (criterion 1):** Resale 7 / 55,251,000.00 / 2,687,550.00 / 4.8643% / 34.69% (component check: 436,050 + 126,500 + 117,500 + 800,000 + 675,000 + 180,000 + 352,500); Developer 10 / 104,029,945.00 / 3,800,947.25 / 3.6537% / 65.31%; SALES SUBTOTAL 17 / 159,280,945.00 / 6,488,497.25 / 4.0736%; Rental 4 / 2,400,000.00 / 200,000.00 / 8.3333%.
3. **Footer:** TOTAL GCI (all ops) 6,688,497.25; memo incentives 357,142.87 from stored 2-dp values (assert also the documented ₱0.01 delta vs full-precision 357,142.86 — Rule 8); memo referral-outs −75,000.00.
4. **Averages:** 7,893,000.00 / 10,402,994.50 / 9,369,467.35; rental annual GCI 200,000.00; "—" when a population is empty.
5. **Planning basis:** yield 0.0407361800… and price 9,369,467.3529… full precision; identity yield × price = 6,488,497.25 ÷ 17 = 381,676.31; nulls on an empty workspace; **unchanged by any year filter** (assert under filter 2027).
6. **Exclusions:** Referrer fixture moves no sales number (criterion 6); rentals contribute nothing to the blend (criterion 7 — and the contaminated-blend value 4.1364% is asserted NOT to appear).
7. **Restatement:** archive D021 ⇒ 16 / 151,280,945.00 / 6,133,905.41 / 4.0546% / AllTimePrice 9,455,059.06; restore ⇒ exact criterion-1 values; duplicate event delivery ⇒ no double-count (idempotency); segment-changing edit (Resale→Developer) moves the deal between rows atomically.
8. **Booked basis:** M4 status changes (Open/Closed/Cancelled) on any fixture produce zero M2 diffs (Rule 1).
9. **Empty year:** filter 2027 ⇒ zeros/em-dashes, no division errors (criterion 5).
10. **Precision:** decimal-only path property test; export renders yields at 4 dp; reconciliation zero-drift after randomized mutation sequences at 1,000-deal scale.
11. **Drill-through integrity:** each segment row's click-through deal list contains exactly the deals in the PRD §9.0 fixture appendix for that segment (7 / 10 / 4 / 0), under both the All and 2026 filters.
12. **Export parity:** CSV/XLSX values byte-compare against the rendered report for the full fixture state, including the planning-basis block and the memo captions.
