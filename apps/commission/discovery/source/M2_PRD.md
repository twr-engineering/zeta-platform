# M2 — Yield Summary & Realized Analytics — PRD

**Product:** ZETA GCI + Collections · **Module:** M2 · **Source of truth:** v30.20 workbook — *Yield Summary* sheet · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every rule is stated with formulas in plain math and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M2 answers one question from the booked deal data: **"What does the agent actually earn, per peso of property sold, by kind of business?"** It groups M1's deals into five fixed segments (Resale, Developer, Sales subtotal, Rental, Referral), computes each segment's realized commission yield and average price, and publishes the two numbers the whole planning model runs on: the **all-time blended sales yield** and the **all-time blended average sale price** — the "planning basis" consumed live by the GCI Calculator (M3).

**Spreadsheet behavior it replaces.** The *Yield Summary* sheet is a fully computed tab (no blue input except the report-year filter cell): five segment rows built from COUNTIFS/SUMIFS over the Deal Log, a TOTAL GCI line, two memo lines (incentives and referral-outs "already inside the GCI figures above"), an average-price block, and a PLANNING BASIS block whose two named ranges (`AllTimeYield`, `AllTimePrice`) feed the GCI Calculator regardless of the year filter. Everything recomputes live when a deal changes.

**What improves in SaaS form.** Aggregates become an indexed/materialized read model that restates on deal events instead of 1,000-row array scans on every view; the planning basis becomes a versioned API contract for M3 with full-precision decimals (the sheet quietly passes full precision between cells — the SaaS makes that explicit); segment membership becomes a unit-tested classifier instead of six copies of the same COUNTIFS criteria; and a partition invariant catches any deal that silently falls out of all segments (a state the sheet cannot detect).

**Why yield matters (context for developers):** commission rates on paper (5%) are not what the agent realizes after VAT stripping, incentives, and referral-outs. Realized yield = NET GCI ÷ list price is the honest earn rate. Planning with the paper rate overstates income; planning with realized yield is the point of this product. Rentals realize ~8.33% (one month of annual rent) — structurally different from sales — which is why they are reported separately and **excluded** from the blended sales yield.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent — their own Rainmaker.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Read their own realized yield per segment; sanity-check the blended yield and average price that drive their own annual plan (M3); compare resale vs developer economics when deciding mix (e.g., resale realizes 4.86% vs developer 3.65% on the live fixtures); verify that a just-logged deal landed in the right segment; use the year filter to answer "how did 2026 book?" |
| *(v2, out of scope)* | *Brokerage/team roles — Rainmaker reviews team-level yields, Admin/ISA verifies segment placement, team Agents view read-only — arrive with the next version.* |

## 3. Data model

M2 has **no user-editable entities**. Its only input is a per-user view state (the report-year filter). Everything else is a computed read model over M1 deals. All money `decimal(14,2)` at rest, full precision in intermediate math; rates full-precision decimal (never float — prompt edge case 15).

### 3.1 Deal fields read from M1 (field-level contract)

| M1 field | Type | Used for |
|---|---|---|
| transaction_type | enum `Sale`/`Rental` | segment classification |
| deal_type | enum `Developer`/`Resale`/`N/A` | segment classification |
| representation | enum (incl. `Referrer`) | segment classification |
| list_price | money | Volume; for rentals this holds the **annual rent** |
| net_gci | money | GCI aggregates (NET GCI, Net of VAT — M1 Rule H) |
| incentive_net | money | memo line "Incentives (+)" |
| referral_out | money | memo line "Referral-outs (−)" |
| booked_year | int | year filter |
| archived_at | timestamp | archived deals excluded from all aggregates |

### 3.2 Segment classifier (pure function, one source of truth)

Each non-archived deal maps to **exactly one** segment:

| Segment | Membership predicate (exact) |
|---|---|
| Resale | transaction_type = `Sale` AND deal_type = `Resale` AND representation ≠ `Referrer` |
| Developer | transaction_type = `Sale` AND deal_type = `Developer` AND representation ≠ `Referrer` — "Developer" = units sold for a property developer, pre-selling **and** RFO |
| Rental | transaction_type = `Rental` AND representation ≠ `Referrer` |
| Referral | representation = `Referrer` — **any** transaction type; the commission is a referral fee received |

**SALES SUBTOTAL** is not a sixth predicate — it is `Resale + Developer`, and it is the population that feeds M3.

With M1's validation (Sale ⇒ deal_type ∈ {Developer, Resale}; Rental ⇒ deal_type = N/A) these four predicates **partition** all deals — every deal belongs to exactly one segment (Rule 9 makes this an enforced invariant, because imported/legacy data may violate M1's coupling).

### 3.3 YieldSummaryReport (computed read model)

Scope: workspace + `year_filter` (a booked year, or `All`). Let `S(seg, Y)` = the set of non-archived deals matching seg's predicate AND (`Y = All` OR booked_year = Y). All fixtures below use the live workbook data, where the 2026 filter and All coincide (all 21 deals are booked 2026).

Per segment row (Resale, Developer, SALES SUBTOTAL, Rental, Referral):

| Field | Derivation (plain math) | Worked ₱ (live fixtures, Y = 2026 ≡ All) |
|---|---|---|
| deals | count of S(seg, Y) | Resale 7 · Developer 10 · **Subtotal 17** · Rental 4 · Referral 0 |
| volume | Σ list_price over S(seg, Y) | Resale ₱55,251,000.00 · Developer ₱104,029,945.00 · **Subtotal ₱159,280,945.00** · Rental ₱2,400,000.00 · Referral ₱0.00 |
| gci | Σ net_gci over S(seg, Y) | Resale ₱2,687,550.00 · Developer ₱3,800,947.25 · **Subtotal ₱6,488,497.25** · Rental ₱200,000.00 · Referral ₱0.00 |
| realized_yield | gci ÷ volume; **undefined ("—") when volume = 0** | Resale 2,687,550 ÷ 55,251,000 = **4.8643%** · Developer 3,800,947.25 ÷ 104,029,945 = **3.6537%** · Subtotal 6,488,497.25 ÷ 159,280,945 = **4.0736%** · Rental 200,000 ÷ 2,400,000 = **8.3333%** · Referral — |
| share_of_sales | volume(seg) ÷ volume(SALES SUBTOTAL) — Resale/Developer/Subtotal only; Rental and Referral display the literal **"—"** | Resale 55,251,000 ÷ 159,280,945 = **34.69%** · Developer = **65.31%** · Subtotal = 100% |

Report footer:

| Field | Derivation | Worked ₱ (live fixtures) |
|---|---|---|
| total_gci_all_ops | gci(Sales) + gci(Rental) + gci(Referral) | 6,488,497.25 + 200,000.00 + 0 = **₱6,688,497.25** |
| memo_incentives | Σ incentive_net over **all** deals in Y (not segment-restricted — sheet formula sums the whole column) | Σ of 7 developer-deal incentives (billed 400,000 ÷ 1.12) = **₱357,142.87** from persisted 2-dp values (see Rule 8 on the ₱0.01 vs the sheet) |
| memo_referral_outs | − Σ referral_out over **all** deals in Y | −75,000.00 (D004's fixed fee) → displays **(₱75,000.00)** |
| resale_avg_price | volume(Resale) ÷ deals(Resale); "—" when 0 deals | 55,251,000 ÷ 7 = **₱7,893,000.00** |
| developer_avg_price | volume(Developer) ÷ deals(Developer) | 104,029,945 ÷ 10 = **₱10,402,994.50** |
| blended_avg_price | volume(SALES SUBTOTAL) ÷ deals(SALES SUBTOTAL) | 159,280,945 ÷ 17 = **₱9,369,467.35** |
| rental_annual_gci_ytd | gci(Rental) for the filter year | **₱200,000.00** |

The memo lines carry the sheet's caption verbatim: *"memo — already inside the GCI figures above."* They are informational decomposition, **never** added to any total (NET GCI already contains incentives and nets out referral-outs — M1 Rule H).

**All derivations in one plain-math block** (Y = year filter; `All` drops the year predicate; every Σ/count is over non-archived deals in the workspace):

```
deals(seg, Y)        = count of deals where predicate(seg) AND (Y = All OR booked_year = Y)
volume(seg, Y)       = Σ list_price   over the same set
gci(seg, Y)          = Σ net_gci      over the same set
realized_yield(seg)  = gci(seg, Y) ÷ volume(seg, Y)            — "—" when volume = 0
share_of_sales(seg)  = volume(seg, Y) ÷ volume(Sales, Y)       — Resale/Developer/Subtotal only
Sales (subtotal)     = Resale + Developer, component-wise (deals, volume, gci)

total_gci_all_ops    = gci(Sales, Y) + gci(Rental, Y) + gci(Referral, Y)
memo_incentives      = Σ incentive_net over ALL deals in Y      (segment-agnostic)
memo_referral_outs   = − Σ referral_out over ALL deals in Y     (segment-agnostic)

resale_avg_price     = volume(Resale, Y) ÷ deals(Resale, Y)     — "—" when deals = 0
developer_avg_price  = volume(Developer, Y) ÷ deals(Developer, Y)
blended_avg_price    = volume(Sales, Y) ÷ deals(Sales, Y)
rental_annual_gci    = gci(Rental, Y)

all_time_yield       = gci(Sales, All) ÷ volume(Sales, All)     — null when volume = 0
all_time_price       = volume(Sales, All) ÷ deals(Sales, All)   — null when deals = 0
```

*Worked ₱, end to end (live data):* Sales = Resale (7, ₱55,251,000, ₱2,687,550) + Developer (10, ₱104,029,945, ₱3,800,947.25) = 17 deals, ₱159,280,945.00, ₱6,488,497.25 → blended yield 6,488,497.25 ÷ 159,280,945 = 4.0736%; blended avg 159,280,945 ÷ 17 = ₱9,369,467.35; total all-ops GCI 6,488,497.25 + 200,000 + 0 = ₱6,688,497.25.

### 3.4 PlanningBasis (computed, workspace-level — the M3 feed)

**Ignores the year filter entirely.** Always computed over `S(seg, All)`:

| Field | Derivation | Live value (full precision → display) |
|---|---|---|
| all_time_sales_deals | deals(SALES SUBTOTAL, All) | 17 |
| all_time_sales_volume | volume(SALES SUBTOTAL, All) | ₱159,280,945.00 |
| all_time_sales_gci | gci(SALES SUBTOTAL, All) | ₱6,488,497.25 |
| all_time_yield (`AllTimeYield`) | all_time_sales_gci ÷ all_time_sales_volume; **null** when volume = 0 | 0.0407361800… → **4.0736%** |
| all_time_price (`AllTimePrice`) | all_time_sales_volume ÷ all_time_sales_deals; **null** when deals = 0 | 9,369,467.3529… → **₱9,369,467.35** |
| basis_version / computed_at | monotonic version + timestamp | for M3 cache coherence & audit |

**Cross-check identity (use as a test):** `all_time_yield × all_time_price = all_time_sales_gci ÷ all_time_sales_deals` = 6,488,497.25 ÷ 17 = **₱381,676.31** — exactly M3's verified "Professional Fees per deal." This only holds if M2 hands M3 **full-precision** decimals: with the display-rounded 4.0736%, the product is 381,674.62 — ₱1.69 off (Rule 7).

### 3.5 Materialized aggregate (implementation-approved shape)

Performance NFRs may be met with a maintained aggregate table — acceptable per the prompt: `yield_aggregate(workspace_id, segment, booked_year) → {deal_count, volume_sum, gci_sum, incentive_net_sum, referral_out_sum}`, updated transactionally (or ≤2 s eventually) on every `deal.created/updated/archived/restored` event from M1, where an updated deal contributes **−old, +new** (a deal edit can change segment, year, and amounts at once). All report fields above are O(segments × years) reads over this table. A nightly (and on-demand) reconciliation job recomputes from raw deals and alarms on any drift > ₱0.00.

## 4. Business rules & edge cases (numbered)

1. **Booked basis, not cash basis.** Every M2 number derives from booked deal fields; payments, collection status, and receivable balances have **no effect** here (a deal fully unpaid still counts at full NET GCI). Cash-side analytics live in M6/M7/M8. Corollary: `Cancelled` deals (M4 status) **remain included** — the sheet aggregates the Deal Log with no status filter (Open Question 2).
2. **Referrer deals sit on their own line and are excluded from the blend** (prompt edge case 5). A Referrer deal — any transaction type — appears **only** in the Referral segment and never in Resale/Developer/Rental, so it can never move the blended sales yield, the blended average price, or the planning basis. *Worked ₱:* add a synthetic Referrer deal (Sale, list ₱5,000,000, fee ₱50,000 untaxed → net_gci 50,000): Referral row becomes 1 / ₱5,000,000.00 / ₱50,000.00 / 1.0000%; SALES SUBTOTAL stays 17 / ₱159,280,945.00 / 4.0736%; total_gci_all_ops rises to ₱6,738,497.25.
3. **Rentals are excluded from the sales blend** (they are structurally different: yield ≈ 8.33% = one month of annual rent). If the 4 rental fixtures were wrongly blended in, the "sales" yield would read (6,488,497.25 + 200,000) ÷ (159,280,945 + 2,400,000) = 4.1364% — a contaminated planning input. Volume for rentals = annual rent (M1 stores it in list_price).
4. **Year filter scopes display only; planning basis is all-time regardless.** With filter = 2027 (no deals), every segment row shows 0 deals / ₱0.00 / "—", **and** the planning-basis card still shows 4.0736% / ₱9,369,467.35. M3's live feed never flickers with the filter.
5. **Empty populations render as zeros/em-dashes, never errors** (required edge case). volume = 0 → realized_yield "—" (no division); deals = 0 → avg price "—"; sales volume = 0 → share_of_sales "—" for all rows. The sheet's `IF(D=0,"",…)` guards become explicit null semantics.
6. **A deal edited in M1 restates every M2 aggregate immediately** (required edge case). On `deal.updated`, aggregates apply −old/+new; the open Yield Summary screen refreshes (push or ≤2 s poll). *Worked ₱ (archive D021):* sales deals 17→16, volume →₱151,280,945.00, GCI →₱6,133,905.41, blended yield →6,133,905.41 ÷ 151,280,945 = **4.0546%**, AllTimePrice →151,280,945 ÷ 16 = **₱9,455,059.06** — and M3's fees-per-deal restates on its next read.
7. **Full precision to M3, rounded only at display.** all_time_yield and all_time_price cross the M2→M3 API as full-precision decimals. Yields display at 2 dp by default with the 4-dp figure in tooltip/export (fixtures in §9 assert 4 dp); money displays ₱ #,##0.00.
8. **Aggregates sum persisted per-deal values (2 dp), not re-derived full precision.** M1 persists computed money rounded half-up to centavos; M2 sums what is stored, so screen totals always tie to the deal list a user can export. Known consequence: memo_incentives = ₱357,142.87 from stored values, while the sheet's full-precision column sum shows ₱357,142.86 — a ₱0.01 difference, within the product's ₱0.50 tolerance doctrine, documented here so nobody "fixes" it into a float bug. (All other live fixtures tie exactly.)
9. **Partition invariant.** count(Resale)+count(Developer)+count(Rental)+count(Referral) must equal the count of all non-archived deals. A deal matching no segment (possible only via importer/legacy data breaking M1's type coupling, e.g., Sale + deal_type N/A + non-Referrer) fails the invariant and is surfaced as a data-quality warning on the report ("N deals unclassified — fix their Transaction/Deal Type in the Deal Log"), never silently dropped the way COUNTIFS drops them.
10. **Archived deals are out of every aggregate** (including planning basis) the moment the archive event lands; restore reverses it.
11. **Memo lines are segment-agnostic** (sheet formula: whole-column SUM, year-filtered only). A Referrer deal's incentive or referral-out would appear in the memos even though its GCI sits outside the sales subtotal — flagged as Open Question 4 rather than silently changed.
12. **Share of Sales is volume-based**, not GCI-based: segment volume ÷ sales volume. Rental and Referral rows show the literal "—" (they are not part of the sales mix).
13. **Decimal arithmetic only** (prompt edge case 15): no binary floats anywhere in the aggregation path; comparisons in reconciliation use exact decimal equality on stored 2-dp sums.

## 5. Functional requirements

- **FR-M2-01** The system computes the five-segment report per §3.3 for a given workspace and year filter (`All` or any booked year present in the data), with all derivations exactly as specified.
- **FR-M2-02** Segment membership is computed by a single shared classifier function (§3.2) used by aggregation, invariant checks, and any per-deal "segment" badge — one implementation, unit-tested against all 21 workbook fixtures.
- **FR-M2-03** The system maintains the PlanningBasis (§3.4) and exposes it via an internal API to M3: `{all_time_yield, all_time_price, deals, volume, gci, basis_version}` — full-precision decimals, nulls when no sales deals exist.
- **FR-M2-04** All aggregates restate on M1 deal events (`created/updated/archived/restored`) within the same transaction or ≤2 s eventually; an updated deal contributes −old/+new across segment/year moves.
- **FR-M2-05** The report screen offers the year filter (default = current year; options = All + every booked_year present), and re-renders without recomputing the planning basis.
- **FR-M2-06** total_gci_all_ops and the two memo lines render with the sheet's caption ("already inside the GCI figures above"); memos are never added to totals.
- **FR-M2-07** The average-price block (resale / developer / blended / rental annual GCI) renders per §3.3 with "—" for empty populations.
- **FR-M2-08** The partition invariant (Rule 9) runs on every report render and reconciliation pass; violations render a warning banner listing offending deal codes.
- **FR-M2-09** CSV/XLSX export of the full report (segment table + memos + averages + planning basis) matching on-screen values, yields at 4 dp.
- **FR-M2-10** A reconciliation job (nightly + on-demand, triggered by the account owner) recomputes all aggregates from raw deals and reports any drift against the materialized values; drift ≠ 0 alarms.
- **FR-M2-11** Read access behind auth + workspace (tenant) scoping; no mutation endpoints exist in this module (view state excepted).
- **FR-M2-12** Per-segment drill-through: clicking a segment row opens the M1 deal list pre-filtered to that segment's predicate + year filter, so every aggregate is auditable to its deals.

## 6. UI/UX requirements

- **One screen: "Yield Summary."** Header caption mirroring the sheet: *"Blended sales yield + blended avg sale price feed the GCI Calculator. Developer = pre-selling + RFO. Rental & Referral separate."* Year-filter select (blue input affordance — the only input on the page, exactly like the sheet's one blue cell).
- **Segment table:** five rows in fixed order (Resale, Developer, **SALES SUBTOTAL** emphasized, Rental "(on rent)", Referral "(fees)"); columns Deals · Volume · GCI (Net of VAT) · Realized Yield · Share of Sales. All values locked-computed styling with formula tooltips (e.g., "Realized Yield = GCI ÷ Volume"). Subtotal row visually distinct — it is what feeds planning.
- **TOTAL GCI (ALL OPERATIONS)** line beneath, then the memo pair (Incentives + / Referral-outs −) in muted styling with the "already inside" caption; referral-outs shown as a negative in parentheses.
- **Avg-price block:** Resale avg · Developer avg · **BLENDED SALE avg price** (marked "→ feeds calculator") · Rental annual GCI (YTD).
- **Planning Basis card**, visually separated and labeled *"All-time realized — feeds the GCI Calculator; ignores the report-year filter above"*: All-time blended yield (4.0736%) and All-time blended avg price (₱9,369,467.35), each with a "used by GCI Calculator" link into M3.
- Empty states: no deals at all → "No deals yet — realized yields appear once deals are logged in the Deal Log" with a link; filter year with no deals → zeroed table + hint "No deals booked in 2027 — planning basis below is unaffected."
- Data-quality banner for Rule 9 violations with per-deal links.
- ₱ #,##0.00 everywhere; yields 2 dp with 4-dp tooltip; "—" em-dash for undefined ratios.
- Mobile (360 px): table collapses to per-segment cards (Deals/Volume/GCI/Yield stacked); planning-basis card pinned first.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M1 | transaction_type, deal_type, representation, list_price, net_gci, incentive_net, referral_out, booked_year, archived_at (§3.1); consumes `deal.*` events for restatement |
| reads ← | M0 | auth/session + workspace scoping (read access), ₱ locale/formatting |
| provides → | M3 | PlanningBasis API: all_time_yield + all_time_price (full precision, with basis_version); M3 uses them wherever its per-year Yield/Avg-Price overrides are blank |
| provides → | M9 (optional) | segment label per deal via the shared classifier (search facet) |
| writes → | — | **nothing** — M2 is a pure read model; it never mutates deals, receivables, or payments |

Note: M3's *YTD Actual Sales* figure reads M1 directly (its own formula, including rental volume — see M3), **not** through M2. M2's feed to M3 is exactly the two planning-basis numbers.

## 8. Non-functional requirements

- **Performance:** report render < 500 ms P95 at ≥1,000 deals (materialized aggregates per §3.5 acceptable); PlanningBasis API < 50 ms P95 (M3 reads it on every calculator render); restatement after a deal event visible ≤2 s.
- **Consistency:** aggregates must never drift from raw deals — reconciliation (FR-M2-10) with zero-drift alarm; −old/+new updates are idempotent per event (exactly-once effect under retries).
- **Precision:** decimal end-to-end; full-precision ratios to M3; the §3.4 cross-check identity holds to the centavo.
- **Permissions (v1):** auth + absolute tenant isolation, server-enforced; no financial mutation surface exists, so nothing here needs friction-gating; read APIs and schema are v2-role-ready.
- **Auditability:** every deal-level number is one drill-through away (FR-M2-12); planning-basis changes are traceable to the deal events that caused them (basis_version increments logged).
- **Tenancy:** all aggregates workspace-scoped; cross-workspace leakage tests as in M0.

## 9. Acceptance criteria (Given/When/Then)

Fixtures = the imported v30.20 workbook (21 deals, all booked 2026; 17 sales deals — 16 with cached values + D001, whose recovered figures are confirmed by the planning-basis numbers). Yields asserted at 4 dp; money to the centavo.

### 9.0 Fixture appendix — expected segment classification of all 21 workbook deals

The classifier (§3.2) must produce exactly this mapping (also the basis of the M2 test plan):

| Deal | Txn / Deal Type / Representation | Segment | list_price (→ Volume) | net_gci (→ GCI) |
|---|---|---|---|---|
| D001 | Sale / Resale / Double Ended | Resale | 8,721,000.00 | 436,050.00 |
| D002 | Sale / Resale / Double Ended | Resale | 2,530,000.00 | 126,500.00 |
| D003 | Sale / Resale / Seller | Resale | 2,350,000.00 | 117,500.00 |
| D004 | Sale / Resale / Double Ended | Resale | 17,500,000.00 | 800,000.00 |
| D005 | Sale / Resale / Double Ended | Resale | 13,500,000.00 | 675,000.00 |
| D006 | Sale / Resale / Buyer | Resale | 7,050,000.00 | 352,500.00 |
| D007 | Sale / Resale / Double Ended | Resale | 3,600,000.00 | 180,000.00 |
| D008 | Sale / Developer / Double Ended | Developer | 6,955,300.00 | 317,414.70 |
| D009 | Sale / Developer / Double Ended | Developer | 12,048,370.00 | 322,724.20 |
| D010 | Sale / Developer / Double Ended | Developer | 7,011,000.00 | 426,953.13 |
| D011 | Sale / Developer / Double Ended | Developer | 12,359,740.00 | 155,803.57 |
| D012 | Sale / Developer / Double Ended | Developer | 13,218,975.00 | 206,696.43 |
| D013 | Sale / Developer / Double Ended | Developer | 19,500,600.00 | 906,752.23 |
| D014 | Sale / Developer / Double Ended | Developer | 7,956,500.00 | 401,965.08 |
| D015 | Sale / Developer / Double Ended | Developer | 1,601,600.00 | 77,232.14 |
| D016 | Sale / Developer / Double Ended | Developer | 15,377,860.00 | 630,813.93 |
| D021 | Sale / Developer / Double Ended | Developer | 8,000,000.00 | 354,591.84 |
| D017 | Rental / N/A / Lessor | Rental | 270,000.00 (annual rent) | 22,500.00 |
| D018 | Rental / N/A / Double Ended | Rental | 1,560,000.00 (annual rent) | 130,000.00 |
| D019 | Rental / N/A / Lessor | Rental | 120,000.00 (annual rent) | 10,000.00 |
| D020 | Rental / N/A / Lessor | Rental | 450,000.00 (annual rent) | 37,500.00 |

Column sums by segment reproduce §3.3 exactly (Resale 7 / 55,251,000.00 / 2,687,550.00; Developer 10 / 104,029,945.00 / 3,800,947.25; Rental 4 / 2,400,000.00 / 200,000.00; Referral empty). Note D001: its computed cells lost their cache in the workbook export (ARRAYFORMULA anchor row), but ₱436,050.00 = 5% × 8,721,000 is confirmed by the Payments Log and by these planning-basis totals — the importer (M1) recomputes it anyway.

### 9.1 Given/When/Then

1. **Given** the imported workbook **When** Yield Summary renders with filter = All (or 2026 — identical here) **Then** the table reads exactly: Resale 7 / ₱55,251,000.00 / ₱2,687,550.00 / 4.8643% / 34.69%; Developer 10 / ₱104,029,945.00 / ₱3,800,947.25 / 3.6537% / 65.31%; SALES SUBTOTAL 17 / ₱159,280,945.00 / ₱6,488,497.25 / 4.0736% / 100%; Rental 4 / ₱2,400,000.00 / ₱200,000.00 / 8.3333% / —; Referral 0 / ₱0.00 / ₱0.00 / — / —.
2. **Given** the same state **Then** TOTAL GCI (ALL OPERATIONS) = ₱6,688,497.25; memo Incentives (+) = ₱357,142.87 (stored-value sum; ₱0.01 vs the sheet's full-precision 357,142.86 is expected per Rule 8); memo Referral-outs (−) = (₱75,000.00).
3. **Given** the same state **Then** Resale avg = ₱7,893,000.00; Developer avg = ₱10,402,994.50; BLENDED SALE avg = ₱9,369,467.35; Rental annual GCI (YTD) = ₱200,000.00.
4. **Given** the same state **Then** PlanningBasis = yield 4.0736% (0.0407361800…) and price ₱9,369,467.35 (9,369,467.3529…), and M3's fees-per-deal computed from the API values = ₱381,676.31 = 6,488,497.25 ÷ 17 (full-precision identity, Rule 7 / §3.4).
5. **Given** filter switched to a year with no deals (e.g., 2027) **Then** all segment rows show 0 / ₱0.00 / ₱0.00 / — / —, no errors are thrown, **and** the planning-basis card still shows 4.0736% / ₱9,369,467.35 (required edge case: zeros not errors; basis ignores filter).
6. **Given** a new Referrer deal (Sale, Resale-type property, list ₱5,000,000, fee ₱50,000 untaxed) **When** saved in M1 **Then** Referral row = 1 / ₱5,000,000.00 / ₱50,000.00 / 1.0000% / —; Resale and SALES SUBTOTAL rows are byte-identical to criterion 1; blended yield still 4.0736% (prompt edge case 5).
7. **Given** the 4 rental fixtures **Then** they appear only in the Rental row at 8.3333% and contribute nothing to SALES SUBTOTAL volume/GCI/yield (required edge case: rentals excluded from the blend).
8. **Given** D021 is archived in M1 **When** the report refreshes **Then** within 2 s: SALES SUBTOTAL = 16 / ₱151,280,945.00 / ₱6,133,905.41 / 4.0546%; AllTimePrice = ₱9,455,059.06; restoring D021 returns criterion-1 values exactly (required edge case: M1 edit restates immediately; also proves −old/+new reversibility).
9. **Given** D004's receivable is later marked Cancelled in M4 **Then** no M2 number changes (booked basis, Rule 1).
10. **Given** an imported legacy deal violating type coupling (Sale + deal_type N/A + non-Referrer) **Then** the partition-invariant banner lists its deal code and total classified deals ≠ total deals is impossible to miss (Rule 9).
11. **Given** a brand-new workspace with zero deals **Then** the screen shows the global empty state and the PlanningBasis API returns nulls without error; M3 renders its "no realized basis yet" state.
12. **Given** the export button **Then** the CSV/XLSX matches on-screen values with yields at 4 dp, including the planning-basis block.
13. **Given** 1,000 synthetic deals **Then** render < 500 ms P95 and the reconciliation job reports zero drift.

## 10. Out of scope / future

- No cash/collections analytics (M6/M7/M8 own collected vs outstanding); no per-lead-source cuts (M7); no per-agent yields (deals carry no agent in v1 — M1 OQ5); no configurable/custom segments (the five are fixed product semantics); no trailing-window planning basis (Open Question 1); no charts in v1 (table parity with the sheet first); no status-based filtering of realized yield (Open Question 2); no forecasting of any kind (product philosophy: reactive, booked-basis).

## 11. Open questions

1. **All-time vs trailing-N-years planning basis.** The sheet's planning basis is all-time by construction. Once 3–4 years of data accumulate, an all-time blend may lag the agent's current mix (e.g., a shift toward resale). Should PlanningBasis gain a configurable trailing window (e.g., trailing 24 months) as an alternative M3 feed? Sheet: all-time only. Recommend shipping all-time and revisiting with the owner after year 2.
2. **Cancelled deals in realized yield.** The sheet includes Cancelled deals (Yield Summary reads the Deal Log with no status filter — booked basis; collections status has no effect). A cancelled deal's NET GCI still lifts the blended yield that plans next year. Confirm with the product owner whether v1 keeps sheet behavior (recommended for parity, per Rule 1) or excludes Cancelled from the planning basis — if the latter, M2 gains a read on M4 status and the fixtures change.
3. **Referral segment yield semantics.** For Referrer deals, realized_yield = fee ÷ volume, where volume = the referred deal's list price — i.e., "referral fee as % of the referred property's price." Confirm this is the intended reading (and therefore that list_price on a Referrer deal should hold the referred property's full price, not the fee).
4. **Memo-line scope.** The sheet's memo lines sum incentive_net and referral_out over **all** deals (year-filtered, segment-agnostic), so a Referrer deal carrying either would land in the memos while its GCI sits outside the sales subtotal. Almost certainly moot in practice (no live case) — confirm memos should stay whole-book rather than sales-only.
5. **Aggregation precision policy.** Rule 8 sums persisted 2-dp values (screen ties to exportable deal rows; incentives memo shows ₱357,142.87 vs the sheet's full-precision ₱357,142.86). Confirm this policy product-wide, or direct M2 to aggregate full-precision engine outputs instead (then totals can differ by centavos from the visible deal list).
