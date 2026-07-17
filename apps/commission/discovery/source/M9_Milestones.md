# M9 — Search Console — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M9 is a pure read layer — no entities, no money math, no events. Small module; the risk is in query performance (the contains filter) and in faithfully reproducing the sheet's filter/sort semantics, not in volume of code.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 parallel to M6; M7 depends on M1, M4, and M5). **M9 sits late by design:** it needs all three source modules' schemas and read projections (M1 deals, M4 receivables, M5 payments) to exist before it can query them. Because it is read-only and side-effect-free, M9 can safely overlap M8's tail or slot anywhere after M5 without destabilizing anything — it is a good "cool-down" module after the dashboard/report work.

---

## Milestone M9.1 — Search read layer & query API (2–3 days)

**Objective:** the complete server-side search: normalized text, indexes, the filter matrix, the three sort presets, pagination — proven against workbook fixtures before any UI exists.

**Deliverables checklist**
- [ ] `search_blob` normalized text (trim, collapse whitespace, lowercase, unaccent) as an indexed generated value on deals; payments/collectibles search via the referenced deal (PRD §3.3)
- [ ] Indexes: (workspace, booked_year), (workspace, payment_date), (workspace, deal_code), trigram/full-text on `search_blob`
- [ ] Query endpoint per source with the filter-applicability matrix (year asymmetry booked-vs-paid; status + only-with-balance Collectibles-only; AND combination)
- [ ] Sort presets per PRD Rule 7 incl. Collectibles always-balance-desc default + deterministic tie-breaks; per-column sort params
- [ ] Pagination + total count; 405 on any write verb (read-only route layer)
- [ ] Fixture test suite (workbook data imported via M1.4) covering PRD acceptance criteria 1–9

**Tasks (≤1 day each):** search_blob + indexes + migration · query builder (filters + sorts + pagination) with matrix tests · fixture suite + empty-state/unknown-ID contracts.

**Definition of done:** against the imported v30.20 workbook — text `Ventura` → exactly D002+D003 (trailing-space row included); Collectibles Open + only-with-balance → 14 rows, D013 first (₱906,752.23), D021 balance ₱309,948.98; Payments year 2026 → 8 rows newest-first; Deals amount sort → D013 first (₱906,752.23); `D999` → 200 + zero rows. All centavo-exact in CI.

**Demo script:** curl the API: `source=collectibles&status=Open&only_with_balance=true` → 14 rows; add `text=ventura` → 2 rows; switch `source=payments` → empty payload with the empty-state contract.

**Dependencies:** M1.2 (deals + codes), M4.1 (receivable balances/status), M5.1 (payment splits), M1.4 (importer, for fixture load). Blocks nothing downstream except M10's help copy for the Search screen.

## Milestone M9.2 — Search Console UI (2–3 days)

**Objective:** the full read-only screen: source tabs, filter bar with per-source controls, results tables, links to detail views, URL state, keyboard navigation.

**Deliverables checklist**
- [ ] Screen with source tabs; filter bar (Year labeled "booked"/"paid" per source, Deal ID type-ahead picker, Status chips + balance toggle on Collectibles only, debounced text box ≥ 250 ms, sort selector)
- [ ] Per-source result tables (PRD §3.2 columns), ₱ formats, status chips, sortable headers, sticky header, pagination, total count
- [ ] Row click-through to M1/M4/M5 detail views; "read-only — nothing here changes your data" caption
- [ ] Verbatim empty state "No matching records — adjust your filters above." + Clear-filters action
- [ ] Shareable URL state (serialize/restore source, filters, sort, page)
- [ ] Keyboard navigation (`/` focus, arrows, Enter) and mobile card layouts at 360 px

**Tasks:** screen skeleton + tabs + filter bar with conditional controls · results tables + links + empty state · URL state + keyboard nav + mobile pass.

**Definition of done:** PRD acceptance criteria 1–10 and 12 pass as UI tests; switching source drops inapplicable filters (status/balance) and keeps applicable ones; no edit affordance exists anywhere on the screen.

**Demo script:** open Search → Collectibles → Status Open + Only with balance → 14 rows, D013 on top; type "ventura" → 2 rows; click the D002 row → receivable detail opens; copy the URL into a second browser session → identical results; press `/`, type gibberish → "No matching records — adjust your filters above."

**Dependencies:** M9.1; M1.3 / M4 / M5 detail views for the click-through targets.

## Milestone M9.3 — Export & performance hardening (1–2 days)

**Objective:** filtered-result export and the < 300 ms P95 target proven on a 1,000-deal/1,000-payment workspace.

**Deliverables checklist**
- [ ] CSV/XLSX export of the filtered, sorted result set (all pages, on-screen columns/order), streamed; disabled at zero rows; cap behavior per Open Question 4 decision
- [ ] Load-test fixture (1,000 synthetic deals + 1,000 payments) in CI; P95 < 300 ms for every filter combination in the PRD criteria; projection staleness < 5 s verified
- [ ] Query-plan review: contains filter demonstrably uses the trigram/full-text index (no seq scan at scale)

**Tasks:** export endpoint + file assembly + parity test vs on-screen rows · load fixtures + perf harness + index/plan tuning.

**Definition of done:** PRD acceptance criteria 11 and 13 pass; export of the open-balances search reproduces the 14 rows byte-for-byte with on-screen order; perf dashboard shows P95 < 300 ms on the seeded workspace.

**Demo script:** run the open-balances search on the 1,000-deal workspace → results render instantly; click Export → CSV downloads with exactly the filtered rows; show the timing panel (< 300 ms).

**Dependencies:** M9.1, M9.2.

## Milestone M9.4 — Unified "All" tab (optional; 1–2 days — pending Open Question 2)

**Objective:** one query across the three sources at once, rendered as three grouped sections — a marked SaaS improvement with no sheet counterpart. Build only if the product owner includes it in v1.

**Deliverables checklist**
- [ ] "All" tab running the three source queries in parallel with the shared applicable filters (year, deal ID, text); status/balance filters remain Collectibles-scoped within their section
- [ ] Grouped rendering (Deals / Collectibles / Payments sections, each with its own §3.2 columns, per-section counts and "open in tab" links); per-section empty states
- [ ] URL state + export (per-section files or a multi-sheet XLSX)

**Tasks:** parallel query orchestration + section rendering · export/URL extensions + tests.

**Definition of done:** "All" + text `Ventura` shows Deals(2) and Collectibles(2) sections and a Payments section with the verbatim empty message; combined P95 < 450 ms at fixture scale.

**Demo script:** type a client's name once on the All tab and see their deals, open balances, and payment history on one screen.

**Dependencies:** M9.1–M9.3; product-owner decision on Open Question 2.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M9.1 Search read layer & query API | 2–3 |
| M9.2 Search Console UI | 2–3 |
| M9.3 Export & performance hardening | 1–2 |
| M9.4 Unified "All" tab (optional) | 1–2 |
| **Total (core M9.1–M9.3)** | **5–8** |
| **Total incl. optional M9.4** | **6–10** |

Assumptions: source modules already expose read projections (no new money math); DB supports trigram or full-text indexing (e.g., PostgreSQL `pg_trgm`); export plumbing reuses the cross-cutting exporter built for earlier modules; workbook fixtures load via M1.4's importer.

## Test plan

M9 computes no money, so tests assert **selection, ordering, and projection** — never recomputed figures (values must equal the source modules' outputs verbatim). Fixtures = imported v30.20 workbook (21 deals, 8 payments, receivable states) + synthetics.

1. **Normalization:** `search_blob("Ventura Residences ")` = `search_blob(" ventura   residences")`; diacritics fold ("Peñafrancia" ↔ "penafrancia"); `%`/`_` in queries treated as literals.
2. **Text fixture:** Deals + `Ventura` → exactly {D002, D003}; Collectibles + `Ventura` → their two receivables; Payments + `Ventura` → 0 rows + verbatim empty state.
3. **Status/balance fixture:** Collectibles Open + only-with-balance → exactly 14 rows {D002, D003, D005, D007, D008–D016, D021}; D021 balance 309,948.98; D013 first at 906,752.23; toggling only-with-balance off with Status=Closed → the 7 closed receivables (D001, D004, D006, D017–D020).
4. **Year semantics:** Payments year 2026 → 8 rows; 2025 → 0. Synthetic booked-2025/paid-2026 deal → in Deals/Collectibles under 2025, in Payments under 2026 (the asymmetry test).
5. **Sorts:** Deals default = booked_date DESC (D021 2026-07-10 first); Date-oldest = ASC (D001 first); Amount = net_gci DESC (D013 906,752.23 first). Payments default newest first (D021 release 2026-07-09 first). Collectibles = balance DESC regardless of selector preset; tie-break determinism under equal keys.
6. **Filter matrix:** status/only_with_balance ignored server-side for Deals/Payments; all filters AND-combine (Collectibles + year 2026 + `abrown` + Open + balance → D010 and D021 receivables only).
7. **Contracts:** unknown `deal_code=D999` → 200 + 0 rows; empty-state message string-equal to `No matching records — adjust your filters above.`; 200-char text cap; write verbs on M9 routes → 405; cross-workspace query → no data.
8. **Export parity:** exported file rows/order/columns identical to the full filtered result set across pages.
9. **Performance:** seeded 1,000 deals + 1,000 payments — P95 < 300 ms per criterion query; query plan uses the trigram/full-text index for contains; projection staleness < 5 s after a new M5 payment.
