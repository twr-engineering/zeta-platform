# M9 — Search Console — PRD

**Product:** ZETA GCI + Collections · **Module:** M9 · **Source of truth:** v30.20 workbook — *Search Console* sheet · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every filter rule is stated in full with the exact semantics recovered from the sheet's FILTER/SORT formula; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M9 is the product's global **read-only lookup layer**: one screen that searches and filters across the three financial record sets — Deals (M1), Collectibles (M4), and Payments (M5) — without ever writing anything. Its job is "find that record fast": *which deals did I close for this client? which receivables still have a balance? when did CLI last release cash?*

**Spreadsheet behavior it replaces.** The *Search Console* sheet has six blue filter cells (What to search / Year / Deal ID / Status / Only with balance? / Text contains) plus a Sort selector, feeding a single `FILTER`+`SORT` formula that projects rows from the Deal Log, Collectibles, or Payments Log — one source at a time. Results are display-only; a helper column lists all deal IDs for the Deal ID dropdown. An empty result renders the message "No matching records — adjust your filters above."

**What improves in SaaS form** (each item below is an improvement over the sheet, not sheet behavior):

1. **Result rows link to the record** — click-through to the deal, receivable, or payment detail view. In the sheet, results are dead text.
2. **Debounced type-ahead** on the text filter and Deal ID picker instead of full-sheet recalculation per keystroke.
3. **Pagination** — the sheet renders every matching row; the SaaS pages results.
4. **Shareable URL state** — the full filter set serializes to the URL so a search can be bookmarked or reopened on another of the agent's devices (and, in v2, shared with teammates).
5. **Export of the filtered result set** (CSV/XLSX) — the cross-cutting export requirement applied to search results.
6. **Keyboard navigation** (arrow through rows, Enter to open).
7. **Per-column sorting** as a superset of the sheet's three sort options.
8. **Diacritic-insensitive text matching** (the sheet's `SEARCH` is case-insensitive only).
9. Optionally, a **unified "All" tab** searching the three sources at once (Open Question 2 — the sheet is strictly one source at a time).

M9 is a pure read layer: it owns no entities, computes no money, and emits no writes. As the sheet's own copy puts it — **"nothing here changes your data."**

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent, finding their own records fast.

| User | Jobs |
|---|---|
| **Agent (account owner)** | Answer ad-hoc questions instantly ("what's still open with Abrown?", "all YouTube-era Ventura deals"); jump from a phone call to the exact receivable; look up a deal before logging a payment; verify whether a release was already recorded; find past deals by client or property name; pull filtered lists for follow-up work and export filtered sets (e.g., for their accountant) with zero risk of edits. |
| *(v2, out of scope)* | Team lookups — Admin/ISA pre-entry checks, agents finding their own deals within a shared book, read-only auditor/accountant logins (the workbook's Abba/Reggie). |

## 3. Data model

M9 persists **nothing**. Its data model is (a) a query-state object, (b) three read-only projections over M1/M4/M5, and (c) a normalized search text used by the contains filter.

### 3.1 SearchQuery (URL/client state — not persisted server-side)

| Field | Type | Req | Default | Validation / Notes |
|---|---|---|---|---|
| source | enum | ✔ | `deals` | `deals` \| `collectibles` \| `payments` (sheet C4: Deals/Collectibles/Payments). `all` reserved for the unified tab (Open Question 2). |
| year | int \| `all` | | `all` | Any 4-digit year. **Semantics differ by source — see Rule 3.** |
| deal_code | string | | none | Exact match; chosen from a picker of existing deal codes (sheet C6 + helper column R). Free-typed values allowed at the API; a non-existent code yields the empty state, never an error. |
| status | enum | | none | `Open` \| `Closed` \| `Cancelled`. **Collectibles only** (sheet C7); ignored (and hidden in UI) for other sources. |
| only_with_balance | bool | | false | **Collectibles only** (sheet C8): keeps rows where `balance > 0`. |
| text | string(200) | | empty | Case-insensitive, diacritic-insensitive, whitespace-normalized substring match across client/counterparty AND property details (sheet C9). Cap 200 chars (Rule 12). |
| sort | enum | | `default` | `default` \| `date_oldest` \| `amount_desc` (sheet C10) — plus per-column sort params as the SaaS superset (Rule 7). |
| page / page_size | int | | 1 / 50 | page_size ≤ 200. Pagination is a SaaS improvement. |

### 3.2 Result projections (read-only; field-level source mapping)

All money rendered `₱ #,##0.00`; all fields computed/owned by the source module — M9 never re-derives money.

**Deals projection** (source: M1 Deal) — sheet default sort: date newest first; amount field: NET GCI.

| Column | Source field (module) | Type |
|---|---|---|
| Deal ID | deal_code (M1 §3.1 #1) | string |
| Date | booked_date (M1 #2) | date |
| Transaction | transaction_type (M1 #3) | enum |
| Deal Type | deal_type (M1 #4) | enum |
| Developer | developer_id → Developer.name (M1 #5 / M0) | string |
| Client | client_name (M1 #6) | string |
| Property | property_details (M1 #10) | string |
| NET GCI | net_gci (M1 #29, computed) | money |

**Payments projection** (source: M5 Payment) — sheet default sort: date newest first; amount field: Gross.

| Column | Source field (module) | Type |
|---|---|---|
| Date | payment date (M5) | date |
| Deal ID | deal_code (M5 → M1) | string |
| Client | client_name (via deal, M1 #6) | string |
| Property | property_details (via deal, M1 #10) | string |
| Gross | gross commission as billed (M5 input) | money |
| Net of VAT | net_of_vat (M5 computed) | money |
| Net Cash | net_cash (M5 computed) | money |

**Collectibles projection** (source: M4 Receivable) — sheet sort: balance high→low, always (this IS its default; the sheet ignores the sort selector for this source — Rule 7).

| Column | Source field (module) | Type |
|---|---|---|
| Deal ID | deal_code (M4 → M1) | string |
| Client | client_name (via deal) | string |
| Property | property_details (via deal) | string |
| Deal Type | deal_type (via deal) | enum |
| Total Collectible | total_collectible (M4: confirmed override else booked NET GCI) | money |
| Collected | collected_net (M4: Σ payment net-of-VAT) | money |
| Balance | balance (M4: total_collectible − collected) | money |
| Status | status (M4: Open/Closed/Cancelled) | enum |

### 3.3 Normalized search text

For each deal, maintain an indexed generated/derived value:

```
search_blob = lower(unaccent(collapse_whitespace(trim(client_name)) + " " +
                              collapse_whitespace(trim(property_details))))
```

- `trim` + `collapse_whitespace` because live workbook data contains trailing-space values (e.g., `"Ventura Residences "`) — a search for `Ventura Residences` must match them (Rule 4).
- Payments and Collectibles search on the **referenced deal's** client + property (they carry no client/property text of their own; the sheet derives these columns from the deal the same way).
- Backing index: DB full-text or trigram (e.g., PostgreSQL `pg_trgm` GIN) on `search_blob` — substring `ILIKE '%…%'` alone will not meet the NFR at scale (§8).

## 4. Business rules & edge cases (numbered)

1. **Strictly read-only.** M9 exposes no mutation endpoint of any kind. No M9 interaction may create, update, archive, or delete any record. The only "writes" are client-side URL state and (optionally) access logs. UI copy preserves the sheet's promise: "nothing here changes your data."
2. **One source at a time (sheet parity).** `source` selects exactly one of Deals / Collectibles / Payments. A unified "All" tab is a marked improvement pending Open Question 2 — if built, it runs the three queries and renders three grouped sections, never a merged column set.
3. **Year filter asymmetry (critical — from the sheet's formula).** For **Deals** and **Collectibles**, `year` compares against the deal's **booked year** (`booked_year`, M1 #34; Collectibles carries the same booking year). For **Payments**, `year` compares against the **payment date's year** (year PAID, M5). A deal booked 2025-12-15 with a release on 2026-01-10 appears under Year 2025 in Deals/Collectibles and under Year 2026 in Payments. Developers must not "helpfully" unify this: the asymmetry is the feature (booked-basis analysis vs cash-basis lookup).
4. **Text matching semantics.** `text` is a substring match, applied to the normalized `search_blob` after normalizing the query the same way (trim, collapse whitespace, lowercase, strip diacritics). Matches client/counterparty AND property details — nothing else (not notes, not developer names, not amounts; extending to notes is Open Question 3). Sheet parity: case-insensitive `SEARCH` over client + property. SaaS improvements: trailing/duplicate-whitespace tolerance and diacritic-insensitivity ("Peñafrancia" found by "penafrancia").
5. **All active filters combine with AND.** E.g., Collectibles + Year 2026 + Status Open + only_with_balance + text "abrown" returns rows satisfying every condition.
6. **Filter applicability matrix.** `status` and `only_with_balance` exist for Collectibles only; supplying them for other sources is ignored server-side and impossible in the UI (controls hidden). `only_with_balance = true` keeps rows with `balance > 0` (exactly the sheet rule — a Cancelled receivable's written-off remainder has balance recomputed per M4; whatever M4 reports as balance is what M9 filters on).
7. **Sort semantics (from the sheet's SORT formula):**

   | Source | Default | Date (oldest) | Amount (high→low) | Amount field |
   |---|---|---|---|---|
   | Deals | booked_date DESC | booked_date ASC | net_gci DESC | NET GCI |
   | Payments | payment_date DESC | payment_date ASC | gross DESC | Gross |
   | Collectibles | balance DESC — **always** (sheet ignores the sort selector for this source) | SaaS mapping: booking date ASC *(improvement — see Open Question 5)* | balance DESC | Balance |

   Ties break by `deal_code` ASC (payments: then payment id ASC) so ordering is deterministic. **Per-column header sorting** is a SaaS improvement layered on top; the three selector options above must remain available as presets because users know them from the sheet.
8. **Empty result is a state, not an error.** Any filter combination that eliminates all rows — including a Deal ID with no payments, a year with no records, or an over-constrained AND — renders the verbatim sheet message: **"No matching records — adjust your filters above."** HTTP 200, zero rows, no error styling.
9. **Nonexistent Deal ID** posted directly to the API (bypassing the picker) → empty state per Rule 8, never a 4xx/5xx (mirrors the sheet's typo safeguard).
10. **Archived deals** (soft-deleted in M1) and their receivables/payments: **include with an "archived" badge** is the recommended default; excluded-by-default-with-toggle is the alternative — Open Question 1. Whatever is decided must apply identically to all three sources.
11. **Year with lopsided data.** A workspace with deals booked in a year but no payments in that year (or vice versa) must return correct results per source: Deals/2025 may have rows while Payments/2025 is empty — both are valid, neither errors (Rule 3 + Rule 8).
12. **Very long text queries** are capped at 200 chars (validated, excess trimmed with a notice); queries are parameterized — user text is never interpolated into SQL/regex (no wildcard or regex injection; `%`/`_` in user text are literals).
13. **Permissions:** the account owner may search and export everything in their workspace (v1 has no other users, and search is read-only — nothing to friction-gate). Tenant isolation is absolute — all queries workspace-scoped.
14. **No audit entries** — there are no mutations to audit. Export actions may be access-logged for ops, but this is not the M0 financial audit trail.
15. **Cancelled and Closed records remain findable** (Status filter, or no status filter at all). Search is the one place nothing is ever hidden by lifecycle state (subject only to Rule 10's archived-records decision).
16. **Freshness:** results reflect committed data at query time. If projections are cached/denormalized, staleness must stay < 5 s — a payment logged in M5 must be findable essentially immediately.

## 5. Functional requirements

- **FR-M9-01** A Search screen offers the source selector (Deals / Collectibles / Payments) and renders the per-source result columns exactly as specified in §3.2.
- **FR-M9-02** Year filter: dropdown of years present in the workspace's data (plus "All"), applied with the Rule-3 semantics — booked year for Deals/Collectibles, paid year for Payments. The UI labels the semantics ("Year booked" / "Year paid") per source.
- **FR-M9-03** Deal ID filter: type-ahead picker over `display_label` ("D002 — Samia Bulao", M1 #35), applying an exact `deal_code` match; clearable; API tolerates unknown codes per Rule 9.
- **FR-M9-04** Status filter (Collectibles only): Open / Closed / Cancelled; hidden for other sources.
- **FR-M9-05** "Only with balance" toggle (Collectibles only): filters `balance > 0`; hidden for other sources.
- **FR-M9-06** Text-contains filter per Rule 4 (normalized, case/diacritic-insensitive substring over client + property), debounced ≥ 250 ms in the UI.
- **FR-M9-07** Sort selector with the three sheet presets per Rule 7, plus per-column header sort (SaaS superset); deterministic tie-breaks.
- **FR-M9-08** All filters AND-combine (Rule 5); results paginate (default 50/page) with a total-count readout ("128 matching records").
- **FR-M9-09** Empty results render the verbatim message "No matching records — adjust your filters above." for every source and filter combination (Rule 8).
- **FR-M9-10** Each result row links to its record's detail view: Deals → M1 deal detail; Collectibles → M4 receivable detail; Payments → M5 payment detail (opens its deal-payment context). *(Improvement over the sheet.)*
- **FR-M9-11** Export (CSV/XLSX) of the **filtered, sorted** result set — exactly the rows/columns/order on screen across all pages (cross-cutting export requirement; cap per Open Question 4).
- **FR-M9-12** Full query state serializes to the URL; opening a saved URL restores source, filters, sort, and page in any of the owner's authenticated sessions. *(Improvement.)*
- **FR-M9-13** Keyboard navigation: focus results, arrow up/down, Enter opens the row's detail, `/` focuses the text filter. *(Improvement.)*
- **FR-M9-14** The M9 API surface is read-only: only query endpoints exist; any write verb on M9 routes returns 405.

## 6. UI/UX requirements

- **Single screen** ("Search"), reachable from global nav on every page. Layout: source tabs across the top (Deals · Collectibles · Payments) → filter bar → results table.
- **Filter bar:** Year dropdown (labeled "Year booked" on Deals/Collectibles, "Year paid" on Payments — make the Rule-3 asymmetry visible, not implicit); Deal ID type-ahead picker; Status chips and "Only with balance" toggle appearing only on the Collectibles tab; text box with placeholder "Client or property contains…"; sort selector defaulting per source. Changing source keeps whatever filters remain applicable (year, deal ID, text) and drops/hides inapplicable ones (status, balance toggle) with their values cleared.
- **Results table:** per-source columns from §3.2; ₱-formatted money right-aligned; Status rendered as chips (Open/Closed/Cancelled); rows are links (whole row clickable + explicit chevron); sortable column headers; sticky header; total count; pagination controls.
- **Read-only affordance:** no edit controls anywhere; a subtle caption under the title: "Search is read-only — nothing here changes your data." (sheet copy preserved).
- **Empty state:** the verbatim message "No matching records — adjust your filters above." centered in the results area, with a one-click "Clear filters" action beneath it (the action is a SaaS addition; the message text is not to be reworded).
- **Archived records** (pending Open Question 1 default): grey "archived" badge on the row; badge tooltip explains the record is archived in its source module.
- **Debounce & loading:** text input debounced; table shows a lightweight skeleton, never a blocking spinner over the filter bar.
- **Mobile (360 px):** filter bar collapses into a "Filters" sheet with an active-filter count badge; result rows collapse to cards (Deals card: code, client, date, NET GCI; Collectibles card: code, client, balance, status chip; Payments card: date, code, gross).
- **Export button** on the table header, disabled at zero rows.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M1 | Deals projection fields (§3.2); `search_blob` inputs client_name + property_details; deal_code picker labels (display_label); booked_year for the year filter |
| reads ← | M4 | Collectibles projection: total_collectible, collected_net, balance, status (all M4-computed; M9 never recomputes) |
| reads ← | M5 | Payments projection: payment date, gross, net_of_vat, net_cash; paid-year for the year filter |
| reads ← | M0 | auth/session, workspace scoping, ₱ formatting locale |
| links → | M1/M4/M5 | row click-through routes to each module's detail view (FR-M9-10) |
| writes → | none | **M9 writes nothing and emits no domain events.** |

M9 should consume the same read-side projections/queries the source modules already expose (or thin denormalized search views over them) — it must never duplicate money math. If M6's dashboard and M9 both need indexed aggregates, they share the read layer.

## 8. Non-functional requirements

- **Performance:** any filter combination returns page 1 in **< 300 ms P95** on a workspace with ≥ 1,000 deals and ≥ 1,000 payments. Backing indexes: `(workspace_id, booked_year)` on deals/receivables, `(workspace_id, payment_date)` on payments, `(workspace_id, deal_code)` everywhere, and a full-text/trigram index on `search_blob` for the contains filter (plain leading-wildcard `LIKE` scans are not acceptable at target scale).
- **Export** respects active filters and sort; streams (no full materialization in memory); completes < 10 s for 2,000 rows.
- **Correctness over cache:** projection staleness < 5 s (Rule 16).
- **Security:** workspace-scoped queries only; auth check on every endpoint; parameterized queries (Rule 12).
- **Read-only guarantee** enforced at the route layer (no write handlers registered) — not merely by UI omission.

## 9. Acceptance criteria (Given/When/Then)

Fixtures = the v30.20 workbook's live data imported via M1's importer (21 deals D001–D021, 8 payments; receivable states per M4). Money figures must match to the centavo.

1. **Text search with trailing-space data.** **Given** Deals source and text `Ventura` **When** the search runs **Then** exactly **D002 and D003** return — including the record whose stored property details carry a trailing space (`"Ventura Residences "`) — and **Given** text `  ventura residences   ` (case + padding) **Then** the same rows return (Rule 4 normalization on both sides).
2. **Same text, other sources.** **Given** Collectibles source and text `Ventura` **Then** exactly the receivables of D002 and D003 return (client/property resolved via the deal); **Given** Payments source and the same text **Then** zero rows and the verbatim empty state (no payments exist for D002/D003).
3. **Open balances.** **Given** Collectibles source with Status = Open and Only with balance = Yes **Then** exactly **14 receivables** return — D002, D003, D005, D007, D008, D009, D010, D011, D012, D013, D014, D015, D016, D021 — sorted balance high→low with **D013 first (balance ₱906,752.23)** and **D021 present with balance ₱309,948.98** (partially collected: ₱44,642.86 of ₱354,591.84). *(Count derives from the workbook's verified receivable states: 21 deals minus the 7 Closed — D001, D004, D006, D017–D020.)*
4. **Payments year filter (paid basis).** **Given** Payments source and Year = 2026 **Then** exactly **8 rows** return, default-sorted newest first with the 2026-07-09 D021 incentive release (Gross ₱50,000.00, Net of VAT ₱44,642.86, Net Cash ₱45,535.71) as the first row; **Given** Year = 2025 **Then** the verbatim empty state.
5. **Amount sort on Deals.** **Given** Deals source and Sort = Amount (high→low) **Then** **D013 is first with NET GCI ₱906,752.23**.
6. **Year asymmetry.** **Given** a synthetic deal booked 2025-12-15 with a payment dated 2026-01-10 **Then** it appears under Year 2025 in Deals and Collectibles, its payment appears under Year 2026 in Payments, and Payments/2025 shows the empty state (Rules 3, 11).
7. **Deal ID filter across sources.** **Given** Deal ID = D021 **Then** Deals returns 1 row (NET GCI ₱354,591.84), Collectibles returns 1 row (Balance ₱309,948.98, Status Open), Payments returns 1 row (the ₱50,000 incentive release).
8. **Nonexistent Deal ID via API.** **Given** `deal_code=D999` posted directly **Then** HTTP 200 with zero rows and the empty-state contract — never an error (Rule 9).
9. **Verbatim empty state.** **Given** any zero-row result **Then** the message string equals exactly `No matching records — adjust your filters above.`
10. **Read-only.** **Given** any authenticated session **When** a write verb hits any M9 route **Then** 405 and no data changes; the UI exposes no edit affordance anywhere on the screen.
11. **Export respects filters.** **Given** the criterion-3 result set **When** exported to CSV **Then** the file contains exactly those 14 rows, in balance-descending order, with the §3.2 Collectibles columns.
12. **Shareable URL.** **Given** the owner copies the URL of the criterion-3 search **When** they open it in another of their authenticated sessions (e.g., on their phone) **Then** source, filters, sort, and page restore identically; a user from any other workspace gets no data.
13. **Performance.** **Given** a seeded workspace with 1,000 deals and 1,000 payments **Then** every criterion-1–7 query returns page 1 in < 300 ms P95.

## 10. Out of scope / future

- Saved searches / search history; scheduled or emailed exports.
- Cross-workspace search (tenant isolation is absolute).
- Fuzzy matching, spelling correction, relevance ranking — matching is exact-substring on normalized text only.
- Searching amounts, dates-as-text, notes, or developer names via the text filter (notes extension is Open Question 3).
- Any write capability, bulk action, or inline edit from results — search stays a pure read layer permanently.
- Global omnibox/command-palette search embedded in the app chrome (candidate future consumer of the same read API).

## 11. Open questions

1. **Archived records:** include archived deals (and their receivables/payments) with an "archived" badge — recommended — or exclude by default behind a toggle? The sheet has no archive concept, so there is no parity answer.
2. **Unified "All" tab in v1 or later?** The sheet is strictly one source at a time; the unified tab is specced as an improvement (Rule 2, Milestone M9.4) but needs a product call on v1 inclusion.
3. **Text-search scope extension:** should `text` also match OR/Invoice notes (M5) and Next Action notes (M4)? The sheet searches only client + property. Extending is cheap at the index level but changes what "no match" means — product-owner call.
4. **Export cap:** is an export result-set cap needed (e.g., 10,000 rows with a "narrow your filters" notice), or export-all-matching always? Affects streaming design only.
5. **Collectibles sort mapping:** the sheet ignores the sort selector for Collectibles (always balance high→low). The SaaS maps Date (oldest) → booking date ascending as a defined improvement (Rule 7) — confirm this mapping, or lock the selector to balance-descending for sheet parity.
