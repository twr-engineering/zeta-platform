# M8 — Collection Reports — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M8 is read-only aggregation over M1/M4/M5 data — no new entities, no writes — so it is one of the cheapest modules; the risk is correctness (two year semantics, snapshot vs live-join) and the < 1 s performance bar, not scope.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 parallel to M6; M7 depends on M1, M4, M5). M8 needs **M5 (payments — reports 1–4)** and **M4 (receivables — report 5)**; it is a **fast-follow after M7** and shares M7's aggregation habits (server-side GROUP BY over the same ledgers). M8.1 can start the moment M5.1's payment schema is stable — it does not need M5's UI. M9 may start in parallel; M10 consumes M8's help copy last.

---

## Milestone M8.1 — Aggregation service: payment-period reports 1, 3, 4 (2–3 days)

**Objective:** the server-side query layer + API for the three payment-grouped reports, fixture-exact, no UI.

**Deliverables checklist**
- [ ] Read-only report endpoints (GET-only): cash-per-year, monthly-cash-flow(Y), tax-per-month(Y)
- [ ] Derived contiguous year-range helper (rule 2: union of paid + booked years, zero rows for gaps)
- [ ] 12-month frame builder (rule 4: all months render, zeros where empty)
- [ ] Decimal-only aggregation path (no floats) + TOTAL rows from full-precision sums (rule 13)
- [ ] Archived-deal/payment exclusion (rule 12); dangling-reference loud failure (rule 15)
- [ ] Fixture test suite from the imported v30.20 workbook (see Test plan 1–3)

**Tasks (≤1 day each):** year-range + month-frame helpers with unit tests · report 1 query + endpoint + fixtures · reports 3+4 queries + shared year param + fixtures.

**Definition of done:** against the imported workbook, report 1 row 2026 = 1,908,192.86 / 1,909,085.71 / 5,357.14 / 4,464.29 / 8; report 3 July = 1,472,142.86 / 1,473,035.71; report 4 July = 5,357.14 / 4,464.29 / base 1,472,142.86 / 7 and January = 0 / 0 / 436,050 / 1 — all centavo-exact in CI.

**Demo script:** `GET /reports/tax-per-month?year=2026` → July row shows Output VAT ₱5,357.14 and EWT ₱4,464.29 — exactly the D021 incentive-release split from M5's fixtures.

**Dependencies:** M5.1 (payment schema + stored splits), M1.2 (deals), M0.1 (auth/workspace scoping).

## Milestone M8.2 — Vintage matrix + booking-year summary (reports 2, 5) (2–3 days)

**Objective:** the two remaining reports: the paid-year × booking-year matrix with value toggle, and the receivable-backed booking-year summary.

**Deliverables checklist**
- [ ] Matrix endpoint: cell = Σ payments where year_paid = row AND deal.booked_year = column; row totals; value param `net_of_vat` (default) | `net_cash`
- [ ] Live-join booking-year attribution (rule 6) — deal date edits re-vintage columns; money stays snapshot (rule 5)
- [ ] Report 5 endpoint over deals + receivables: Deals count, GCI = Σ net_gci, Collected = Σ receivable.collected, Outstanding = Σ receivable.balance
- [ ] Cross-check assertions (FR-M8-14) wired into the test suite
- [ ] Snapshot-vs-restate test: deal edit after payments changes report 5, leaves reports 1–4 byte-identical (edge case 13)

**Tasks:** matrix query + toggle + row totals · report 5 query + zero-row union range · cross-check + snapshot test pass.

**Definition of done:** matrix single cell (2026, 2026) = 1,908,192.86 (Net of VAT) / 1,909,085.71 (Net Cash); report 5 row 2026 = 21 / 6,688,497.25 / 1,908,192.86 / 4,855,304.39; synthetic 2027-payment case produces a 2027 row and no 2027 column (acceptance criterion 7).

**Demo script:** edit D021's list price via M1's confirmation flow → report 5's GCI and Outstanding move; re-request report 1 and the matrix → identical to before the edit.

**Dependencies:** M8.1 (range helpers, endpoint conventions), M4.1 (receivable balances), M1.2.

## Milestone M8.3 — Reports UI: five tabs, toggle, year selector, reading guide (2–3 days)

**Objective:** the Reports page the agent can actually run their month-end from — all five reports rendered, interactive controls, empty states, mobile.

**Deliverables checklist**
- [ ] Reports page with five deep-linkable tabs in sheet order
- [ ] Matrix rendering: sticky headers, shaded diagonal, muted above-diagonal cells with tooltip, `—` zero cells, horizontal scroll, verbatim reading-guide caption
- [ ] Value toggle (segmented, default Net of VAT) + shared year selector for tabs 3–4 (default current year)
- [ ] ₱ formatting, bold TOTAL rows, spelled-out months, reduced-emphasis zero rows
- [ ] Report 4 column captions ("Output VAT — to remit to BIR" / "EWT withheld — creditable, BIR Form 2307")
- [ ] Empty states with Payments Log cross-link; mobile pass (cards for 1/3/4/5; scrollable matrix)

**Tasks:** page shell + tabs + deep links · table components + matrix component · controls + captions + empty states + mobile.

**Definition of done:** acceptance criteria 1–8 and 12 pass as UI tests; a non-technical user finds "how much VAT do I remit for July?" in under 30 seconds (product-owner usability check).

**Demo script:** open Reports → Tax per Month, pick 2026 → read July: "remit ₱5,357.14 VAT; hold ₱4,464.29 in 2307 credits"; flip to the matrix and point at the single diagonal cell under the caption "Diagonal = collected in the year booked · below diagonal = pre-selling collection tail."

**Dependencies:** M8.1, M8.2; M0's input/read-only affordance conventions.

## Milestone M8.4 — Exports, print layout, performance & cache hardening (1–2 days)

**Objective:** the agent's monthly hand-off to their accountant works end-to-end; perf bar met; reports stay live with upstream edits.

**Deliverables checklist**
- [ ] CSV + XLSX export on every tab, filenames carrying year/toggle, TOTAL included, centavo-exact vs on-screen
- [ ] Report 4 print stylesheet: one portrait page — header (workspace · report · year · generated-on) + 12 months + TOTAL; Print button
- [ ] Event-driven cache invalidation from M1/M4/M5 events (FR-M8-13); staleness test
- [ ] Perf: each report < 1 s P95 at the 1,000-payment/1,000-deal synthetic fixture (indexes on paid_date, booked_year, deal_id)
- [ ] Export access-logging (lightweight)

**Tasks:** export endpoints ×5 + tests · print layout + header block · cache invalidation + perf run on the load fixture.

**Definition of done:** acceptance criteria 9–11 pass; the 1,000-payment fixture meets < 1 s P95 on all five endpoints; logging a payment in M5 changes report 1 on next load without manual refresh gymnastics.

**Demo script:** "It's month-end": open Tax per Month → Print → hand over one clean page; then Export XLSX → `tax-per-month-2026.xlsx` opens with identical figures.

**Dependencies:** M8.3; M5 events (payment.created/updated/deleted), M4/M1 events.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M8.1 Payment-period reports (1, 3, 4) | 2–3 |
| M8.2 Vintage matrix + booking-year summary (2, 5) | 2–3 |
| M8.3 Reports UI | 2–3 |
| M8.4 Exports, print, perf | 1–2 |
| **Total** | **7–11** |

Assumptions: M5 stores payment splits as snapshots per its schema (no recompute needed in M8); table/export components reusable from M6/M7; XLSX generation via the same library as other modules' exports; no charting.

## Test plan

Fixtures = the v30.20 workbook imported via M1.4 (21 deals booked 2026; 8 payments paid 2026), plus synthetic multi-year rows. Every formula unit-tested:

1. **Report 1 (verify the addition explicitly):** Net of VAT 2026 = 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86 = **1,908,192.86**; Net Cash = same series with 45,535.71 in place of 44,642.86 (only D021's payment differs, by its +892.85 EWT-vs-VAT gap) = **1,909,085.71**; Output VAT = **5,357.14**; EWT = **4,464.29**; count = **8**; TOTAL row = the single year row.
2. **Report 3:** Jan = 436,050/436,050 (D001 paid 2026-01-13); Jul = 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86 = **1,472,142.86** net of VAT, **1,473,035.71** net cash; ten zero months present; TOTAL = 1,908,192.86 / 1,909,085.71.
3. **Report 4:** Jul = VAT 5,357.14 / EWT 4,464.29 / base 1,472,142.86 / 7 (only taxable payment = D021's incentive release); Jan = 0 / 0 / 436,050 / 1 (untaxed base still reported); TOTAL column sums = report 1 row 2026.
4. **Report 2:** cell(2026, 2026) = 1,908,192.86 (Net of VAT) and 1,909,085.71 (Net Cash toggle); row total = cell; toggle default asserted = Net of VAT.
5. **Report 5:** 2026 → Deals 21; GCI = Σ NET GCI D001–D021 = **6,688,497.25**; Collected = 1,908,192.86; Outstanding = Σ open balances (126,500 + 117,500 + 675,000 + 317,414.70 + 180,000 + 322,724.20 + 426,953.13 + 155,803.57 + 206,696.43 + 906,752.23 + 401,965.08 + 77,232.14 + 630,813.93 + 309,948.98) = **4,855,304.39**; assert Collected + Outstanding = 6,763,497.25 = Σ Total Collectible (GCI + D004's 75,000 referral-out).
6. **Year-range rules:** synthetic deal booked 2024, no payments → report 1 rows 2024/2025 zero-filled contiguous; matrix gains 2024 column; report 5 row 2024 = 1 / net_gci / 0 / balance. Synthetic payment paid 2027 on D010 → matrix row 2027 without column 2027; report 5 gains a 2027 zero row (Deals 0).
7. **Snapshot vs live join (edge case 13):** edit D021 list price → report 5 restates; reports 1–4 responses byte-identical. Edit D021 booked_date to 2025 → matrix cell moves to column 2025 (live join), money unchanged.
8. **Type-blindness (edge case 7):** Incentive payment with taxable = No contributes 0 VAT / 0 EWT but full net to every report; blank vs "Commission" type indistinguishable in results.
9. **Cancelled deal (edge case 9, pending OQ4):** synthetic cancelled deal with partial collection → cash stays in reports 1–4; report 5 currently lumps its written-off balance into Outstanding (assert documented sheet behavior; test marked for revision when OQ4 resolves).
10. **Rounding/precision (edge case 15):** property test — no float types anywhere in the M8 pipeline; TOTAL = decimal sum of rows to the centavo on randomized payment sets.
11. **Cross-checks (FR-M8-14):** report 1 net-of-VAT column ≡ matrix row totals ≡ report 3 TOTAL per year ≡ report 4 base TOTAL per year; report 5 Collected TOTAL ≡ report 1 all-years TOTAL.
12. **Exports/print:** CSV/XLSX byte-compare against endpoint rows incl. TOTAL; print snapshot test = one page, header block present.
13. **Performance:** 1,000-payment / 1,000-deal fixture — five endpoints < 1 s P95; GET-only enforcement (write verbs → 405); the account owner can view/export everything (403 nowhere on GET).
