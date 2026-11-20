# M3 — GCI Calculator & Goal Planning — Milestone Document

Baseline: solo full-stack dev, ideal dev-days (focused days, no meetings), stack per Master PRD recommendations. M3 is pure computation + one screen — no financial writes, no heavy data model — so it is one of the lighter modules; the risk is arithmetic drift, which the fixture suite pins down.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10; M2/M3 can run parallel to M6; M7 depends on M1, M4, M5.** M3 depends on **M2 (planning basis: AllTimeYield, AllTimePrice)** and **M0**; it also reads M1 deals for the pace section, and **it feeds M6's target line**. Because M6 ships before M3 in the overall order, M6's Section-2 annual target launches on its manual override alone; when **M3.2** lands, the TargetTable feed completes M6's `ROUNDUP(NIT ÷ (1−opex−cos), −4)` formula with the override preserved on top. Within M3: engine first (M3.1) — it is the module's entire risk surface; UI after persistence.

---

## Milestone M3.1 — Planning engine library (2–3 days)

**Objective:** the complete pure-function planning engine (Rules P1–P13) with exhaustive fixture tests — no UI, no persistence.

**Deliverables checklist**
- [ ] `computePlan(target, rates, basis, ytdAggregates) → outputs` pure library, decimal arithmetic
- [ ] Round-up helper `roundUpTo10k(x) = ceil(x/10,000) × 10,000` with boundary tests
- [ ] Full 2026 fixture suite (PRD §3.3 table) + funnel chains at full precision
- [ ] Validation errors as typed results (net_income_pct ≤ 0; rate ∉ (0,1]; empty basis) — never exceptions from division
- [ ] Identity test: P11 both ways (`price × deals` vs `goal ÷ yield`) equal to the centavo
- [ ] Anti-regression test proving chained display-rounding fails (44.33 ÷ 0.25 must NOT be accepted as 177.32-via-177.33 drift; see test plan 4)

**Tasks (≤1 day each):** decimal utils + round-up helper + P1–P4 with tests · P5–P8 + P11–P13 with tests · P9–P10 funnels + full-precision chaining tests + validation results.

**Definition of done:** 11,500,000 ÷ 0.68 = 16,911,764.71 → working goal 16,920,000; fees/deal 381,676.31; deals 44.33; seller funnel 177.32 / 253.32 / 844.40 / 4,221.98; buyer funnel 147.77 / 211.10 / 2,110.99; total sales 415,355,587.83 ±0.01 — all asserted in CI; 100% branch coverage on the engine.

**Demo script:** feed the 2026 fixture to a REPL/endpoint; read back working goal **₱16,920,000** and **44.33** deals; feed opex 0.60 + cos 0.40 and read back the validation error, not a crash.

**Dependencies:** none beyond M0's decimal conventions (M2's live values are inputs, stubbed as fixtures here). Blocks M3.2–M3.4.

## Milestone M3.2 — Targets & rates persistence + M6 feed (2–3 days)

**Objective:** PlanYearTarget and FunnelRates as validated, audited records; the TargetTable feed M6 consumes.

**Deliverables checklist**
- [ ] PlanYearTarget schema + CRUD APIs (unique per year; null-means-default semantics; validation per PRD §3.1)
- [ ] FunnelRates schema + update API, seeded defaults (25/70/30/20; 30/70/10) on workspace creation
- [ ] Audit entries (old→new) on every mutation; auth + tenant-isolation enforcement with policy tests (no role middleware — money-restating edits go through friction-gate confirmations per M0)
- [ ] TargetTable feed API: per year → NIT, opex_eff, cos_eff, derived working_gci_goal (Rule P3+P4 via the M3.1 library); cache + invalidation on write
- [ ] M6 integration: dashboard Section-2 target switches to feed-else-manual-override (M6's override preserved)
- [ ] Importer leg: TargetTable rows + funnel rates from a v30.x workbook (blank/0 → null; runs inside M1's importer flow)

**Tasks:** schemas + null-semantics validation + tests · CRUD/update APIs + audit + policy tests · feed API + M6 wiring + importer leg.

**Definition of done:** acceptance criteria 5, 9, 11, 12 of the PRD pass; M6's 2026 target reads ₱16,920,000 from the feed with no M6-side reimplementation of the formula; workbook import reproduces the 2026 row and rates.

**Demo script:** create the 2026 row via API → GET the feed → ₱16,920,000; set M6's manual override → dashboard shows the override; clear it → back to the feed value; attempt a rate edit from a second test account (different workspace) → 403/404, no change.

**Dependencies:** M3.1; M0.2–M0.4 (audit, account foundation); M6.2 (dashboard target cell) for the wiring step; M1.4 for the importer leg.

## Milestone M3.3 — Planning screen (3–5 days)

**Objective:** the full one-screen planning experience: economic model, goal rows, editable funnels with instant recalc, targets-table editor, empty/validation states.

**Deliverables checklist**
- [ ] Year selector (defaults to current year; offers row creation for missing years)
- [ ] Economic model card: NIT/opex/cos with default placeholders, net income %, raw target small + working goal large with round-up badge and formula tooltips
- [ ] Assumptions row: price/yield with source labels ("all-time realized" vs "override"), edit-in-place override + revert chip
- [ ] Goals table (GCI / Net Income / Listings SOLD / Buyer ATP × Yearly / Monthly / Weekly) with the 48-week copy
- [ ] Two funnel ladders with inline-editable rates; instant recompute (< 100 ms perceived) via the shared engine — never UI math
- [ ] Targets-table editor (all years), add-a-year; validation and empty states per PRD §6; CSV/XLSX export; mobile pass (360 px)

**Tasks:** screen skeleton + year selector + economic card · assumptions row + goals table · funnel ladders + rate editing + recalc wiring · targets editor + export · states + mobile pass.

**Definition of done:** acceptance criteria 1, 2, 4, 6, 7, 8 pass as UI tests; a non-technical user can go from blank year to a full plan in < 2 minutes (usability check with the product owner).

**Demo script:** select 2026 → see raw ₱16,911,764.71 auto-round UP to **₱16,920,000** with the badge; change Lead-to-Contact 20% → 25% and watch Seller Leads drop **4,221.98 → 3,377.58** live; open a fresh workspace and see the empty-basis state ask for a manual yield + price.

**Dependencies:** M3.1, M3.2; M2.1 (live AllTimeYield/AllTimePrice endpoint).

## Milestone M3.4 — Pace vs actual + hardening (2–3 days)

**Objective:** the pace card wired to live M1 data; performance, precision, and open-question flags locked down.

**Deliverables checklist**
- [ ] YTD aggregate query (Sale + Rental, ≠Referrer, booked_year = plan year) with covering index; Rule P12
- [ ] Pace card: Total Sales required / YTD actual / Balance with ahead-behind coloring; live refresh on deal changes (FR-M3-13)
- [ ] Rental-inclusion behavior implemented as the sheet does, isolated behind one engine flag pending OQ-1 (default: include) — flag documented, not user-visible
- [ ] Perf: P12 < 300 ms P95 on a 1,000-deal workspace; plan recompute < 10 ms server-side
- [ ] Full-workbook regression: imported v30.20 state reproduces every §3.3 fixture including pace (161,680,945 / 415,355,587.83 / 253,674,642.83)

**Tasks:** aggregate query + index + tests · pace card + live refresh · rental flag + perf fixtures + regression run.

**Definition of done:** acceptance criteria 3 and 10 pass; the 1,000-deal synthetic workspace meets both perf targets in CI.

**Demo script:** book a ₱10,000,000 resale in M1 → reload planning → YTD rises by exactly ₱10,000,000 and Balance falls by the same; toggle the rental flag in a test build → YTD moves by ₱2,400,000 (the workbook's four rentals), demonstrating what OQ-1 decides.

**Dependencies:** M3.1–M3.3; M1.2 (deal data + events).

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M3.1 Planning engine library | 2–3 |
| M3.2 Targets & rates + M6 feed | 2–3 |
| M3.3 Planning screen | 3–5 |
| M3.4 Pace vs actual + hardening | 2–3 |
| **Total** | **9–14** |

Assumptions: decimal library and shared engine conventions already established by M1; M2's planning-basis endpoint exists (M2.1); M6.2's target cell exists for the wiring step; no activity-actuals tracking (out of scope).

**Risk note:** the module's two failure modes are both arithmetic, both silent, and both caught by fixtures — (a) applying ÷1.12 to fees per deal (yields are already Net of VAT; tripwire in test 3), and (b) chaining display-rounded intermediates through the funnels (tripwire in test 4). Neither has a visible symptom in the UI beyond slightly-wrong numbers, so the fixture suite is the module's real acceptance gate. OQ-1 (rental volume in YTD) is isolated behind a single engine flag so the product-owner decision lands as a one-line change either way.

## Test plan

Every formula unit-tested with the workbook's verified numbers as fixtures (2026 live state unless noted):

1. **P1/P2:** null opex/cos → 0.22/0.10 → net income % 0.68; explicit 0.15/0.10 → 0.75; 0.60 + 0.40 → validation error (never divide); importer maps blank/0 → null.
2. **P3/P4:** 11,500,000 ÷ 0.68 = 16,911,764.71 (raw, 2 dp); round-up boundary: 16,910,000.00 → 16,910,000; 16,910,000.01 → 16,920,000; 16,911,764.71 → 16,920,000; exact-multiple invariance property test (`roundUpTo10k(10,000k) = 10,000k`).
3. **P5/P6:** defaults → 9,369,467.35 × 4.0736…% = 381,676.31, and identity 6,488,497.25 ÷ 17 = 381,676.31; override pair (7,000,000, 0.042) → 294,000.00; **÷1.12 tripwire:** assert result ≠ 340,782.42 (the wrong double-stripped figure).
4. **P7–P10 (full-precision chaining):** deals 16,920,000 ÷ 381,676.3088… = 44.3307578… → 44.33; seller chain 177.3230 / 253.3186 / 844.3954 / 4,221.9769 → displayed 177.32 / 253.32 / 844.40 / 4,221.98; buyer chain 147.7692 / 211.0988 / 2,110.9885 → 147.77 / 211.10 / 2,110.99; combined-divisor cross-checks (S4 = D ÷ 0.0105; B3 = D ÷ 0.021); **negative test:** chaining 2-dp display values (which yields 177.32-then-253.31 style drift, or the naive 177.33) must fail.
5. **P8:** GCI 16,920,000 → 1,410,000 / 352,500; NIT → 958,333.33 / 239,583.33; deals → 3.69 / 0.92; seller leads weekly 87.96; property test `weekly × 48 = yearly` (±0.01).
6. **P11 identity:** `goal ÷ yield` = `price_eff × buyer_atp` to the centavo at full precision = 415,355,587.83 ±0.01; display-rounded multiplication (9,369,467.35 × 44.33 = 415,348,487) must NOT match — proves full-precision requirement.
7. **P12/P13:** 2026 workbook deals → sales 159,280,945 + rentals 2,400,000 = 161,680,945.00; Referrer-representation deal excluded (synthetic); future plan year → 0; balance 253,674,642.83; rental flag off → 159,280,945 (OQ-1 evidence fixture).
8. **Validation/permissions:** rates ∉ (0,1] rejected; null-NIT year not plannable and absent from M6 feed; unauthenticated or cross-workspace mutations → 403/404; every mutation writes exactly one audit entry.
9. **M6 feed:** 2026 → 16,920,000; year with opex 0.25/cos 0.10 and NIT 13,000,000 → ROUNDUP(20,000,000, −4) = 20,000,000 (exact multiple unchanged); feed cache invalidates on target write.
10. **Full-workbook regression:** import v30.20 → every §3.3 fixture figure reproduces (2-dp / centavo); funnel rates and TargetTable rows round-trip.
