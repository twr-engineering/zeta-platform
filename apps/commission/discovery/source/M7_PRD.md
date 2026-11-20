# M7 — Source Performance — PRD

**Product:** ZETA GCI + Collections · **Module:** M7 · **Source of truth:** v30.20 workbook — *Source Performance* sheet + the *Collectibles* Source helper column · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every rule is stated with formulas in plain math and worked ₱ examples; nothing is "see the spreadsheet."

---

## 1. Module overview

M7 is the **lead-channel scorecard**: one row per lead source, aggregating every deal's booked NET GCI, collected cash, and outstanding balance, split into **Resale + Rental** (fast-collecting money — typically paid within weeks of closing) versus **Developer / Pre-selling** (slow pipeline money — developers release commission in tranches, sometimes over years).

**Purpose.** It tells the agent which of their lead channels produce money that actually ARRIVES, versus money stuck in pre-selling pipelines. A source can look great on booked NET GCI and terrible on collected cash; the resale+rental vs. developer split is the fast/slow-cash lens that exposes it. In the live fixture data, YouTube books ₱2.46M (36.71% of all NET GCI) but only 16.17% of it has arrived, because 6 of its 7 deals are developer deals; Repeat Client's ₱1.62M is mostly resale/rental and collects on a different clock.

**Lineage (v30.20).** This report is **new in v30.20** — it replaced the retired per-deal **Cash Reconciliation** view. The per-deal Gross / VAT / EWT / Net Cash detail that view carried now lives **only in the Payments Log (M5)**; period tax totals live in **Collection Reports (M8)**. M7 deliberately carries **no tax columns** — it is a NET GCI lens ("earned & yours": net of VAT and referral-outs, with EWT retained since EWT comes back as a tax credit).

**Spreadsheet behavior it replaces.** The *Source Performance* sheet holds one row per Settings lead source (rows 5–34 mirror Settings B155:B204, 50 slots, blanks ignored), each row aggregating the *Collectibles* table via its Source helper column (a VLOOKUP of the deal's Deal Log Source). A Year filter cell B3 accepts "All" or a single **booking** year (it compares the Collectibles booking-year column — NOT the payment year). A TOTAL row sums the sheet; % columns recompute at total level.

**What improves in SaaS form.**

1. Aggregation happens server-side over real foreign keys instead of a VLOOKUP on a hidden helper column — renamed or archived sources can never silently orphan deals (edge case 18).
2. "Collected NET" is computed from actual payments (Σ collected) instead of the sheet's `Booked − Outstanding` derivation, which diverges from real cash on overridden and cancelled receivables (§4 rule 7 and Open Question 1 — the sheet behavior is preserved as a documented discrepancy, not reproduced).
3. No 50-source cap; archived sources report as "(inactive)" buckets; zero rows are handled deliberately instead of as blank-driven artifacts.
4. Export, sorting, and drill-through (to a filtered deal list via M9) on every row.

**Definitions used on this screen (developer has no context — reproduce in help copy):**
- **Lead source** — the marketing/relationship channel that produced the deal (YouTube, Referral, Repeat Client, a listing portal like Lamudi, …). One per deal, picked from the M0 Lead Sources list at deal entry.
- **Booked NET GCI** — the commission income the agent *earned* on the deal: commission net of 12% VAT, plus any developer incentive (net), minus any referral fee the agent pays out (M1 Rule H). "Booked" = recognized when the deal is logged, regardless of whether cash has arrived.
- **Collected NET** — cash that has actually arrived, on the same Net-of-VAT basis (Σ of the deal's payment rows' Net-of-VAT amounts, from M4/M5). EWT withheld by the payor still counts as collected — it returns as an income-tax credit.
- **Outstanding NET** — what is still owed on open receivables (M4 balance). Booked money that has not arrived yet.
- **Resale + Rental vs Developer / Pre-selling** — resale commissions and rental fees are paid out shortly after closing (**fast** money); developer/pre-selling commissions are released in tranches tied to the buyer's payments to the developer, often across years (**slow** pipeline money). `deal_type = Developer` ⇒ slow bucket; `Resale` or `N/A` (rentals) ⇒ fast bucket.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. M7 tells them which of their lead channels produce money that actually arrives versus money stuck in pre-selling pipelines.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Decide where the next lead-gen peso goes: compare their channels on booked NET GCI *and* on cash that actually arrived; spot channels whose money is all stuck in developer pipelines; sanity-check that deals carry the right Source (a misattributed deal moves whole rows); pull the CSV for their own marketing review or a planning session with a coach/accountant (who receives exports, not a login, in v1). |
| *(v2, out of scope)* | *Brokerage/team roles — Owner/Rainmaker, Admin/ISA, Agent, Read-only (coach/accountant logins) — reviewing shared channel economics.* |

## 3. Data model

M7 is a **read-only projection** — it defines no persistent entities and writes nothing. It reads the M4 receivable (one row per deal) joined to its M1 deal and M0 lead source.

### 3.1 Query parameters

| Param | Type | Required | Validation / Default | Notes |
|---|---|---|---|---|
| workspace_id | uuid | ✔ | tenant scope | as everywhere |
| year | int \| `"all"` | ✔ | default `"all"`; if int, must be a year with ≥1 booked deal | Compares **deal.booked_year** (booking year). **Never** the payment year — a 2026-booked deal collected in 2028 stays in the 2026 row. |

### 3.2 Source fields read (per receivable, joined to deal)

| Field | From | Meaning |
|---|---|---|
| lead_source_id | M1 deal | FK to M0 LeadSource (active or archived) |
| deal_type | M1 deal | `Developer` \| `Resale` \| `N/A` (rentals) |
| booked_year | M1 deal | year(booked_date) — the filter key |
| booked_net_gci | M4 receivable | the deal's NET GCI (Net of VAT, + net incentive, − referral out) |
| collected | M4 receivable | Σ payment Net-of-VAT amounts for the deal (commission AND incentive payments both count) |
| balance | M4 receivable | Open: `total_collectible − collected`; Closed: 0 (difference lives in Variance); Cancelled: 0 (written off) |
| status | M4 receivable | `Open` \| `Closed` \| `Cancelled` |

⚠ **Base note for developers:** `balance` is computed against **Total Collectible** (full cash expected in — which on deals with referral-outs or a Confirmed Collectible override is NOT equal to booked NET GCI), while `booked_net_gci` is the earned figure. The two columns share a ₱ unit but not a base. This is why `Booked − Outstanding` is not a valid "collected" formula (§4 rule 7).

### 3.3 Report row (SourcePerformanceRow) — one per lead source

Let `S` = the set of receivables whose deal has this lead source and (if year ≠ all) `booked_year = year`. All columns computed; none editable. Full-precision decimals internally; round half-up to 2 dp only at display/export (M1 rounding policy).

| # | Column | Formula | Worked ₱ (all-time fixture, imported v30.20 workbook) |
|---|---|---|---|
| 1 | Source | LeadSource.name; archived → `name + " (inactive)"` | `YouTube` |
| 2 | Deals | `count(S)` | YouTube = 7 (D006, D011–D015, D021) |
| 3 | Booked NET GCI ₱ | `Σ booked_net_gci over S` | YouTube = 352,500 + 155,803.57 + 206,696.43 + 906,752.23 + 401,965.08 + 77,232.14 + 354,591.84 = **₱2,455,541.29** |
| 4 | % of NET GCI | `Booked(source) ÷ Booked(TOTAL)` | 2,455,541.29 ÷ 6,688,497.25 = **36.71%** |
| 5 | Avg NET GCI / deal | `Booked ÷ Deals` | 2,455,541.29 ÷ 7 = **₱350,791.61** |
| 6 | Collected NET ₱ | `Σ collected over S` (**spec default** — see §4 rule 7; sheet derives `Booked − Outstanding` instead, Open Question 1) | YouTube = 352,500 (D006) + 44,642.86 (D021 incentive release) = **₱397,142.86** |
| 7 | % Collected | `Collected ÷ Booked` | 397,142.86 ÷ 2,455,541.29 = **16.17%** |
| 8 | Outstanding NET ₱ | `Σ balance over S` | YouTube = 155,803.57 + 206,696.43 + 906,752.23 + 401,965.08 + 77,232.14 + 309,948.98 (D021) = **₱2,058,398.44** |
| 9 | Resale + Rental NET GCI ₱ | `Σ booked_net_gci over S where deal_type ≠ Developer` | YouTube = **₱352,500** (D006 only) |
| 10 | Resale + Rental Outstanding ₱ | `Σ balance over S where deal_type ≠ Developer` | YouTube = **₱0** (D006 closed) |
| 11 | Developer / Pre-selling NET GCI ₱ | `Σ booked_net_gci over S where deal_type = Developer` | YouTube = 2,455,541.29 − 352,500 = **₱2,103,041.29** |

Columns 9–11 are the fast/slow lens: 9 and 10 are the fast-collecting money (resale closes and rentals pay quickly), 11 is the slow pipeline money (developer tranches). The sheet carries no "Developer Outstanding" column — it is implied (`col 8 − col 10`); keep it that way (parity), expose it in export only if trivial.

### 3.4 Worked row walk-through — Repeat Client (exercises resale, rental, and developer deals in one row)

In-scope deals (Year = All), from the imported workbook:

| Deal | Type (bucket) | Booked NET GCI | Status | Collected | Balance |
|---|---|---|---|---|---|
| D002 | Resale (fast) | 126,500.00 | Open | 0.00 | 126,500.00 |
| D003 | Resale (fast) | 117,500.00 | Open | 0.00 | 117,500.00 |
| D005 | Resale (fast) | 675,000.00 | Open | 0.00 | 675,000.00 |
| D007 | Resale (fast) | 180,000.00 | Open | 0.00 | 180,000.00 |
| D008 | Developer (slow) | 317,414.70 | Open | 0.00 | 317,414.70 |
| D017 | Rental, N/A (fast) | 22,500.00 | Closed | 22,500.00 | 0.00 |
| D018 | Rental, N/A (fast) | 130,000.00 | Closed | 130,000.00 | 0.00 |
| D019 | Rental, N/A (fast) | 10,000.00 | Closed | 10,000.00 | 0.00 |
| D020 | Rental, N/A (fast) | 37,500.00 | Closed | 37,500.00 | 0.00 |

Column by column:

```
Deals              = 9
Booked NET GCI     = 126,500 + 117,500 + 675,000 + 180,000 + 317,414.70
                     + 22,500 + 130,000 + 10,000 + 37,500          = ₱1,616,414.70
% of NET GCI       = 1,616,414.70 ÷ 6,688,497.25                   = 24.17%
Avg NET GCI/deal   = 1,616,414.70 ÷ 9                              = ₱179,601.63
Collected NET      = 22,500 + 130,000 + 10,000 + 37,500            = ₱200,000.00
% Collected        = 200,000 ÷ 1,616,414.70                        = 12.37%
Outstanding NET    = 126,500 + 117,500 + 675,000 + 180,000
                     + 317,414.70                                  = ₱1,416,414.70
R+R NET GCI        = booked where type ≠ Developer
                   = 1,616,414.70 − 317,414.70                     = ₱1,299,000.00
R+R Outstanding    = 126,500 + 117,500 + 675,000 + 180,000         = ₱1,099,000.00
Developer NET GCI  = D008 only                                     = ₱317,414.70
```

How the agent reads it: of Repeat Client's ₱1.42M outstanding, only ₱317K is slow developer pipeline — ₱1.1M is fast resale money that should land soon (chase it on M6). Contrast YouTube: ₱2.06M outstanding, effectively all of it developer-tranche money that no amount of chasing accelerates. Same "Outstanding" column, opposite management action — that contrast is this module's reason to exist.

### 3.5 TOTAL row

- Deals, Booked, Collected, Outstanding, cols 9–11: **sum of the source rows** (equivalently, aggregate over all in-scope receivables).
- **% of NET GCI = 100.00%** by construction.
- **% Collected recomputes at total level**: `Collected(TOTAL) ÷ Booked(TOTAL)` — never the average of row percentages. Fixture: 1,908,192.86 ÷ 6,688,497.25 = **28.53%**.
- **Avg NET GCI/deal recomputes**: `Booked(TOTAL) ÷ Deals(TOTAL)` = 6,688,497.25 ÷ 21 = **₱318,499.87**.

## 4. Business rules & edge cases

1. **Booking-year scoping.** The year filter buckets deals by **booked year only**. Money collected in 2028 against a 2026 deal appears in the 2026 row (with year = 2026 or all). The paid-year view of cash is M8's job (vintage matrix), not M7's — see Open Question 3.
2. **Every referenced source reports — never orphan (edge case 18).** Because deals store `lead_source_id` (FK), a rename in M0 propagates to the row label automatically, and an archived source **still gets a row**, labeled `"Name (inactive)"`, as long as ≥1 in-scope deal references it. Deleting a referenced source is impossible (M0 rule — archive only). There is no code path in which a deal's NET GCI silently drops out of this report.
3. **Zero-deal rows.** An **active** source with 0 in-scope deals renders as a row of zeros (the agent should see channels producing nothing — that is a finding, not noise). An **archived** source with 0 in-scope deals is hidden. (Sheet parity note: the sheet shows all 50 Settings slots with blank-driven zeros; the SaaS makes the visibility rule deliberate.)
4. **Booked-but-nothing-collected year (edge case 19).** Year filter = a year that has deals booked but zero payments → rows show full Booked NET GCI with Collected ₱0.00 and % Collected 0.00% — **not** an empty row and not an error state.
5. **Cancelled deals are included in Booked** (sheet parity): a cancelled deal's booked_net_gci still counts in columns 3–5 and 9/11; its balance is 0 (written off) so it inflates % Collected under the sheet's derivation — one of the two reasons rule 7 exists. Whether cancelled deals should instead be excluded or badged is Open Question 2.
6. **No sources configured / no deals at all** → empty state, not an empty table (§6).
7. **Collected NET = Σ collected (actual cash, Net of VAT) — NOT `Booked − Outstanding`.** The sheet derives column 6 as `F = C − H` (Booked − Outstanding). That derivation is wrong in two documented situations, because `balance` is kept against **Total Collectible**, not booked NET GCI (§3.2 base note):
   - **Receivable override / pass-through cash.** D004: booked NET 800,000 (₱875,000 commission − ₱75,000 referral-out), Total Collectible 875,000, fully collected → outstanding 0. Sheet formula: 800,000 − 0 = **₱800,000**. Actual cash collected: **₱875,000**. The ₱75,000 the agent collected and then paid out to the referrer vanishes from the sheet's figure.
   - **Cancelled with partial collections.** Cancel a deal booked 500,000 with 100,000 collected → balance written off to 0. Sheet formula: 500,000 − 0 = 500,000 "collected"; actual cash = 100,000.
   The spec default is the honest figure (Σ collected); the sheet's derivation is preserved only as Open Question 1 for the product owner to sign off the change.
8. **% Collected may exceed 100%.** Consequence of rule 7: D004's source row (Referral) shows 875,000 ÷ 800,000 = **109.38%** — truthfully, cash in exceeded earned NET GCI because referral-out cash passes through. Display as computed with a footnote/tooltip ("cash collected includes amounts passed through to referrers"); do not cap. Denominator choice is Open Question 4.
9. **All percentages computed from full-precision aggregates**, then rounded for display. Never sum display-rounded per-deal values: YouTube's Outstanding is ₱2,058,398.44 from full precision; summing the 2-dp per-deal figures gives ….43 — a visible centavo drift (edge case 15 discipline).
10. **Default ordering:** Booked NET GCI descending (scorecard reading order), TOTAL row pinned last; all columns sortable. (Sheet order is Settings-list order — offer it as a secondary sort, not the default.)
11. **Read-only.** M7 never mutates anything. Misattributed source? Fix the deal in M1 (audit-trailed); M7 reflects it on next read.
12. **Recomputation triggers:** any deal create/update/archive (M1 events), payment create/update/delete (M5 events), receivable status/override change (M4 events), or lead-source rename/archive (M0) invalidates the aggregate for the affected workspace/year slices.

## 5. Functional requirements

- **FR-M7-01** The report endpoint returns, for a workspace and a year param (`all` or a booking year), one SourcePerformanceRow per visible lead source (§4 rules 2–3) plus the TOTAL row, computed server-side per §3.3–3.5.
- **FR-M7-02** Year filter offers `All` plus exactly the distinct booked years present in the workspace's deals; selection is applied server-side (no client-side re-aggregation).
- **FR-M7-03** Collected NET is computed as Σ receivable.collected (spec default per §4 rule 7); the implementation isolates this in one function so a product-owner decision on Open Question 1 is a one-line change.
- **FR-M7-04** Archived lead sources with in-scope deals appear as `"Name (inactive)"` rows; renames propagate on next read with no data migration (edge case 18).
- **FR-M7-05** Active sources with zero in-scope deals render zero rows; archived sources with zero in-scope deals are omitted (§4 rule 3).
- **FR-M7-06** A year with booked deals and no collections returns rows with Booked > 0, Collected = 0, % Collected = 0.00% (edge case 19).
- **FR-M7-07** TOTAL row: sums for counts and ₱ columns; % Collected and Avg NET GCI/deal recomputed from totals; % of NET GCI = 100%.
- **FR-M7-08** CSV/XLSX export of the current view (year filter applied, TOTAL row included, ₱ values to the centavo, percentages to 2 dp).
- **FR-M7-09** Each source row links to the deal list filtered to that source + year (M9 cross-link; nice-to-have — degrade to no link until M9 ships).
- **FR-M7-10** The signed-in agent can view and export; no mutations exist on any M7 route (server enforces read-only).
- **FR-M7-11** Report responds < 500 ms P95 at 1,000 deals / 1,000 payments (NFR §8), via aggregate query or cached projection invalidated per §4 rule 12.
- **FR-M7-12** Money renders ₱ #,##0.00; percentages 0.00%; zero-₱ cells render `₱ 0.00` (not blank — blank is the sheet artifact this replaces).

## 6. UI/UX requirements

- **Screen:** "Source Performance" under Reports/Analytics nav. Header row: Year filter (`All ▾` default), export button, a one-line caption preserving the sheet's framing: *"NET GCI by lead source — earned & yours (net of VAT & referral-outs, EWT retained). Resale + Rental = fast-collecting; Developer / Pre-selling = slow pipeline."*
- **Layout sketch (desktop):**

```
SOURCE PERFORMANCE                    Year: [All ▾]        [Export ▾]
NET GCI by lead source — earned & yours (net of VAT & referral-outs, EWT retained).
Resale + Rental = fast-collecting · Developer / Pre-selling = slow pipeline.

                    |—— Production ————————————| |—— Cash ——————————————| |—— Fast vs slow ——————|
Source              Deals  Booked ₱      %    Avg│ Collected ₱  %Coll  Outst ₱│ R+R ₱   R+R Out  Dev ₱
YouTube               7   2,455,541.29 36.71% …  │  397,142.86 16.17%  2,058,…│ 352,500   0.00  2,103,…
Repeat Client         9   1,616,414.70 24.17% …  │  200,000.00 12.37%  1,416,…│ 1,299,… 1,099,…  317,…
Lamudi (inactive)     2     863,003.13 12.90% …  │  436,050.00 50.53%    426,…│ 436,050   0.00   426,…
Referral              1     800,000.00 11.96% …  │  875,000.00 109.38%ⓘ    0.00│ 800,000   0.00     0.00
…zero rows for remaining active sources…
──────────────────────────────────────────────────────────────────────────────────────────────────
TOTAL                21   6,688,497.25 100.00% … │ 1,908,192.86 28.53% 4,855,…│ 2,887,… 1,099,… 3,800,…
```
- **Table:** 11 columns per §3.3, sticky header, TOTAL row pinned and visually distinct, default sort Booked NET GCI desc. Column group headers: *Production* (Deals, Booked, %, Avg) · *Cash* (Collected, % Collected, Outstanding) · *Fast vs slow* (Resale+Rental GCI, Resale+Rental Outstanding, Developer GCI).
- **Inline states:** `(inactive)` suffix rendered as a muted badge on archived sources; % Collected > 100% gets the pass-through tooltip (§4 rule 8); % Collected cell may carry a subtle heat treatment (low % + high Developer share = the "stuck money" pattern the report exists to expose) — cosmetic, not a requirement.
- **Computed-only convention:** every cell uses the product-wide locked/computed affordance (M0 §6); there are no inputs on this screen except the Year filter.
- **Drill-through:** source name / Deals count click → M9 deal list pre-filtered to source + year (FR-M7-09).
- **Empty states:** no deals at all → "No deals logged yet — Source Performance fills in as deals are logged with a lead source." No sources configured → link to M0 Lead Sources settings.
- **Mobile (360 px):** rows collapse to cards: source name + Booked, % of NET GCI, % Collected, and a fast/slow split bar; full table behind horizontal scroll.
- **₱ formatting** everywhere: `₱ 2,455,541.29`.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M0 | LeadSource: id, name, archived_at (active **and** archived — the report must see archived; M0 FR-M0-09's reporting API) |
| reads ← | M1 | deal: lead_source_id, deal_type, booked_year (via the M4 receivable's deal join) |
| reads ← | M4 | receivable: booked_net_gci, collected, balance, status (balance semantics per M4: Open = total_collectible − collected; Closed/Cancelled = 0) |
| reads ← | M5 | indirectly — payments roll up into receivable.collected (M7 never reads payment rows directly; the receivable is the single aggregation point) |
| links → | M9 | source row → deal search pre-filtered (source, year) — read-only navigation, no data dependency |
| writes → | — | **nothing** (read-only module) |

Sheet-lineage mapping for the importer team (no M7 import work exists — the report recomputes from imported M1/M4/M5 data): sheet Source Performance col C = Booked ΣH, col F = the retired `C − H` derivation, col H = Outstanding ΣL, source join = Collectibles helper col Y (VLOOKUP → Deal Log col J).

## 8. Non-functional requirements

- **Performance:** < 500 ms P95 at 1,000 deals / 1,000 payments / 60 sources; year filter change < 500 ms (server round-trip included). Aggregation is one grouped query or a maintained projection — never N+1 per source.
- **Consistency:** figures must tie to sibling modules on the same data: TOTAL Outstanding = M6 Position "Balance Outstanding" (fixture: ₱4,855,304.39); TOTAL Booked = M2 all-operations GCI (₱6,688,497.25); TOTAL Collected = M6 "Total Collected Net" (₱1,908,192.86). A cross-module consistency test asserts these.
- **Precision:** decimal arithmetic end to end; display rounding only at the edge (§4 rule 9).
- **Permissions:** auth + absolute tenant isolation (M0); no write surface, so no friction gates apply here; read-only routes are already v2-role-ready.
- **Auditability:** none needed (no mutations); export actions may be access-logged per cross-cutting policy.

## 9. Acceptance criteria (Given/When/Then)

Fixture basis: the v30.20 workbook imported (21 deals, 8 payments, D004 override + statuses intact — M1 FR-M1-10). All figures verified by independent decimal recomputation.

1. **Given** the imported workspace **When** Source Performance loads with Year = All **Then** the table shows exactly:

| Source | Deals | Booked NET GCI | % of NET GCI | Avg/deal | Collected NET | % Coll. | Outstanding | R+R GCI | R+R Outst. | Dev GCI |
|---|---|---|---|---|---|---|---|---|---|---|
| YouTube | 7 | 2,455,541.29 | 36.71% | 350,791.61 | 397,142.86 | 16.17% | 2,058,398.44 | 352,500.00 | 0.00 | 2,103,041.29 |
| Repeat Client | 9 | 1,616,414.70 | 24.17% | 179,601.63 | 200,000.00 | 12.37% | 1,416,414.70 | 1,299,000.00 | 1,099,000.00 | 317,414.70 |
| Lamudi | 2 | 863,003.13 | 12.90% | 431,501.56 | 436,050.00 | 50.53% | 426,953.13 | 436,050.00 | 0.00 | 426,953.13 |
| Referral | 1 | 800,000.00 | 11.96% | 800,000.00 | 875,000.00 | 109.38% | 0.00 | 800,000.00 | 0.00 | 0.00 |
| Sphere / Personal Network | 1 | 630,813.93 | 9.43% | 630,813.93 | 0.00 | 0.00% | 630,813.93 | 0.00 | 0.00 | 630,813.93 |
| Facebook Organic | 1 | 322,724.20 | 4.83% | 322,724.20 | 0.00 | 0.00% | 322,724.20 | 0.00 | 0.00 | 322,724.20 |
| **TOTAL** | **21** | **6,688,497.25** | **100.00%** | **318,499.87** | **1,908,192.86** | **28.53%** | **4,855,304.39** | **2,887,550.00** | **1,099,000.00** | **3,800,947.25** |

   Plus zero rows for the other seven active seed sources (Open House, Sign Call / Walk-in, Facebook Ads, TikTok, Instagram, LinkedIn, Website). Grand total ties out: 6,688,497.25 = 6,488,497.25 (sales) + 200,000.00 (rentals).
2. **Given** the same workspace **When** Year = 2026 **Then** the table equals criterion 1 exactly (all live deals are 2026-booked) — proving the filter compares booking year.
3. **Given** the D004 receivable (booked NET 800,000; Total Collectible 875,000; collected 875,000; Closed, balance 0) **Then** the Referral row shows Collected NET **₱875,000.00** and % Collected **109.38%** — NOT the sheet-derived ₱800,000.00 / 100% (Open Question 1's divergence, asserted as the spec default).
4. **Given** "YouTube" renamed to "YouTube Organic" in M0 **When** the report reloads **Then** the same 7 deals / ₱2,455,541.29 appear under "YouTube Organic" — one row, no orphan bucket, no leftover "YouTube" row (edge case 18).
5. **Given** "Lamudi" archived in M0 **Then** its row renders as "Lamudi (inactive)" with unchanged figures (2 deals, ₱863,003.13); **Given** "TikTok" (0 deals) archived **Then** its zero row disappears (§4 rule 3).
6. **Given** a synthetic deal booked 2027-01-15 (Developer, booked NET ₱500,000, no payments) **When** Year = 2027 **Then** its source row shows Deals 1, Booked ₱500,000.00, Collected ₱0.00, % Collected 0.00%, Outstanding ₱500,000.00 — not an empty row (edge case 19); and Year = All's TOTAL Booked increases by exactly ₱500,000.00.
7. **Given** a synthetic Cancelled deal (booked NET 500,000, collected 100,000, balance written off to 0) **Then** its source row counts Booked +500,000, Collected +100,000, Outstanding +0 — and under the sheet's `Booked − Outstanding` derivation the same row would claim 500,000 collected (regression test documenting why rule 7 stands).
8. **Given** the Year dropdown **Then** it lists All + {2026} for the fixture workspace (plus 2027 after criterion 6's deal exists) — never years with no booked deals.
9. **Given** the signed-in agent **When** exporting **Then** CSV/XLSX matches the on-screen rows to the centavo, TOTAL included; **and** any write attempt against M7 routes returns 405/403.
10. **Given** 1,000 synthetic deals across 60 sources **Then** the report and each year-filter change render < 500 ms P95, and TOTAL Outstanding equals M6's Balance Outstanding on the same fixture (cross-module consistency, §8).

## 10. Out of scope / future

- **Paid-year cash lens** (cash collected per source per collection year) — the sheet has only the booking-year lens; the vintage view of cash timing is M8's matrix. A per-source paid-year cut is future (Open Question 3).
- **Per-source conversion metrics** (deals ÷ leads, cost per NET GCI ₱) — requires lead-volume and spend data that does not exist in this product yet; ties to M3's funnel math once a lead-gen module exists.
- **Charts/visualization** beyond the table (fast/slow split bars are cosmetic).
- **Developer Outstanding as an on-screen column** (implied = Outstanding − R+R Outstanding; sheet parity keeps it off-screen).
- No writes, no per-deal drill-in beyond the M9 cross-link, no source-level targets or budgets, no tax columns (that detail lives in M5/M8 by v30.20 design).

## 11. Open questions

1. **Collected NET derivation (spec default vs sheet).** The sheet computes Collected NET = `Booked − Outstanding` (col F = C − H), not Σ payments — and because `balance` is kept against **Total Collectible** while Booked is **NET GCI**, the subtraction mixes bases. Worked divergence: **D004 — booked NET 800,000, collected 875,000, outstanding 0 → sheet gives 800,000 − 0 = ₱800,000; actual collected cash is ₱875,000.** Cancelled-with-partial-collections diverges the same way (write-off zeroes the balance, so the sheet claims full collection). Spec default implements **Σ receivable.collected**. Product owner to confirm the deliberate departure from sheet parity (recommended: yes).
2. **Cancelled deals in Booked.** The sheet includes cancelled deals' booked NET GCI in every production column. Keep (parity), exclude, or badge (e.g., "incl. ₱X cancelled")? Recommendation: keep + badge; excluding silently would make M7 disagree with M2's booked figures.
3. **Paid-year lens.** Should M7 also offer a "cash collected per source per payment year" view? The sheet has only the booking-year filter; per-source cash timing currently requires mentally combining M7 with M8's vintage matrix. Recommendation: fast-follow after M8, reusing M8's paid-year aggregation.
4. **% Collected denominator.** With Collected = Σ actual cash, should % Collected divide by Booked NET GCI (spec default; D004 → 109.38%, honest but >100%) or by Σ Total Collectible (D004 → 100%, capped but a mixed lens)? Recommendation: keep Booked with the pass-through tooltip; revisit if users misread >100% rows.
5. **Fixture correction to record:** the module brief circulated with YouTube Booked = ₱2,455,541.30; exact decimal recomputation (full-precision sum 2,455,541.2946…) and the 2-dp per-deal sum both give **₱2,455,541.29**. The PRD's fixture tables use .29. Flagging per the no-silent-resolution rule.
