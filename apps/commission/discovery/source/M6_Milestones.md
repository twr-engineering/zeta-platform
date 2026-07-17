# M6 — Collections Dashboard — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M6 is pure read-model + one inline write — the risk is arithmetic fidelity and the year-filter scope rule, not architecture.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 can run parallel to M6; M7 after M1+M4+M5). M6 needs M4+M5 entities **and their events**, plus M3's TargetTable **shape** for target derivation. Since M3 lands *after* M6 in the build order, M6.2 must not block on it: **build the target as manual-override-only first** (AnnualTargetOverride is owned by M6), then wire the ROUNDUP-from-TargetTable derivation when M3's table exists — the derivation function takes a TargetTable row as input, so a stub row fixture unblocks all math and tests immediately.

---

## Milestone M6.1 — Aggregation read models + reconciliation suite (3–4 days)

**Objective:** all eight sections' numbers computed server-side (no UI) from M4/M5/M1 data, with the internal reconciliation assertions passing on the imported v30.20 fixture.

**Deliverables checklist**
- [ ] Read-model service: Section 1 position, Section 3 cash & tax, Section 4 aging buckets, Section 5 by-developer, Section 6 monthly, Section 7 checks (a)–(d), Section 8 chase query — decimal arithmetic throughout
- [ ] Section 2 math: AnnualTargetOverride entity + CRUD (audited); ROUNDUP_10K + pace function (clamps, leap year, Asia/Manila "today" injectable clock)
- [ ] Event consumers (payment.created/updated/deleted, receivable.updated, deal.updated) or 60 s cache invalidation
- [ ] Reconciliation assertions: aging TOTAL = Balance Outstanding; Section 5 TOTALs tie; Dec cumulative = year collected
- [ ] Full fixture test suite (see Test plan)

**Tasks (≤1 day each):** position + cash&tax aggregates · aging/age-month bucketing + by-developer rollup · monthly + chase queries + Data Health predicates · target/pace functions + override entity · events/cache + reconciliation assertions in CI.

**Definition of done:** on the imported v30.20 fixture with clock frozen at 2026-07-17: Total Collectible 6,763,497.25 / Collected 1,908,192.86 / Outstanding 4,855,304.39 / Net Cash 1,909,085.71; target 16,920,000; pace 9,178,520.55; aging 9-0-5-0 deals tying to outstanding — all centavo-exact in CI.

**Demo script:** call the dashboard API on the imported workbook → read back the Section 1–8 payloads and show the reconciliation assertions passing; log a ₱10,000 payment via M5 → payload restates within 60 s.

**Dependencies:** M4.1 (receivable schema + events), M5.1 (payments schema + events), M1.2 (deal fields/events), M0.2 (chase_idle_months). TargetTable derivation behind a stub until M3 lands.

## Milestone M6.2 — Dashboard UI: sections 1, 2, 3, 6 (3–4 days)

**Objective:** the top of the dashboard usable daily — position tiles, target/pace with ahead-behind, tax waterfall, monthly table, year filter.

**Deliverables checklist**
- [ ] Tile groups for Sections 1–3 (incl. verbatim tax explainer, "across N deal(s)" caption, red/green states)
- [ ] Section 2 pace bar + "ahead/behind by ₱…" line; override badge + account-owner click-to-edit behind the standard confirmation + audit pattern, with derived value shown; "—" states for missing target rows
- [ ] Section 6 twelve-month table with cumulative target × m ÷ 12 and signed variance
- [ ] Year filter (per-user state, Asia/Manila default) restating ONLY sections 2/6, with the mandatory scope caption
- [ ] Drill-down links: tiles → filtered receivable/deal lists; monthly rows → payments list
- [ ] Empty states; mobile stacking; ₱ formats

**Tasks:** tiles + waterfall · target tile + override modal · monthly table · year-filter state + scope wiring · drill-down routing · mobile/empty-state pass.

**Definition of done:** acceptance criteria 1–4, 7, 13 pass as UI tests; switching year leaves sections 1/3 visually and byte-identical (snapshot test).

**Demo script:** open the imported workbook's dashboard → "behind by ₱7,270,327.69" in red at 2026-07-17; set override ₱15,000,000 → pace restates to ₱8,136,986.30 with badge; flip year to 2025 → sections 2/6 change, section 1 doesn't move.

**Dependencies:** M6.1.

## Milestone M6.3 — Aging, receivables by developer, Data Health (2–3 days)

**Objective:** the diagnostic middle of the page — sections 4, 5, 7 with drill-downs.

**Deliverables checklist**
- [ ] Aging table (4 buckets + TOTAL) with bucket → filtered receivable list links
- [ ] By-developer table incl. "Resale / Rental (no developer)" row, TOTAL, "—"/negative Avg-Days handling
- [ ] Data Health rows: ✓/count states, fix-instruction copy, drill-downs to offending records; (e)/(f) rendered per PRD rule 17 (informational archived-item counts or omitted)
- [ ] CSV/XLSX export for both tables
- [ ] Reconciliation caveat surfacing (open negative-balance rows noted next to the aging TOTAL when present)

**Tasks:** aging UI + links · by-developer UI + links · Data Health UI + fix copy · exports.

**Definition of done:** acceptance criteria 5, 6, 8, 9 pass; tolerance boundary test (−0.50 ✓ / −0.51 flags) proven in an E2E test.

**Demo script:** show aging 9/0/5/0 tying to ₱4,855,304.39; Abrown row at 5.71% collected with Avg Days −1; clear a status on a seeded row → Data Health (a) flips to 1 with a working drill-down.

**Dependencies:** M6.1; M6.2 (page shell).

## Milestone M6.4 — Chase list + inline Next Action + performance hardening (3–4 days)

**Objective:** the working surface — sortable chase list with write-through notes — and the module's NFRs proven at 1,000 + 1,000 scale.

**Deliverables checklist**
- [ ] Chase table: 9 columns, balance-DESC ordering (+ tiebreaker per Open Q 1 decision), "no payment yet"/"⚠ chase"/"ok" chips with precedence rule, > 30 warning banner
- [ ] Inline Next Action editor (blue-input affordance, save-on-blur — the module's sole write path; no role gate in v1) writing through to M4 with audit
- [ ] Row → receivable-detail drill-down; CSV/XLSX export
- [ ] Perf: full dashboard < 1.5 s at 1,000 deals + 1,000 payments; year switch < 500 ms; load-test fixture in CI
- [ ] Freshness proof: payment logged in M5 visible ≤ 60 s (integration test)
- [ ] Mobile chase-first layout

**Tasks:** chase query UI + chips + ordering · inline editor + M4 write-through + audit test · exports + drill-downs · 1,000/1,000 synthetic fixture + perf runs · freshness integration test · mobile pass.

**Definition of done:** acceptance criteria 10–12, 16 pass; editing Next Action from the dashboard and from M4's receivable view are provably the same field (single source).

**Demo script:** chase list opens with D013 ₱906,752.23 on top of 14 rows; type "Called CLI — releasing Aug 15" inline → open the D013 receivable in M4 and read the same note + audit entry; jump the clock to 2026-10-15 → D021 flips to "⚠ chase".

**Dependencies:** M6.1–M6.3; M4's receivable detail view for drill-down targets.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M6.1 Read models + reconciliation | 3–4 |
| M6.2 UI sections 1/2/3/6 + year filter | 3–4 |
| M6.3 Aging / by-developer / Data Health | 2–3 |
| M6.4 Chase list + inline edit + perf | 3–4 |
| **Total** | **11–15** |

Assumptions: M4/M5 schemas and events are live and the v30.20 importer (M1.4) can seed the fixture workspace; charting is minimal (one pace bar — no chart library rabbit holes); target derivation may run on a TargetTable stub until M3; timezone utilities available for Asia/Manila day-of-year math.

**Risks to watch:**
- *Year-filter scope regressions* — the single most likely defect class (sections 1/3/4/5/7/8 accidentally picking up the filter); guarded by the snapshot test in plan item 11, which must run in CI from M6.2 onward.
- *Clock discipline* — pace, aging, and chase chips are all date-dependent; every test must use the injectable frozen clock (never `now()`), or the fixture numbers above rot within a month.
- *Open Question 1 (chase tiebreaker)* — decide before M6.4's ordering test is written; the test carries a TODO marker until then.

## Test plan

All fixtures from the imported v30.20 workbook (21 deals, 8 payments, D004 override 875,000 / referral paid, 7 Closed) with a **frozen injectable clock**; all money asserted centavo-exact in decimal.

1. **Position (Section 1):** Total Collectible 6,763,497.25; Collected Net 1,908,192.86 (= 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86); Outstanding 4,855,304.39; % 28.21; written-off 0; variance 0; Net Cash 1,909,085.71; referral owed 0.00 across 0 deals. Synthetic add-ons: a Cancelled deal (100,000 collectible / 40,000 collected) → written-off 60,000; a Closed-over deal (+500) → variance +500; unpaid referral deal → tile 75,000 across 1 deal.
2. **Target derivation:** 11,500,000 ÷ 0.68 = 16,911,764.7059 → ROUNDUP_10K = 16,920,000 (assert never 16,910,000; assert exact multiples don't round up: ROUNDUP_10K(16,920,000) = 16,920,000); override 15,000,000 wins; no TargetTable row and no override → target 0 → "—" (no division error).
3. **Pace function (parameterized):** 2026-07-17 → (197+1) ÷ 365 = 0.5424657534… × 16,920,000 = 9,178,520.55; 2026-01-01 → 1 ÷ 365 → 46,356.16; 2026-12-31 → 100% → 16,920,000; leap 2028-12-31 → 366 ÷ 366 = 100%; 2028-03-01 → day 61 ÷ 366; past year clamps to 1, future year to 0; Asia/Manila boundary test (UTC 2026-07-16 17:00 = Manila Jul 17 01:00 → day 198, not 197).
4. **vs pace:** 1,908,192.86 − 9,178,520.55 = −7,270,327.69 → "behind"; synthetic collected 10,000,000 → +821,479.45 → "ahead".
5. **Cash & tax (Section 3):** Gross 1,913,550.00 / VAT 5,357.14 / EWT 4,464.29 / Net Cash 1,909,085.71 / Retained 1,903,728.57; assert Retained = Gross − VAT − EWT and Net Cash = Gross − EWT identities on random payment sets (property test).
6. **Aging (frozen 2026-07-17):** buckets 9 / 0 / 5 / 0 deals; balances 3,438,889.69 / 0 / 1,416,414.70 / 0; percentages 70.83 / 0 / 29.17 / 0; TOTAL = Balance Outstanding. Boundary tests: age exactly 1 → bucket 1–3; exactly 3 → 3–6; exactly 6 → 6+. Cancelled partial-collection deal never appears (edge case 9). Open overpaid deal (balance ≤ 0) excluded from buckets while flagged by Health (b).
7. **By developer:** CLI 4 deals / 1,703,364.15 / 0%; Megaworld GERI 3 / 685,224.20 / 0%; Abrown 2 / 736,902.11 / collected 44,642.86 = 5.71% of 781,544.97 / Avg Days −1; Pueblo de Oro 1 / 630,813.93; Resale/Rental row 4 w/ balance / 1,099,000 / 1,863,550 collected = 62.90% of 2,962,550 / Avg Days 452 ÷ 7 = 64.57; TOTALs tie to Section 1.
8. **Monthly (2026):** Jan 436,050 / 1 payment / cum −973,950; Feb–Jun zeros carrying cum 436,050; Jul 1,472,142.86 collected, 1,473,035.71 net cash, 7 payments, cum 1,908,192.86 vs 9,870,000 → −7,961,807.14; December cumulative = Section 2 collected (reconciliation assertion).
9. **Data Health predicates (unit):** (a) null-status with activity → 1 (importer-seeded); (b) Open with collectible − collected ≤ 0 → flags at exactly 0; (c) tolerance: Closed variance −0.50 passes, −0.51 flags, +0.51 flags — decimal comparison, no float path (edge cases 8/12/15); (d) mirrors the Section 1 referral tile count.
10. **Chase list:** 14 rows ordered 906,752.23 → 675,000 → 630,813.93 → 426,953.13 → 401,965.08 → … → 77,232.14; equal-balance synthetic pair exercises the tiebreaker (updated when Open Q 1 resolves); D021 chip "ok" at idle 0, "⚠ chase" at frozen clock 2026-10-15 (idle 3 ≥ ChaseIdleMonths 3); never-paid rows read "no payment yet" even at idle ≥ 3 (precedence); 31 open balances → warning banner; Next Action write-through asserted against M4's row + audit entry.
11. **Year-filter scope (integration):** switch 2026 → 2025 → snapshot equality on sections 1/3/4/5/7/8 payloads; sections 2/6 restate (2025 collected = 0, target "—").
12. **Performance/freshness:** 1,000 deals + 1,000 payments synthetic workspace renders < 1.5 s P95; payment insert visible ≤ 60 s; year switch < 500 ms.
