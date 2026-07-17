# M7 — Source Performance — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M7 is a **read-only aggregation module** — no schema of its own, no writes — so it is small, but its numbers must tie to M2/M4/M6 to the centavo, which is where the test effort goes.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10**; M2/M3 parallel M6; **M7 depends on M1, M4, and M5** since it aggregates NET GCI and collections by lead source. Concretely: M7.1 needs M1.2 (deals with lead_source_id + booked_year), M4.1 (receivable with booked_net_gci / collected / balance / status), and M5.1 (payments rolling up into receivable.collected). The M9 cross-link (M7.3) is a stub until M9 ships — do not block on it.

---

## Milestone M7.1 — Aggregation service + fixture parity (2–3 days)

**Objective:** the server-side Source Performance query — every column of PRD §3.3, year filter, TOTAL row — proven against the imported-workbook fixture table, no UI.

**Deliverables checklist**
- [ ] `sourcePerformance(workspaceId, year|"all") → rows[] + total` service (grouped query or projection; one function isolating the Collected NET definition per FR-M7-03)
- [ ] Booking-year scoping (deal.booked_year — never payment year)
- [ ] Source visibility rules: active-with-zero shown, archived-with-zero hidden, archived-with-deals as "(inactive)" (PRD §4 rules 2–3)
- [ ] TOTAL row with recomputed % Collected and Avg/deal (never averaged percentages)
- [ ] Full-precision decimal aggregation; rounding only at the serialization edge
- [ ] Fixture test: the complete PRD §9 criterion-1 table asserted to the centavo

**Tasks (≤1 day each):** aggregation query joining receivable → deal → lead source, grouped by source · year-filter param + distinct-years endpoint · visibility/labeling rules + TOTAL computation · fixture test suite (criterion-1 table + zero rows) · cross-module tie test (TOTAL Outstanding = M6 Balance Outstanding ₱4,855,304.39; TOTAL Booked = ₱6,688,497.25; TOTAL Collected = ₱1,908,192.86).

**Definition of done:** imported v30.20 workspace returns exactly the PRD §9 table — YouTube 7 / ₱2,455,541.29 / 36.71% / ₱2,058,398.44 outstanding; Referral Collected **₱875,000.00** (Σ collected, NOT the sheet's 800,000); TOTAL 21 / ₱6,688,497.25 / 28.53% — all centavo-exact in CI; Year=2026 equals Year=All on this fixture.

**Demo script:** hit the endpoint for the imported workspace → read back the JSON: YouTube row `booked: 2455541.29, pctOfGci: 0.3671, collected: 397142.86`; flip year to 2026 → identical payload.

**Dependencies:** M1.2, M4.1, M5.1 (data + rollups exist); M1.4 importer for the live fixture (synthetic seed of the same 21 deals is an acceptable stand-in until then).

## Milestone M7.2 — Report UI, year filter & export (2–3 days)

**Objective:** the Source Performance screen the agent reads in ten seconds: grouped columns, pinned TOTAL, year filter, inactive badges, export.

**Deliverables checklist**
- [ ] Table per PRD §6: column groups (Production / Cash / Fast vs slow), sticky header, TOTAL pinned, default sort Booked desc, sortable columns
- [ ] Year filter dropdown (All + distinct booked years, server-side apply)
- [ ] Inline states: "(inactive)" badge; % Collected > 100% pass-through tooltip; zero-₱ cells render ₱ 0.00
- [ ] CSV/XLSX export of the filtered view incl. TOTAL (FR-M7-08)
- [ ] Empty states (no deals / no sources) + caption line with the fast/slow framing
- [ ] Mobile card layout at 360 px
- [ ] Read-only enforcement test (no mutation routes; view-and-export only)

**Tasks:** table component + grouping/sort/pinning · year filter wiring · badges/tooltips/formatting (₱ #,##0.00, 0.00%) · export endpoint + parity test vs on-screen rows · empty states + mobile pass.

**Definition of done:** PRD acceptance criteria 1–3, 8–9 pass as UI/API tests; the signed-in agent can load and export (no write route exists); export ties to screen to the centavo.

**Demo script:** open Source Performance on the imported workspace → point at YouTube: "₱2.46M booked, 36.71% of everything — but only 16.17% collected, ₱2.1M of it developer pipeline"; point at Referral's 109.38% tooltip (D004's ₱75K referrer pass-through); switch Year to 2026 → same table; click Export → open the CSV, TOTAL row reads 6,688,497.25 / 1,908,192.86 / 4,855,304.39.

**Dependencies:** M7.1.

## Milestone M7.3 — Source-lifecycle & edge hardening, cross-links, perf (1–2 days)

**Objective:** the report survives everything Settings and the deal ledger can do to it — renames, archives, cancelled deals, empty years — at 1,000-deal scale, with M9 drill-through stubbed.

**Deliverables checklist**
- [ ] Edge case 18 integration tests: rename propagates (one row, no orphan/leftover), archive-with-deals → "(inactive)", archive-with-zero → hidden
- [ ] Edge case 19 integration test: booked-but-uncollected year renders 0%-collected rows, never empty
- [ ] Cancelled-with-partial-collections regression test (Booked +, Collected = actual cash, Outstanding +0; documents the sheet-derivation divergence)
- [ ] Invalidation wiring: M1 deal events, M4 status/override events, M5 payment events, M0 source rename/archive all refresh the aggregate (PRD §4 rule 12)
- [ ] Perf: 1,000 deals / 1,000 payments / 60 sources < 500 ms P95 (load-test fixture in CI)
- [ ] M9 cross-link stub on source rows (target route agreed with M9; hidden until M9 ships)

**Tasks:** lifecycle integration tests (EC18 ×3 + EC19) · cancelled/override regression pair (D004 + synthetic cancel) · event-driven invalidation + staleness test · perf fixture + tuning · cross-link stub.

**Definition of done:** PRD acceptance criteria 4–7, 10 pass; report reflects a new payment within one read after the M5 event; perf target met in CI.

**Demo script:** rename YouTube → "YouTube Organic", reload → same ₱2,455,541.29 under the new name; archive Lamudi → "Lamudi (inactive)" still shows ₱863,003.13; book a 2027 deal with no payments, filter 2027 → Booked ₱500,000 / 0.00% collected; log a payment against it → row updates on reload.

**Dependencies:** M7.1–M7.2; M0.3 (archive semantics); M9.1 for live cross-links (stub until then).

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M7.1 Aggregation service + fixtures | 2–3 |
| M7.2 Report UI, filter & export | 2–3 |
| M7.3 Lifecycle, edges, perf | 1–2 |
| **Total** | **5–8** |

Assumptions: M4's receivable already maintains `collected`/`balance` rollups (M7 aggregates, never recomputes payments); table/export components exist from M1/M6 to reuse; no charting; Open Question 1 resolved as spec default (a reversal is a one-line change in the isolated Collected function but would invalidate the D004 fixtures below).

## Test plan

Unit/integration tests, fixtures from the verified workbook extraction (all-time, 21 deals, 8 payments, D004 override; independently re-summed in decimal arithmetic):

1. **Per-source Booked NET GCI:** YouTube (D006, D011–D015, D021) = 352,500 + 155,803.57 + 206,696.43 + 906,752.23 + 401,965.08 + 77,232.14 + 354,591.84 = **2,455,541.29** ⚠ (brief circulated .30; full-precision sum 2,455,541.2946… and the 2-dp sum both give .29 — asserted at .29); Repeat Client (9 deals incl. 4 rentals) = **1,616,414.70**; Lamudi = 436,050 + 426,953.13 = **863,003.13**; Referral = **800,000**; Facebook Organic = **322,724.20**; Sphere / Personal Network = **630,813.93**.
2. **Grand total:** 6,688,497.25 = 6,488,497.25 sales + 200,000 rentals; deals = 21; % of NET GCI column sums to 100.00% (36.71 + 24.17 + 12.90 + 11.96 + 9.43 + 4.83).
3. **Averages:** YouTube 2,455,541.29 ÷ 7 = 350,791.61; Lamudi ÷ 2 = 431,501.56; TOTAL 6,688,497.25 ÷ 21 = 318,499.87 (recomputed, not averaged).
4. **Collected NET (Σ collected):** YouTube = 352,500 + 44,642.86 = 397,142.86 (D021's incentive release counts); Repeat Client = 200,000 (four rentals); Lamudi = 436,050; **Referral = 875,000 — the D004 divergence fixture: sheet's Booked − Outstanding gives 800,000 − 0 = 800,000; actual cash 875,000**; TOTAL = 1,908,192.86 (= Σ of all 8 payments' Net of VAT).
5. **Outstanding:** YouTube = **2,058,398.44** from full-precision aggregation (per-deal 2-dp values sum to .43 — precision regression test); D021 contributes 354,591.84 − 44,642.86 = 309,948.98; TOTAL = 4,855,304.39 = M6 Balance Outstanding.
6. **% Collected:** YouTube 16.17%; Referral 109.38% (>100% allowed, tooltip asserted); TOTAL 28.53% from totals; sheet-derived variant would give TOTAL 27.41% — asserted NOT to appear.
7. **Fast/slow split:** R+R booked TOTAL = 2,887,550 (2,687,550 resale + 200,000 rental); Dev booked TOTAL = 3,800,947.25; R+R Outstanding TOTAL = 1,099,000 (D002 + D003 + D005 + D007); per-source: YouTube 352,500 / 0 / 2,103,041.29; Repeat Client 1,299,000 / 1,099,000 / 317,414.70; row identity Booked = R+R GCI + Dev GCI holds for every row.
8. **Year filter:** 2026 = All on live data; synthetic 2027 deal (booked 500,000, no payments) → EC19 row (Booked 500,000 / Collected 0 / 0.00%); year dropdown lists only years with booked deals; a payment dated 2028 against a 2026 deal moves nothing between year buckets (booking-year proof).
9. **Lifecycle (EC18):** rename → single continuous row; archive-with-deals → "(inactive)" row, figures unchanged; archive-with-zero → hidden; unarchive restores; no configuration state can drop a deal's NET GCI from the report (sum-preservation property test across random rename/archive sequences).
10. **Cancelled:** synthetic cancel (booked 500,000, collected 100,000, balance 0) → Booked +500,000, Collected +100,000, Outstanding +0; Booked − Outstanding ≠ Collected on this row (divergence documented).
11. **Export parity:** CSV/XLSX equals endpoint payload to the centavo, TOTAL included, under both year filters.
12. **Perf:** 1,000 deals / 60 sources fixture < 500 ms P95; invalidation: report reflects a new M5 payment on next read.
