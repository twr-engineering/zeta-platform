# M4 — Collectibles (Receivables Ledger) — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M4 is event-driven glue between M1 (deals) and M5 (payments): its schema must exist early, its math is small but must be centavo-exact, and its projections feed M6/M7/M8.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 parallel to M6; M7 depends on M1, M4, and M5 since it aggregates NET GCI and collections by lead source). **M4 and M5 are built together right after M1** — the receivable is meaningless without payments and vice versa; interleave their milestones (M4.1 → M5.1 → M4.2 …). **M4.1 must land before M1's importer full run** (M1.4's collectibles leg writes status/override/note through M4's schema and APIs).

---

## Milestone M4.1 — Receivable entity + auto-create/restate from deal events (2–3 days)

**Objective:** the receivable exists 1:1 with deals, mirrors identity fields, and computes the booked/collectible anchors (Rule K) — no payments math yet.

**Deliverables checklist**
- [ ] Receivable schema (§3.1) with unique deal_id constraint; status enum default `Open`; audit fields
- [ ] `deal.created` → auto-create in-transaction; `deal.updated` → restate mirrors + Rule K fields; `deal.archived/restored` → archive/restore
- [ ] Rule K library functions (`booked_net_gci`, `default_total_collectible`, `total_collectible`) co-located with M1's engine library (one source of money truth)
- [ ] Fixture tests: D004 (booked 800,000 / collectible 875,000), D021 (354,591.84 / 354,591.84), D013 full-precision default (906,752.23 — not .24)
- [ ] Importer leg contract published for M1.4 (FR-M4-14 fields: status, confirmed_collectible, next_action_note; legacy note-missing flag)

**Tasks (≤1 day each):** schema + constraints + migrations · event consumers (create/update/archive) transactional wiring · Rule K functions + fixture tests · importer-leg API + reconciliation hooks (₱0.01 per-row report).

**Definition of done:** creating D001–D021 via M1 produces 21 receivables whose booked/default-collectible figures match WORKBOOK_REFERENCE §5 to the centavo; editing a deal restates its receivable in the same transaction; no code path can create a second receivable for a deal.

**Demo script:** create D004 through the M1 API → its receivable appears automatically showing Booked ₱800,000 / Total Collectible **₱875,000**; edit the deal's referral-out to 0 → booked restates to ₱875,000, collectible unchanged.

**Dependencies:** M1.2 (deal CRUD + events). **Blocks:** M1.4 full importer run, M5.2 (receivable feedback on payment save), M4.2.

## Milestone M4.2 — Collections math: payments aggregation, balance, dates, idle/aging (2–3 days)

**Objective:** the receivable reacts to M5 payment events — collected, balance, %, payment dates, months idle, age months, days-to-first-release — centavo-exact and synchronous.

**Deliverables checklist**
- [ ] Payment event consumers (`payment.created/updated/deleted`) → Rule L/M recompute in the payment's transaction
- [ ] Date helpers: last/first payment, months_idle (whole months, null rules), age_months (booking-date fallback), days_to_first_release (negative allowed)
- [ ] Chase-priority ordering (Rule Q: balance DESC, months_idle DESC NULLS LAST, deal_code) as an indexed projection
- [ ] Timezone-safe "today" for month math (workspace TZ)
- [ ] Fixture tests incl. Incentive-type payments counting toward collected

**Tasks (≤1 day each):** payment consumers + transactional recompute · date/idle/age helpers + null semantics · chase projection + ordering tests · negative-balance path + fully-paid-not-Closed signal.

**Definition of done:** posting D021's ₱50,000-gross incentive release moves its receivable to collected ₱44,642.86 / balance **₱309,948.98** / 12.59% in the same request; D021 days_to_first_release = −1, D001 = 12, D004 = 115; chase order over the 14 open workbook rows starts D013 → D005 → D016 → D010.

**Demo script:** log D021's incentive payment in M5 → flip to the ledger → balance ₱309,948.98, months idle 0; delete the payment → balance returns to ₱354,591.84, "no payment yet".

**Dependencies:** M4.1, M5.1 (payment entity + split engine + events).

## Milestone M4.3 — Status lifecycle, Confirmed Collectible override, variance & write-off (2–3 days)

**Objective:** the full business layer — Open/Closed/Cancelled with friction-gate confirmations and audit, the required-note override, variance on close, write-off on cancel, restated-override flag.

**Deliverables checklist**
- [ ] Transition API (Open→Closed, Open→Cancelled, reopen both ways) — friction-gated (explicit confirmation required), audit-logged; variance (Rule N) and written_off (Rule O) computed
- [ ] Closed/Cancelled null-out of months_idle/age_months; exclusion from open-balance/aging/chase projections
- [ ] Confirmed Collectible set/change/clear — **save blocked without next_action_note** (edge case 17); audit entries capture old→new + note
- [ ] Next Action note CRUD (persists across status changes)
- [ ] Restated-override review flag on deal edits (§4 rule 7)
- [ ] Data-health projections: open balance ≤ 0; Closed |variance| > ₱0.50

**Tasks (≤1 day each):** transition API + confirmation gates + audit · variance/write-off math + projection exclusions · override API + note enforcement + clear flow · restated-flag + data-health projections.

**Definition of done:** the seven workbook Closed fixtures (D001, D004, D006, D017–D020) close with variance ₱0.00; a synthetic cancel (collectible 675,000, collected 200,000) writes off ₱475,000 and leaves aging; override without note → 400 with doctrine copy; transition without the explicit confirmation acknowledgment → rejected (friction gate).

**Demo script:** on D004 press Close → dialog shows collected 875,000 vs collectible 875,000, variance ₱0 → confirm; then try to enter Confirmed Collectible ₱850,000 with no note → blocked; add "CLI advice 7/20: base excl. promo disc" → saved, cell turns blue, audit entry visible.

**Dependencies:** M4.2; M0 friction-gate confirmation pattern + audit infrastructure.

## Milestone M4.4 — Ledger UI, detail view, downstream projections & hardening (3–4 days)

**Objective:** the daily-use ledger screen and detail view (Corrections-doctrine "Adjust…" flow, blue override affordance), the M6/M7/M8/M9 projection endpoints, export, and performance.

**Deliverables checklist**
- [ ] Ledger table: chase-priority default sort, filters (status/developer/type/year/source/has-balance/overridden), totals row, status chips, % progress bars, "no payment yet", negative-balance styling
- [ ] Detail view: Rule K.2 explainer, payment history (M5 read-only w/ tax splits shown there), status timeline, override panel, cross-links
- [ ] "Adjust…" three-case Corrections-doctrine flow; Close/Cancel dialogs with variance/write-off preview
- [ ] Projection endpoints: position totals, aging rows, per-developer rollups (+ avg days-to-1st-release), per-source rollups (M7), booking-year summary (M8), search projection (M9)
- [ ] CSV/XLSX export (filtered set, override marker)
- [ ] Perf: 1,000-receivable fixture — list < 500 ms P95, projections < 300 ms; mobile card layout

**Tasks (≤1 day each):** ledger table + filters + totals · detail view + doctrine flow + dialogs · projection endpoints + contract tests with M6/M7/M8 stubs · export + mobile pass + perf tuning on the 1,000-row fixture.

**Definition of done:** M4 §9 acceptance criteria 1–15 pass (API + UI tests); M6's position section can be assembled entirely from M4 projections + M5 net-cash totals; export ties to the on-screen filtered set.

**Demo script:** open the ledger → 14 open receivables ordered D013 first; filter "overridden only" → the ₱850,000 demo row with its blue cell and note; open D021 → explainer reads "GCI 318,877.55 + incentive 35,714.29 = 354,591.84", payment history shows the ₱50,000 release split.

**Dependencies:** M4.3; consumed by M6.1 (dashboard skeleton), M7.1, M8.1, M9.1.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M4.1 Entity + deal-event lifecycle | 2–3 |
| M4.2 Collections math + dates/idle | 2–3 |
| M4.3 Status, override, variance/write-off | 2–3 |
| M4.4 Ledger UI + projections + hardening | 3–4 |
| **Total** | **9–13** |

Assumptions: M1's engine library and event bus exist (M1.1/M1.2 done); M5.1 lands between M4.1 and M4.2 (interleaved build); decimal library shared with M1; projections may cache but must invalidate on every M1/M5 event; UI kit + blue-input/locked-computed affordances established by M0/M1 screens.

## Test plan (fixtures = workbook-verified numbers; centavo-exact unless noted)

1. **Rule K defaults:** D004 → booked 800,000 / collectible 875,000; D021 → 354,591.84 / 354,591.84; D008 → 317,414.70 (GCI 277,236.13 + incentive net 40,178.57); D010 → 426,953.13; full-precision regression D013 → 906,752.23 (2-dp-component sum 906,752.24 must FAIL).
2. **Override precedence:** confirmed 850,000 on D004 → total_collectible 850,000, default recoverable in tooltip data; clear → reverts to 875,000; set/clear without note → rejected.
3. **Rule L aggregation:** D021 single Incentive payment → collected 44,642.86; add a synthetic Commission payment 100,000 net → 144,642.86; delete it → back to 44,642.86. Blank vs "Commission" type equivalence covered in M5/importer tests.
4. **Rule M:** D021 balance 309,948.98, pct 12.59%; zero-collectible guard → pct null; Open overpayment (collected 900,000 vs 875,000) → balance −25,000 displayed negative + fully-paid signal raised.
5. **Rule N/O lifecycle:** the seven workbook Closed rows → variance 0.00 each; synthetic short-close (350,000 vs 354,591.84) → −4,591.84; synthetic over-close (+5,000) → data-health hit at |var| > 0.50 (and NOT at ±0.50 exactly — tolerance boundary test); cancel with partial 200,000/675,000 → written_off 475,000, excluded from aging/chase, cash kept in position totals.
6. **Rule P dates:** months_idle null for Closed/Cancelled/no-payment; D021 idle 0 at 2026-07-17, becomes 1 at 2026-08-09 (clock-injection test); age_months booking fallback (D008 = 3 at 2026-07-17); days_to_first_release D001 12 / D004 115 / D021 **−1**; workspace-timezone boundary test at month rollover.
7. **Rule Q ordering:** 14 open workbook rows → D013, D005, D016, D010, D014, D009, D008, D021, D012, D007, D011, D002, D003, D015; equal-balance synthetic pair → idle DESC then deal_code decides; stable across repeated queries.
8. **Event integrity:** deal edit restates receivable without touching payments (integration with M1 acceptance 8); receivable count always equals deal count (property test over random create/edit/archive sequences); archive/restore round-trip.
9. **Friction gates & audit:** status + override APIs reject requests lacking the explicit confirmation acknowledgment, and any cross-workspace/unauthenticated request (403, no audit rows); every confirmed transition/override writes old→new audit entries; reopen restores math and appends to the timeline.
10. **Importer leg:** v30.20 file → 21 receivables, 14 Open / 7 Closed / 0 Cancelled, 0 overrides, D021 collected/balance 44,642.86 / 309,948.98; per-row reconciliation within ₱0.01; Σ open balance ties to sheet Balance Outstanding within ₱0.50; legacy override-without-note imports with the "note missing (legacy)" flag.
11. **Projection contracts:** M6 position/aging/per-developer payloads, M7 per-source rollup (booked, balance, deal_type split, booked_year filter), M8 booking-year summary — snapshot-tested against the imported workbook state.
12. **Performance:** 1,000 synthetic receivables + 1,000 payments — ledger P95 < 500 ms, projections < 300 ms, payment-post recompute < 200 ms added latency.
