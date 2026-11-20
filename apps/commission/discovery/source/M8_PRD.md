# M8 — Collection Reports — PRD

**Product:** ZETA GCI + Collections · **Module:** M8 · **Source of truth:** v30.20 workbook — *Collection Reports* sheet · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every rule is stated with formulas in plain math and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M8 is the read-only reporting layer over cash: **five reports** answering "when did the money actually arrive, how much of it is tax, and how long do commissions take to collect?" It aggregates the payments ledger (M5) by period, cross-tabs collections against deal booking years (the *vintage matrix* — the single report that shows how long developer commissions take to arrive), and summarizes each booking year's earned-vs-collected position from the receivables ledger (M4). M8 writes nothing.

**Spreadsheet behavior it replaces.** The *Collection Reports* tab holds five formula blocks over the Payments Log and Collectibles: (1) cash collected per paid year, hard-coded rows 2020–2030; (2) a collection × booking-year matrix, rows = year paid, columns = booking year 2020–2030, with a value toggle cell (F5 = "Net of VAT" or "Net Cash") and a reading-guide caption; (3) monthly cash flow for a selected year (cell C5); (4) tax collected per month for the selected year — the block the bookkeeper prints monthly for the accountant; (5) a booking-year summary of deals / GCI / collected / outstanding.

**Key vocabulary (two different "years" — never confuse them):**
- **Year (paid)** — the calendar year the cash was collected: `year(payment.paid_date)`. Groups reports 1–4.
- **Deal Year / booking year** — the calendar year the *deal* was booked: `deal.booked_year` (M1 field 34). Groups report 5 and the matrix columns. A payment collected in 2028 on a deal booked in 2026 has Year (paid) = 2028 and Deal Year = 2026 — that gap is exactly what the vintage matrix visualizes (developers release pre-selling commissions over years, as unit buyers pay them).

**What improves in SaaS form.**
1. **Year ranges derive from data** — the sheet's hard 2020–2030 window disappears; reports extend automatically as history grows (rule 2).
2. Aggregation is server-side over indexed data (< 1 s at 1,000 payments) instead of 11 sheets of ARRAYFORMULA recalcs.
3. Every report exports to CSV/XLSX, and report 4 gets a **printable layout** — the agent's monthly hand-off to their accountant becomes a first-class job.
4. Reports 1–4 aggregate **stored payment snapshots** (M5's snapshot policy), so a later deal edit can never silently restate historical cash/tax reports — unlike the sheet, where payment splits are live formulas off the deal.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent, pulling their own period and tax reports. Their accountant/bookkeeper is an **export recipient, not a login**.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Read the vintage matrix to see how long each booking year's commissions take to arrive; compare paid-year totals across years; check any booking year's earned-vs-collected position (report 5); **pull report 4 every month** and hand it (printed or CSV) to their accountant. |
| **Their accountant/bookkeeper** *(export recipient — receives files, never logs in)* | Receives report 4 (CSV/XLSX or the printed layout) for the monthly filings: Output VAT to remit, EWT credits to reconcile against BIR Form 2307 certificates. Receives report 1/3 exports for cash-flow records. |
| *(v2, out of scope)* | Team roles and read-only logins (e.g., an external accountant's own account) — brokerage/team edition. |

## 3. Data model

M8 persists **no entities**. It defines five read-models (server-computed view shapes) over M1/M4/M5 data. All aggregation in exact decimal arithmetic (edge case 15); source money values are already centavo-exact per M1's persistence policy.

### 3.1 Source fields read

| Source (module) | Field | Used for |
|---|---|---|
| Payment (M5) | `paid_date` → `year_paid = year(paid_date)`, `month_paid = month(paid_date)` | Row/period grouping, reports 1–4 |
| Payment (M5) | `net_of_vat`, `vat`, `ewt`, `net_cash` | Money columns, reports 1–4 (stored snapshots — see rule 5) |
| Payment (M5) | `type` (Commission \| Incentive) | No filtering — both types count in every report (rule 7) |
| Payment (M5) | `deal_id` → join → `deal.booked_year` | Matrix column attribution (live join — rule 6) |
| Deal (M1) | `booked_year`, `net_gci` | Report 5: deal count, GCI column |
| Receivable (M4) | `collected` (Σ payment net_of_vat for the deal), `balance` (= total_collectible − collected), `status` | Report 5: Collected, Outstanding |

### 3.2 Report 1 — Cash Collected per Year (all-time)

One row per paid year `y` in the derived range (rule 2), plus TOTAL:

| Column | Derivation |
|---|---|
| Year | `y` |
| Net of VAT | `Σ p.net_of_vat where year(p.paid_date) = y` |
| Net Cash | `Σ p.net_cash where year(p.paid_date) = y` |
| Output VAT | `Σ p.vat where year(p.paid_date) = y` |
| EWT | `Σ p.ewt where year(p.paid_date) = y` |
| # Payments | `count(p) where year(p.paid_date) = y` |

*Worked ₱ (live fixture — 8 payments, all paid 2026):* row 2026 → Net of VAT = 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86 = **₱1,908,192.86**; Net Cash = **₱1,909,085.71** (only D021's incentive release differs: net cash 45,535.71 vs net of VAT 44,642.86, a +₱892.85 EWT-vs-VAT gap on that one payment); Output VAT = **₱5,357.14**; EWT = **₱4,464.29**; # = **8**. TOTAL row = same (single year).

### 3.3 Report 2 — Collection × Booking-Year Matrix (vintage; all-time)

Rows = paid years (rule 2 range), columns = booking years (rule 2 range), value toggle `V ∈ {Net of VAT (default), Net Cash}`:

```
cell(y_paid, y_booked) = Σ p.value(V)  where  year(p.paid_date) = y_paid
                                       AND    p.deal.booked_year = y_booked
row_total(y_paid)      = Σ over all y_booked columns  (= report 1's column for the same V)
```

**Reading guide (reproduce as the on-screen caption, verbatim):** *"Diagonal = collected in the year booked · below diagonal = pre-selling collection tail."*
For the developer: the *diagonal* is every cell where `y_paid = y_booked` (cash arrived the same year the deal closed — typical for resale/rental). *Below* the diagonal (rows ordered ascending, so `y_paid > y_booked`) is cash arriving in a **later** year than the booking — the developer pre-selling tail, where a 2026 booking keeps paying out in 2027/2028 as the unit buyer pays the developer. This is THE report showing how long developer commissions take to arrive. Cells with `y_paid < y_booked` (above the diagonal) mean a payment dated before its deal's booking date — render them as-is (rule 9).

*Worked ₱ (fixture):* all 8 payments are paid 2026 on deals booked 2026 → a single populated cell (2026, 2026) = **₱1,908,192.86** in the Net of VAT view, **₱1,909,085.71** in the Net Cash view; row total 2026 equals the cell.

### 3.4 Report 3 — Monthly Cash Flow (selected year)

For selected year `Y` (rule 3), one row per month `m = 1…12` — always all 12 months (rule 4) — plus TOTAL:

| Column | Derivation |
|---|---|
| Month | `m` (rendered "January"… "December") |
| Net of VAT | `Σ p.net_of_vat where year(p.paid_date) = Y and month(p.paid_date) = m` |
| Net Cash | `Σ p.net_cash where year = Y and month = m` |

*Worked ₱ (Y = 2026):* January = ₱436,050 / ₱436,050 (D001's payment, 2026-01-13); February–June = 0 / 0; July = **₱1,472,142.86 / ₱1,473,035.71** (the 7 July payments: 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86; net cash swaps the last term for 45,535.71); August–December = 0; TOTAL = ₱1,908,192.86 / ₱1,909,085.71.

### 3.5 Report 4 — Tax Collected per Month (selected year) — the agent's monthly pull for their accountant

Same grouping as report 3 (shares the selected-year filter), one row per month + TOTAL:

| Column | Derivation | Tax meaning (for the developer — no PH-tax background assumed) |
|---|---|---|
| Output VAT | `Σ p.vat` for the month | **What the broker owes the BIR** (tax bureau) out of that month's receipts. The 12% VAT arrives inside collected commissions but is never the broker's income — it must be remitted. |
| EWT withheld | `Σ p.ewt` for the month | **Tax already withheld by payors** before paying the broker. It is *creditable*: it offsets the broker's income tax at filing. The payor issues a **BIR Form 2307** certificate per withholding; the broker holds these as proof of the credit. This column is what the accountant reconciles the 2307 stack against. |
| Net of VAT (base) | `Σ p.net_of_vat` for the month | The income base the taxes were computed on. |
| # Payments | `count(p)` for the month | Volume sanity check against the OR/invoice file. |

This is a **cash-basis view** (grouped by date received). It supports the accountant's BIR work; it is not itself a tax return (see §10).

*Worked ₱ (Y = 2026):* **July** → Output VAT **₱5,357.14**, EWT **₱4,464.29**, base ₱1,472,142.86, # = 7 — D021's ₱50,000 incentive release is the only taxable payment (50,000 ÷ 1.12 = 44,642.86 net; VAT = 5,357.14; EWT = 44,642.86 × 10% = 4,464.29); the other six July payments are untaxed resale/rental collections. **January** → all zeros except the base: Output VAT 0, EWT 0, base ₱436,050 (D001, untaxed resale), # = 1. TOTAL = 5,357.14 / 4,464.29 / 1,908,192.86 / 8.

### 3.6 Report 5 — Booking-Year Summary (all-time)

One row per booking year `B` (rule 2 range), plus TOTAL. **Reads deals (M1) and receivables (M4), not payments:**

| Column | Derivation |
|---|---|
| Booking year | `B` |
| Deals | `count(deals where booked_year = B)` — every deal counts: sales, rentals, referrer deals, all statuses (no Yield-Summary-style segment exclusions) |
| GCI (Net of VAT) | `Σ deal.net_gci where booked_year = B` (equivalently Σ receivable.booked_net_gci — M4 mirrors it) |
| Collected | `Σ receivable.collected where deal.booked_year = B` |
| Outstanding | `Σ receivable.balance where deal.booked_year = B` |

Note: **Collected + Outstanding ≠ GCI in general.** Balance is computed off *Total Collectible* (Confirmed-Collectible override, or full cash-in where referral-outs are paid separately — M4 §Total Collectible), not off NET GCI. The fixture shows it: Collected + Outstanding = 1,908,192.86 + 4,855,304.39 = 6,763,497.25 = Σ Total Collectible, which exceeds GCI 6,688,497.25 by D004's ₱75,000 referral-out (full ₱875,000 comes in; ₱75,000 goes back out to the referrer).

*Worked ₱ (fixture, all 21 deals booked 2026):* row 2026 → Deals **21**; GCI **₱6,688,497.25** (Σ NET GCI of D001–D021); Collected **₱1,908,192.86**; Outstanding **₱4,855,304.39** = Σ balance over the 13 open deals: 126,500 + 117,500 + 675,000 + 317,414.70 + 180,000 + 322,724.20 + 426,953.13 + 155,803.57 + 206,696.43 + 906,752.23 + 401,965.08 + 77,232.14 + 630,813.93 + 309,948.98 (D021: 354,591.84 − 44,642.86) — the 8 closed deals carry zero balance.

## 4. Business rules & edge cases (numbered)

1. **Two year semantics, fixed per report.** Reports 1–4 group by **Year (paid)** = `year(paid_date)`. Report 5 and matrix *columns* group by **booking year** = `deal.booked_year`. Never mix.
2. **Derived, contiguous year ranges** (improvement over the sheet's hard 2020–2030 window). Report 1 rows and report 5 rows: contiguous from `min(all year_paid ∪ all booked_year)` to `max(all year_paid ∪ all booked_year)` — a year with bookings but no cash (or vice versa) appears as a **zero row, not a gap** (the gap is the story: booked-2024 / collected-nothing-until-2026 must be visible). Matrix: rows span the paid-year range, columns span the booking-year range, both contiguous. Ranges auto-extend as data grows; no configuration.
3. **Selected-year filter** (one control) drives reports 3 and 4 together; default = current year; selectable range = rule-2 range. Changing it never affects reports 1, 2, 5 (all-time).
4. **Months render fully:** reports 3–4 always show all 12 rows of the selected year, zeros where no payments — including February in leap and non-leap years alike (grouping is by calendar month; day-count is irrelevant). No gaps, no skipped months.
5. **Payment splits are snapshots** (M5 snapshot policy; M1 §4 rule 3: "payment history stays intact"). Editing a deal's financial inputs after payments exist (edge case 13) restates report 5's GCI/Outstanding (booked figures recompute; balance restates via M4) but **never changes reports 1–4** — the stored `net_of_vat/vat/ewt/net_cash` on each payment are statements of what actually happened at collection time.
6. **Booking-year attribution is a live join, not a snapshot.** The matrix column and report 5 grouping read the deal's *current* `booked_year`. Correcting a mis-entered booked date therefore properly re-vintages the deal's payments into the right column. (Sheet behavior: Deal Year is a live lookup — identical.) Only the *money splits* are frozen (rule 5).
7. **Payment Type is invisible to M8.** Commission and Incentive payments aggregate identically in all five reports; an Incentive payment on a deal with `Incentive Taxable? = No` simply arrives with `vat = ewt = 0` already stored (edge case 7) and flows through the sums.
8. **A paid year with no bookings, and vice versa** — fully supported: a 2028 payment against a 2026 deal creates/extends matrix row 2028 without requiring any 2028 booking; the 2028 column only exists if some deal is booked in 2028.
9. **Above-diagonal cells** (`y_paid < y_booked`, payment dated before its deal's booking date) are rendered as-is — M8 never blocks or hides data. Flagging the anomaly is Data Health territory (M6 candidate, out of M8 scope).
10. **Cancelled deals** (edge case 9): their real cash stays in reports 1–4 (it was collected); report 5 includes them in Deals/GCI/Collected, and their written-off balance is **currently lumped into Outstanding** = Σ balance, matching the sheet — flagged for confirmation as Open Question 4 (a separate "Written off" column may be wanted).
11. **Overpaid/short-closed deals** (edge case 8): report 5's Outstanding sums signed balances as-is; a Closed deal's variance lives in M4/M6, not here.
12. **Archived (soft-deleted) deals and their payments are excluded** from all five reports — consistent with M1's cascade-archive contract.
13. **Rounding** (edge case 15): all sums in exact decimal arithmetic over centavo-exact stored values — never binary floats; totals are computed from the full-precision decimal sum, then displayed at 2 dp; a TOTAL row must equal the decimal sum of its rows to the centavo (no per-cell re-rounding drift).
14. **Empty workspace:** every report renders its frame with an explanatory empty state (no crash, no blank page) — "No payments logged yet. Reports fill in as you log collections in the Payments Log."
15. **Referential integrity is upstream:** M5 already rejects payments against nonexistent deals (edge case 10), so every payment reaching M8 has a resolvable `booked_year`. M8 must still fail loudly (500 + alert), never silently drop rows, if a dangling reference ever appears.

## 5. Functional requirements

- **FR-M8-01** A Reports area presents the five reports (tabs or stacked sections) in sheet order: Cash per Year · Vintage Matrix · Monthly Cash Flow · Tax per Month · Booking-Year Summary.
- **FR-M8-02** Report 1 computes per §3.2 with a TOTAL row; year rows per rule 2.
- **FR-M8-03** Report 2 computes per §3.3: cell/row-total formulas, contiguous row+column ranges, and the verbatim reading-guide caption.
- **FR-M8-04** Report 2 offers the value toggle `Net of VAT | Net Cash`, **default Net of VAT**; toggling re-renders without page reload; the active value is labeled on screen and in exports.
- **FR-M8-05** Reports 3 and 4 share one selected-year control (default current year); both re-query on change; all 12 months always render (rule 4).
- **FR-M8-06** Report 3 computes per §3.4 with a TOTAL row.
- **FR-M8-07** Report 4 computes per §3.5 with a TOTAL row, and its column headers carry the plain-language tax captions ("Output VAT — to remit to BIR", "EWT withheld — creditable, BIR Form 2307").
- **FR-M8-08** Report 5 computes per §3.6 with a TOTAL row.
- **FR-M8-09** All aggregation runs **server-side** (SQL/aggregation pipeline); the client receives finished rows only — the UI never computes money (Master PRD cross-cutting rule).
- **FR-M8-10** Every report exports CSV and XLSX of exactly the on-screen rows (including TOTAL, matrix row totals, and the active toggle/year in the filename, e.g., `tax-per-month-2026.xlsx`).
- **FR-M8-11** Report 4 (and, second priority, all reports) has a **print-ready layout**: one page portrait at 12 months, workspace name + report title + selected year + generated-on date in the header — the artifact the agent physically hands (or emails) to their accountant.
- **FR-M8-12** The account owner can view and export all five reports; no M8 route mutates data (enforced: M8 endpoints are GET-only).
- **FR-M8-13** Live consistency: a payment logged/edited/deleted in M5, a receivable status/override change in M4, or a deal edit in M1 is reflected on next report load (≤ 1 refresh; cache invalidation via the M1/M4/M5 events).
- **FR-M8-14** Cross-checks hold by construction and are asserted in tests: report 1's Net-of-VAT column = matrix row totals (Net of VAT view) = report 3's TOTAL per year = report 4's base TOTAL per year; report 5's Collected TOTAL = report 1's all-years Net-of-VAT TOTAL.
- **FR-M8-15** Empty states per rule 14.

## 6. UI/UX requirements

- **Layout:** a single Reports page with five tabbed sections (order per FR-M8-01); the active tab is deep-linkable (`/reports/tax-per-month?year=2026`).
- **Matrix (report 2):** sticky first column (paid year) and header row (booking years); diagonal cells subtly shaded; below-diagonal cells default styling; above-diagonal cells (rule 9) rendered with a muted warning tint + tooltip "paid before booking year"; zero cells render `—` (dash) for scanability while exports carry `0.00`; the toggle as a segmented control top-right; reading-guide caption directly under the title, verbatim per §3.3. Beyond ~10 columns the matrix scrolls horizontally with the sticky year column (cap question → OQ3).
- **Toggle & year selector:** the sheet's blue-input affordance (M0 convention) marks the two interactive controls (value toggle, selected year); everything else is visibly read-only — M8 is the one module that is almost entirely "black cells."
- **Tables:** ₱ `#,##0.00` right-aligned money, TOTAL rows bold with a top rule, month names spelled out, zero rows rendered (rules 2/4) at reduced emphasis.
- **Report 4 print view:** print stylesheet (or PDF export) fitting 12 months + TOTAL on one portrait page with header block per FR-M8-11; a visible "Print" button on that tab.
- **Export buttons** on every tab (CSV · XLSX), disabled with tooltip when the report is empty.
- **Empty states** per rule 14, with a cross-link "Go to Payments Log".
- **Mobile (360 px):** reports 1/3/4/5 collapse to stacked cards per row; the matrix stays a horizontally scrollable table (a card layout would destroy the diagonal semantics); print/export remain available.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M5 Payments | `paid_date` (→ year_paid, month_paid), `net_of_vat`, `vat`, `ewt`, `net_cash`, `deal_id`; stored snapshots per rule 5 |
| reads ← | M1 Deals | `booked_year` (via payment join for matrix columns; direct for report 5 grouping), `net_gci`, `archived_at` (exclusion) |
| reads ← | M4 Receivables | `collected`, `balance` (report 5); `booked_net_gci` (tie-out) |
| reads ← | M0 | auth/session, workspace scoping, ₱ formatting locale |
| subscribes ← | M1/M4/M5 events | `deal.updated/archived`, `receivable.updated`, `payment.created/updated/deleted` → report-cache invalidation (FR-M8-13) |
| writes → | — | **nothing** (GET-only module) |
| consumed by | M10 | contextual help copy: the reading guide, the two-year-semantics explainer, the report-4 tax captions |

## 8. Non-functional requirements

- **Performance:** each of the five reports returns in **< 1 s** at 1,000 payments / 1,000 deals (P95, server time); the matrix at 10 paid-years × 10 booking-years likewise. Aggregate in the database (GROUP BY year/month/booked_year over indexed columns), never by loading the ledger into app memory.
- **Server-side aggregation only** (FR-M8-09); the pure decimal discipline of M1's engine extends to report sums — no binary floats anywhere in the pipeline (edge case 15).
- **Consistency:** report figures must be internally cross-consistent per FR-M8-14 on every render (same snapshot read — one transaction or consistent read per request).
- **Permissions:** M0 auth enforced on every endpoint; tenant isolation absolute (all queries workspace-scoped); the account owner reads and exports everything (matches cross-cutting export rule); no mutation surface, so nothing to friction-gate and nothing to audit beyond the bullet below.
- **Auditability:** nothing to audit-write (read-only); exports MAY be access-logged (workspace, user, report, timestamp) — lightweight, not part of the financial audit trail.
- **Caching:** permissible per workspace with event-based invalidation (FR-M8-13); a stale-by-more-than-one-write report is a bug, not a tuning choice.

## 9. Acceptance criteria (Given/When/Then)

All fixtures = the v30.20 workbook imported via M1's importer: 21 deals (D001–D021, all booked 2026), 8 payments (all paid 2026: one January, seven July).

1. **Given** the imported fixture **When** report 1 renders **Then** it shows exactly one non-zero row, 2026: Net of VAT **₱1,908,192.86** (= 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86), Net Cash **₱1,909,085.71**, Output VAT **₱5,357.14**, EWT **₱4,464.29**, # Payments **8**; TOTAL row identical.
2. **Given** the fixture **When** report 2 renders in the default Net of VAT view **Then** the single populated cell is (paid 2026, booked 2026) = **₱1,908,192.86**, the 2026 row total equals it, and the caption reads *"Diagonal = collected in the year booked · below diagonal = pre-selling collection tail."*
3. **Given** report 2 **When** the toggle is switched to Net Cash **Then** the cell reads **₱1,909,085.71** and the export filename/label reflects Net Cash; **When** switched back **Then** Net of VAT is the default on next visit.
4. **Given** selected year 2026 **When** report 3 renders **Then** January = ₱436,050 / ₱436,050, February–June and August–December = 0.00 rows (present, not missing), July = **₱1,472,142.86 / ₱1,473,035.71**, TOTAL = ₱1,908,192.86 / ₱1,909,085.71.
5. **Given** selected year 2026 **When** report 4 renders **Then** July shows Output VAT **₱5,357.14**, EWT **₱4,464.29**, base ₱1,472,142.86, # = 7 (the D021 incentive release is the only taxable payment); January shows 0 / 0 / ₱436,050 / 1; all other months all-zero; TOTAL = 5,357.14 / 4,464.29 / 1,908,192.86 / 8.
6. **Given** the fixture **When** report 5 renders **Then** row 2026 shows Deals **21**, GCI **₱6,688,497.25**, Collected **₱1,908,192.86**, Outstanding **₱4,855,304.39**; and Collected + Outstanding = ₱6,763,497.25 = Σ Total Collectible (₱75,000 above GCI, from D004's referral-out — asserting the rule-of-§3.6 note, not equality with GCI).
7. **Given** a new payment of ₱100,000 logged in 2027 against D010 (booked 2026) and no deal booked in 2027 **When** the matrix renders **Then** a 2027 *row* exists with cell (2027, 2026) = ₱100,000 and no 2027 *column* appears (columns span booking years only, rule 8); report 1 gains a 2027 row; and report 5 shows a 2027 row with Deals 0 and all-zero money (rule 2 ranges are the union of paid and booked years — zero row, not gap).
8. **Given** a deal booked in 2024 with zero payments (added to the fixture) **When** reports render **Then** report 1 shows zero rows for 2024 and 2025 (contiguous range, rule 2), the matrix gains a 2024 column, and report 5 shows 2024 with Deals 1, GCI = its net_gci, Collected 0, Outstanding = its balance.
9. **Given** D021's list price is edited (Owner, confirmation flow, edge case 13) so its NET GCI changes **When** reports reload **Then** report 5's GCI and Outstanding restate; reports 1–4 are **byte-identical** to before (payment snapshots untouched).
10. **Given** any report **When** exported **Then** the CSV/XLSX matches on-screen rows including TOTAL to the centavo; **Given** report 4 **When** printed **Then** one portrait page contains header (workspace, report, year, generated-on) + 12 months + TOTAL.
11. **Given** a workspace with 1,000 payments across 6 paid years and 8 booking years **When** each report is requested **Then** P95 server time < 1 s and FR-M8-14's cross-checks hold exactly.
12. **Given** the account owner's session **When** they open Reports **Then** all five reports and exports work; **When** any write is attempted against an M8 route **Then** 405 (GET-only).

## 10. Out of scope / future

- **No tax filing:** M8 reports cash-basis collections; it does not produce BIR VAT returns, 2307 filings, or e-filing artifacts, and does not model the accrual/invoice timing of VAT liability — the accountant owns the actual returns (report 4 is their input, not their output).
- No forecasting of future collections (product philosophy: reactive logging, no buyer-payment-cycle forecasting).
- No per-agent breakdowns (a v2 team-edition concern) and no per-developer breakdowns inside M8 (per-developer receivables live in M6; per-source in M7).
- No fiscal-year (non-calendar) grouping in v1 (OQ2); no custom date-range reports; no scheduled/emailed report delivery.
- No charts in v1 — tables only, matching the sheet; a matrix heatmap is a natural v2.
- No OR/invoice-level grouping in report 4 (OQ1).

## 11. Open questions

1. **Report 4 grouping for BIR support:** should report 4 optionally break out rows per OR/invoice note (M5's `or_invoice_note`) so the accountant can tie each month's VAT to specific invoices, rather than month-level totals only? Sheet: no — month totals only. Needs product-owner call; affects report-4 query shape and print layout.
2. **Fiscal-year support:** all grouping is calendar-year (sheet behavior). Any target customer on a non-calendar fiscal year would need a workspace-level fiscal-year-start setting rippling through every M8 grouping. Sheet: calendar only. Recommend: confirm calendar-only for v1 and record as a known limitation.
3. **Matrix year cap:** with >10 years of history the matrix grows wide. Cap displayed years (e.g., last 10, with "show all") or rely on horizontal scroll alone? Sheet: hard 2020–2030 window (11 columns) made this moot. Recommend scroll + no cap until real data forces it; confirm.
4. **Report 5 Outstanding vs written-off balances:** Cancelled deals' balances are written off (M4), and Dashboard aging excludes them — but the sheet's report 5 Outstanding = Σ balance column, which **lumps written-off amounts into Outstanding**. Should the SaaS split a separate "Written off" column (Outstanding = open balances only) or reproduce the sheet? Recommend the split (it matches M6's position block, which reports written-off separately); needs confirmation because it changes the sheet's numbers on any workspace with cancelled deals.
