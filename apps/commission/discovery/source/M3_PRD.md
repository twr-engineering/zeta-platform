# M3 — GCI Calculator & Goal Planning — PRD

**Product:** ZETA GCI + Collections · **Module:** M3 · **Source of truth:** v30.20 workbook — *GCI Calculator* sheet (named ranges `PlanYear`, `TargetTable`, `AllTimeYield`, `AllTimePrice`) · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every business rule is stated in full with formulas and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M3 turns a **net-income goal** into everything the agent must *do* to hit it: a GCI (commission income) goal, a deal count, and two lead-generation activity funnels (seller side and buyer side) — then tracks **pace**: total sales volume required vs. what has actually been booked this year. It is the MREA-style planning layer of the product; in v1 the per-year targets and funnels are the individual agent's **personal business plan** — MREA planning applies to a solo agent exactly as it does to a team. It computes; it does not store deal data.

**Spreadsheet behavior it replaces.** The *GCI Calculator* sheet holds: a planning-year selector (`PlanYear` = D4); a per-year TARGETS table (`TargetTable` = B42:G48, rows 2026–2032) with Net Income Target, Opex %, Cost-of-Sales %, and optional Yield / Avg Price overrides; an economic-model block that derives the GCI goal; goal rows broken Yearly / Monthly / Weekly; two conversion funnels with editable rate cells; and a pace block (Total Sales required, YTD actual, balance). Two green "linked" cells pull the **planning basis** — all-time blended yield and all-time blended average sale price — live from the Yield Summary sheet (M2). A hidden scratch block (Q7:T13) holds a personal side calculation (see §11 OQ-2).

**What improves in SaaS form.**

1. The per-year targets become real, validated records (unlimited years, not 7 fixed rows), with an explicit "use default / use all-time" state instead of the sheet's magic blank-or-zero cells.
2. Planning math becomes a pure, unit-tested server-side function library — the same discipline as M1's commission engine; the UI never computes money.
3. The planning basis links to M2 without fragile cross-sheet references; an empty basis (no deals yet) becomes a designed empty state instead of a `#DIV/0!`.
4. Impossible inputs (Opex % + CoS % ≥ 100%, zero conversion rates) are validation errors instead of silent division-by-zero.
5. Target changes are audit-trailed — the annual goal drives the dashboard pace line (M6), so it is financial in effect.

**Domain glossary (reproduce — the developer has no context):**

- **GCI** — Gross Commission Income, always stated **Net of VAT** in this product (M1 strips the 12% output VAT). The planning goal is a GCI figure.
- **Net Income Target (NIT)** — the profit the agent wants to keep for the year, after operating expenses and cost of sales.
- **Opex %** — operating expenses as a share of GCI (salaries, rent, tools). Default 22%.
- **Cost of Sales % (CoS %)** — direct cost of producing deals as a share of GCI (e.g., internal splits/agency costs). Default 10%.
- **Yield (blended)** — realized NET GCI ÷ sales volume across all sales deals; the % of a property's price the agent actually earns. From M2.
- **Blended average sale price** — total sales volume ÷ number of sales deals. From M2.
- **Planning basis** — the pair (all-time blended yield, all-time blended avg price) from M2 (`AllTimeYield`, `AllTimePrice`); used whenever a year has no manual override.
- **Professional Fees per deal** — expected NET GCI earned on one average deal = avg price × yield.
- **Listing SOLD** — a closed seller-side transaction. **Buyer ATP** (Authority/Agreement to Purchase) — a closed buyer-side commitment. The agent typically sits on **both sides of each deal**, so the two targets are the same number tracking parallel sides of the same transactions, not additive deal counts.
- **Funnel** — the activity ladder Lead → Contact → Appointment/Viewing → Listing taken/ATP → Sold, connected by conversion rates. Planning divides *upward*: to get X sold you need X ÷ rate at the step above.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent — their own Rainmaker, planning their own year and tracking their own funnels.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Set their yearly Net Income Target and cost assumptions; ratify the GCI goal and deal count; maintain their own conversion-rate assumptions and keep future-year rows current; read their weekly funnel activity targets (leads/contacts/appointments per week) into the week's prospecting; watch pace vs. booked volume. |
| *(v2, out of scope)* | *Brokerage/team roles — Rainmaker sets targets and re-baselines rates, Admin/ISA maintains them, team Agents read the activity targets for their role — arrive with the next version.* |

## 3. Data model

All rates stored as exact decimals (never floats); money `decimal(14,2)` display / full-precision decimal internally. Entities carry `workspace_id` + audit fields (M0 conventions).

### 3.1 PlanYearTarget (one row per workspace per year — the sheet's `TargetTable`)

| Field | Sheet col | I/C | Type | Req | Validation / Default | Notes |
|---|---|---|---|---|---|---|
| year | B | I | int | ✔ | unique per workspace; any year ≥ 2000 | Sheet holds 2026–2032; SaaS is unlimited (add-a-year). |
| net_income_target | C | I | money | | `> 0` when set; **null → year not plannable** (rule 9) | 2026 live value: ₱11,500,000. |
| opex_pct | D | I | rate | | `0 ≤ r < 1`; **null → default 0.22** | Sheet treats blank **or 0** as "use default" (VLOOKUP fallback). SaaS: null = default; importer maps blank/0 → null (rule 10). |
| cos_pct | E | I | rate | | `0 ≤ r < 1`; **null → default 0.10** | Same blank/0 semantics as opex_pct. |
| yield_override | F | I | rate | | `0 < r < 1`; **null → AllTimeYield** (M2) | Sheet: blank or 0 → all-time realized. |
| avg_price_override | G | I | money | | `> 0`; **null → AllTimePrice** (M2) | Same semantics. |

### 3.2 FunnelRates (one row per workspace — the sheet's editable rate cells; global, not per-year — see §11 OQ-5)

| Field | I/C | Type | Validation | Default | Meaning (divide upward by this) |
|---|---|---|---|---|---|
| listing_to_sold | I | rate | `0 < r ≤ 1` | 0.25 | Listings SOLD ÷ r = Listings to take |
| listing_appointment_rate | I | rate | `0 < r ≤ 1` | 0.70 | Listings to take ÷ r = Listing Appointments |
| seller_contact_to_appt | I | rate | `0 < r ≤ 1` | 0.30 | Listing Appointments ÷ r = Seller Contacts |
| seller_lead_to_contact | I | rate | `0 < r ≤ 1` | 0.20 | Seller Contacts ÷ r = Seller Leads |
| buyer_viewing_to_atp | I | rate | `0 < r ≤ 1` | 0.30 | Buyer ATP ÷ r = Viewings |
| buyer_contact_to_viewing | I | rate | `0 < r ≤ 1` | 0.70 | Viewings ÷ r = Buyer Contacts |
| buyer_lead_to_contact | I | rate | `0 < r ≤ 1` | 0.10 | Buyer Contacts ÷ r = Buyer Leads |

### 3.3 Computed planning output (never persisted as authoritative data; recomputed on read)

All computed by the pure planning library (Rules P1–P13 below) for the selected plan year. Fixture column = 2026 live workbook state (NIT ₱11,500,000, opex/cos defaults, no overrides; planning basis = 17 sales deals, volume ₱159,280,945, NET GCI ₱6,488,497.25 → AllTimeYield 4.0736%, AllTimePrice ₱9,369,467.35).

| Output | Rule | Formula | 2026 fixture |
|---|---|---|---|
| net_income_pct | P2 | `1 − opex_eff − cos_eff` | 0.68 |
| gci_raw_target | P3 | `NIT ÷ net_income_pct` | ₱16,911,764.71 |
| working_gci_goal | P4 | `ROUNDUP(raw, nearest ₱10,000)` | ₱16,920,000 |
| price_eff / yield_eff | P5 | override else planning basis | ₱9,369,467.35 / 4.0736% |
| fees_per_deal | P6 | `price_eff × yield_eff` | ₱381,676.31 |
| listings_sold_needed | P7 | `working_gci_goal ÷ fees_per_deal` | 44.33 |
| buyer_atp_needed | P7 | `= listings_sold_needed` | 44.33 |
| monthly / weekly splits | P8 | `÷ 12`; weekly `= monthly ÷ 4` | GCI: 1,410,000 / 352,500 |
| seller funnel S1–S4 | P9 | divide upward | 177.32 / 253.32 / 844.40 / 4,221.98 |
| buyer funnel B1–B3 | P10 | divide upward | 147.77 / 211.10 / 2,110.99 |
| total_sales_required | P11 | `price_eff × buyer_atp ≡ goal ÷ yield_eff` | ₱415,355,587.83 |
| ytd_actual_sales | P12 | Σ list_price, plan year (see rule) | ₱161,680,945.00 |
| balance_to_target | P13 | `total_sales_required − ytd_actual` | ₱253,674,642.83 |

### 3.4 The planning engine (pure function; server-side only)

**Inputs:** PlanYearTarget row for the selected year + FunnelRates + planning basis (AllTimeYield, AllTimePrice from M2) + the M1 deal aggregates for Rule P12. **Outputs:** §3.3. Full-precision decimals throughout; round **only at display** (money 2 dp; counts 2 dp; yields 4 dp as %). Chaining display-rounded intermediates is forbidden — it drifts funnel counts by several hundredths (e.g., 177.33 instead of 177.32).

**Rule P1 — Effective assumptions:** `opex_eff = opex_pct if set else 0.22`; `cos_eff = cos_pct if set else 0.10`. (Sheet: blank/0 → default via VLOOKUP fallback.)

**Rule P2 — Net Income %:** `net_income_pct = 1 − opex_eff − cos_eff`. Must be `> 0`; otherwise the year is invalid — validation error "Opex % + Cost of Sales % must total less than 100%" (never a divide-by-zero downstream).
*Worked:* 1 − 0.22 − 0.10 = **0.68** (the agent keeps ₱0.68 of every GCI peso).

**Rule P3 — GCI raw target:** `gci_raw_target = net_income_target ÷ net_income_pct` — to *keep* NIT while spending opex+cos, the agent must *earn* NIT ÷ 68%.
*Worked ₱:* 11,500,000 ÷ 0.68 = 16,911,764.70588… → **₱16,911,764.71**.

**Rule P4 — Working GCI goal (auto round-UP):** `working_gci_goal = ceil(gci_raw_target ÷ 10,000) × 10,000` — the sheet computes `ROUNDUP(raw, −4)` automatically; this is a **rule, not a user-entered rounded goal** (workbook discrepancy item 4 — the task prompt's "the user may set a rounded working goal" describes the sheet incorrectly). Always rounds UP (never down — the goal never shrinks below what the income target requires); a raw target already at an exact ₱10,000 multiple is unchanged.
*Worked ₱:* ceil(16,911,764.71 ÷ 10,000) × 10,000 = 1,692 × 10,000 = **₱16,920,000**. Boundary: raw ₱16,910,000.00 → ₱16,910,000; raw ₱16,910,000.01 → ₱16,920,000.

**Rule P5 — Effective price and yield:** `price_eff = avg_price_override if set (> 0) else AllTimePrice`; `yield_eff = yield_override if set (> 0) else AllTimeYield`. The defaults are the **all-time realized** figures from M2 — planning is grounded in what the agent has actually earned per peso of volume, and moves live as deals are logged.
*Worked ₱ (2026, no overrides):* price_eff = 159,280,945 ÷ 17 = **₱9,369,467.35**; yield_eff = 6,488,497.25 ÷ 159,280,945 = 0.04073618… = **4.0736%**.

**Rule P6 — Professional Fees per deal:** `fees_per_deal = price_eff × yield_eff`. **No ÷ 1.12 here** — the yield is computed on NET GCI, which is already Net of VAT (M1 stripped it); dividing again would double-strip.
*Worked ₱:* 9,369,467.35 × 4.0736…% = **₱381,676.31**. Identity check at defaults: price × yield = (volume ÷ deals) × (GCI ÷ volume) = GCI ÷ deals = 6,488,497.25 ÷ 17 = ₱381,676.31 — the all-time NET GCI per sales deal.

**Rule P7 — Deals needed:** `listings_sold_needed = working_gci_goal ÷ fees_per_deal`; `buyer_atp_needed = listings_sold_needed` (both sides of the same transactions — see glossary; they are **not** added together).
*Worked:* 16,920,000 ÷ 381,676.31 = 44.3307578… → displayed **44.33**. Fractional deals are legitimate planning math — never round to integers silently (rule 6).

**Rule P8 — Time splits (applies to every goal row: GCI, Net Income, deals, every funnel stage):** `monthly = yearly ÷ 12`; `weekly = monthly ÷ 4` — i.e., **yearly ÷ 48: the model assumes 48 working weeks per year** (4 weeks/month; ~4 weeks of holidays/leave uncounted). State this assumption in UI copy (§11 OQ-4 for 52-week option).
*Worked ₱:* GCI 16,920,000 → monthly **₱1,410,000** → weekly **₱352,500**. Net Income 11,500,000 → 958,333.33 → 239,583.33. Deals 44.33 → 3.69 → 0.92.

**Rule P9 — Seller funnel (divide upward from deals needed; full precision at every step):**
```
S0 Listings SOLD        = listings_sold_needed                = 44.3307578…
S1 Listings to take     = S0 ÷ listing_to_sold        (0.25)  = 177.3230…  → 177.32
S2 Listing Appointments = S1 ÷ listing_appointment    (0.70)  = 253.3186…  → 253.32
S3 Seller Contacts      = S2 ÷ seller_contact_to_appt (0.30)  = 844.3954…  → 844.40
S4 Seller Leads         = S3 ÷ seller_lead_to_contact (0.20)  = 4,221.9769… → 4,221.98
```
Cross-check: S4 = S0 ÷ (0.25 × 0.70 × 0.30 × 0.20) = 44.3307578 ÷ 0.0105 = 4,221.98 ✔. Weekly view (P8): 4,221.98 ÷ 12 ÷ 4 = **87.96 seller leads/week**.

**Rule P10 — Buyer funnel:**
```
B0 Buyer ATP     = buyer_atp_needed                      = 44.3307578…
B1 Viewings      = B0 ÷ buyer_viewing_to_atp     (0.30)  = 147.7692…  → 147.77
B2 Buyer Contacts= B1 ÷ buyer_contact_to_viewing (0.70)  = 211.0988…  → 211.10
B3 Buyer Leads   = B2 ÷ buyer_lead_to_contact    (0.10)  = 2,110.9885… → 2,110.99
```

**Rule P11 — Total Sales required, and why two formulas are the same number:** the sheet computes `total_sales_required = price_eff × buyer_atp_needed` (J8 = D10 × D30). This is **mathematically identical** to `working_gci_goal ÷ yield_eff`:
```
price × deals = price × [goal ÷ (price × yield)] = goal ÷ yield   ∎
```
Implement either; test both ways.
*Worked ₱:* 16,920,000 ÷ 0.04073618… = **₱415,355,587.83** (= 9,369,467.3529… × 44.3307578…; full precision — multiplying the display-rounded 9,369,467.35 × 44.33 gives ₱415,348,487, off by ₱7,100, which is why chained display values are forbidden).

**Rule P12 — YTD actual sales (booked volume for the plan year):**
```
ytd_actual_sales = Σ list_price  (transaction = Sale,   representation ≠ Referrer, booked_year = plan year)
                 + Σ list_price  (transaction = Rental, representation ≠ Referrer, booked_year = plan year)
```
⚠ **The workbook INCLUDES rental volume** (a rental's list_price = its annual rent, per M1) in YTD actual, while the task prompt §3.7 mentions only sales — flagged as **OQ-1**; implement the sheet behavior by default. Referrer deals are excluded (referral fees have no sales volume of the agent's own). "YTD" is shorthand: the filter is *booked in the plan year*, whatever today's date — for a future plan year it reads ₱0.
*Worked ₱ (2026 live data):* 17 sales deals Σ = 159,280,945 + 4 rentals Σ = (270,000 + 1,560,000 + 120,000 + 450,000) = 2,400,000 → **₱161,680,945.00**.

**Rule P13 — Balance to target:** `balance_to_target = total_sales_required − ytd_actual_sales`. May be negative (target beaten) — display as ahead-of-target, never clamp.
*Worked ₱:* 415,355,587.83 − 161,680,945.00 = **₱253,674,642.83**.

## 4. Business rules & edge cases (numbered)

1. **Division-by-zero is unrepresentable.** `net_income_pct ≤ 0` (P2), any conversion rate ≤ 0 (§3.2 validation), or `fees_per_deal = 0` must be blocked at input — the engine never receives them (prompt edge case 15 discipline applied to planning).
2. **Round-up rule, exact boundary** (P4): raw target at an exact ₱10,000 multiple is unchanged; one centavo over rounds up a full step. The working goal is **never below** the raw target.
3. **Override precedence** (P5): a per-year override wins only when set and > 0; the sheet's blank-or-zero cells map to null ("use all-time"). The UI must show *which* basis each assumption is using (rule echoed in §6).
4. **No ÷1.12 in planning** (P6): yields are computed on Net-of-VAT GCI in M1/M2; re-dividing by 1.12 here would understate fees per deal by 10.7%. This is the single most likely developer error in this module — the fixture ₱381,676.31 catches it (÷1.12 would give ₱340,782.42).
5. **Empty planning basis** (no sales deals yet → AllTimeYield/AllTimePrice undefined, 0 ÷ 0): the year is computable **only** with both yield_override and avg_price_override set. Designed empty state (§6), not an error dump. A basis from rentals/referrals only is equally empty — M2's basis covers the *sales* segment.
6. **Fractional counts stay fractional.** Deals and funnel stages display at 2 dp (44.33 deals, 177.32 listings). Never silently `ceil()` to integers; a future "round up for the wall sheet" toggle is out of scope (§10).
7. **Full-precision chaining** (§3.4): every derived figure computes from unrounded upstream values. Test fixtures assert the 2-dp display of full-precision results; chained-display arithmetic (e.g., 44.33 ÷ 0.25 = 177.32 vs the correct 177.3230…) must fail the suite.
8. **Instant recalculation:** changing any conversion rate, target field, or override recomputes every affected output in the same interaction (< 100 ms perceived; §8). The sheet recalculates live; the SaaS must feel the same.
9. **Year not plannable without NIT:** a PlanYearTarget with null `net_income_target` produces no plan and no M6 target for that year (M6 then shows only its manual override, if any). The year row still persists (opex/cos/overrides can be staged early).
10. **Importer semantics:** the workbook's TargetTable rows import with blank/0 opex, cos, yield, price mapped to null; the 2026 row imports as NIT 11,500,000 / opex 0.22 / cos 0.10 stored explicitly (they are filled in the sheet). Funnel rates import from the sheet's rate cells.
11. **Plan-year selector** defaults to the current calendar year; selecting a year with no PlanYearTarget row offers to create it.
12. **Referrer exclusion in P12** mirrors M2's segment rules (Yield Summary excludes Referrer from sales and rental segments) — the pace figures and the planning basis stay on the same definition of "the agent's own volume."
13. **Audit trail:** every PlanYearTarget and FunnelRates mutation writes an M0 audit entry (old→new). The annual target drives M6's pace line — financial in effect.
14. **Permissions (v1):** the account owner edits targets and rates — there is no one else to gate. Because these edits restate planning figures (and move M6's pace line), they follow M0's friction-gate pattern: explicit confirmation on save (FR-M3-07's confirm step) plus the rule-13 audit entry. Auth + tenant isolation server-enforced; role gating is v2.
15. **Hidden scratch block excluded:** the sheet's Q7:T13 block ("Cost of Sale calculation", GCI 892,858, graduated 80/20–90/10–98/2 agency-split table with ₱123,000/₱250,000 breakpoints) is a personal side calculation justifying the CoS assumption — **not part of the product** (workbook discrepancy item 5; §11 OQ-2).

## 5. Functional requirements

- **FR-M3-01** The account owner can CRUD PlanYearTarget rows (unlimited years, unique per year); validation per §3.1; all mutations audit-logged.
- **FR-M3-02** The account owner can edit the seven FunnelRates with validation `0 < r ≤ 1`; defaults seeded at 25/70/30/20 and 30/70/10 on workspace creation.
- **FR-M3-03** The planning engine is a pure library `computePlan(target, rates, basis, ytdAggregates) → outputs` implementing Rules P1–P13; no I/O; the only code path producing planning figures (UI never computes).
- **FR-M3-04** Selecting a plan year renders the full economic model: NIT, opex/cos (with default indicators), net income %, raw GCI target, **working GCI goal with a visible "auto-rounded up to nearest ₱10,000" badge** showing the raw figure.
- **FR-M3-05** Effective price/yield display shows the value **and its source** ("all-time realized" vs "manual override for 2026"), updating live as M2's basis moves with new deals.
- **FR-M3-06** Goal rows (GCI, Net Income, Listings SOLD, Buyer ATP, every funnel stage) render Yearly / Monthly / Weekly per Rule P8, with the 48-week assumption stated in copy.
- **FR-M3-07** Both funnels render as stage ladders with inline-editable rates; any rate edit recomputes all outputs instantly (Rule 8) and persists on confirm.
- **FR-M3-08** Pace section shows total_sales_required, ytd_actual_sales, balance_to_target per Rules P11–P13, with the plan-year filter applied to booked deals.
- **FR-M3-09** A year with `net_income_pct ≤ 0` or missing NIT shows the specific validation/empty state, never an error page or NaN (rules 1, 9).
- **FR-M3-10** Empty planning basis (rule 5) blocks computation with an empty state requiring manual yield + price entry for the year.
- **FR-M3-11** M6 can read the TargetTable feed: for any year, `(net_income_target, opex_eff, cos_eff)` and the derived `working_gci_goal` — M6's annual GCI target = `ROUNDUP(NIT_year ÷ (1 − opex_eff − cos_eff), −4)` with M6's own manual override on top (§7).
- **FR-M3-12** The plan view (economic model + goals + funnels + pace) exports to CSV/XLSX (cross-cutting requirement).
- **FR-M3-13** Rule P12's YTD query reads M1 deals live (no stale cache beyond seconds); logging a deal in M1 moves ytd_actual on next view.

## 6. UI/UX requirements

- **One planning screen** per year, in the sheet's reading order: *Year selector* → *Economic model card* (NIT, opex %, cos % — each showing "default 22%/10%" when unset; net income %; raw target struck-through-small under the **working goal, large**, with the round-up badge) → *Assumptions row* (avg price, yield — source-labeled per FR-M3-05, edit-in-place creates the per-year override) → *Goals table* (rows = GCI, Net Income, Listings SOLD, Buyer ATP; columns = Yearly / Monthly / Weekly) → *Two funnel ladders* side by side (seller left, buyer right), each stage showing yearly / monthly / weekly counts and the editable rate between stages → *Pace card* (Total Sales required, YTD actual booked, Balance to go; ahead/behind coloring).
- **Targets table editor** (all years at once, mirroring `TargetTable`): rows per year, columns NIT / Opex % / CoS % / Yield override / Avg Price override; blank cells render the default/all-time value in placeholder styling — the sheet's blank-means-default made visible. "Add year" appends a row.
- **Input-vs-computed convention** (M0): the five target fields and seven rates are the module's only "blue" inputs; every other figure is locked with a formula tooltip (e.g., working goal: "= NIT ÷ 68%, rounded up to ₱10,000").
- **Override state** is visually distinct (the sheet turns override cells blue): a year using manual yield/price shows an "override" chip with one-click revert-to-all-time.
- **Empty states:** no PlanYearTarget for selected year → "Set a Net Income Target for 2027 to build the plan"; empty planning basis → "No closed sales deals yet — enter a working yield and average price to plan with" (rule 5, with both fields inline).
- **Validation states:** opex+cos ≥ 100% inline error on the offending fields (rule 1); rates outside (0,1] rejected on entry.
- **Number formats:** ₱ `#,##0.00`; counts 2 dp; yields 4 dp percent (4.0736%); conversion rates whole percents (25%).
- **Mobile (360 px):** cards stack; funnels become vertical ladders; targets table scrolls horizontally.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M2 | `AllTimeYield` (all-time sales NET GCI ÷ all-time sales volume), `AllTimePrice` (all-time sales volume ÷ sales deal count) — the planning basis, **live** (all-time, ignoring M2's report-year filter) |
| reads ← | M1 | per deal: `list_price`, `transaction_type`, `representation`, `booked_year` — Rule P12's YTD aggregate only |
| reads ← | M0 | auth/session + friction-gate confirmation pattern; audit log write path; ₱ formatting; workspace scoping |
| provides → | M6 | **TargetTable feed** per year: `net_income_target`, `opex_eff`, `cos_eff`, derived `working_gci_goal`. M6 Section-2 annual GCI target = `ROUNDUP(NIT ÷ (1 − opex − cos), −4)` — same Rule P3+P4 math, exposed as an API so M6 never re-implements it — then M6 applies its own manual-override cell on top. M6's year filter may differ from M3's selected plan year; the feed is per-year, not per-selection. |
| provides → | (export) | plan view CSV/XLSX |

M3 writes nothing to M1/M2/M4/M5 — it is a pure consumer plus the M6 feed.

## 8. Non-functional requirements

- Planning recompute (Rules P1–P11, P13) is in-memory pure math: < 10 ms server-side; end-to-end rate-edit-to-repaint < 100 ms perceived.
- Rule P12 aggregate over ≥ 1,000 deals: < 300 ms P95 (indexed on `workspace_id, booked_year, transaction_type, representation`).
- Full-precision decimal arithmetic throughout; display rounding only (edge case 15); fixture tests assert centavo/2-dp exactness.
- Auth + tenant isolation enforced server-side (schema v2-role-ready); PlanYearTarget/FunnelRates mutations confirmation-gated (M0 friction-gating) and audit-logged, immutable log.
- The TargetTable feed to M6 is cacheable with invalidation on any PlanYearTarget write.

## 9. Acceptance criteria

### 9.1 Self-verification — 2026 fixtures re-derived from THIS document's rules only

Performed in exact decimal arithmetic using only Rules P1–P13 as written above (not the source prompt, not the workbook's cached values). **These derivations are the module's canonical test fixtures.**

1. P1: opex/cos unset → 0.22 / 0.10. P2: 1 − 0.22 − 0.10 = **0.68** ✔
2. P3: 11,500,000 ÷ 0.68 = 16,911,764.70588… → **₱16,911,764.71** ✔
3. P4: ceil(16,911,764.70588… ÷ 10,000) = ceil(1,691.176…) = 1,692 → **₱16,920,000** ✔
4. P5: no overrides → price 159,280,945 ÷ 17 = 9,369,467.35294…; yield 6,488,497.25 ÷ 159,280,945 = 0.04073618… ✔
5. P6: 9,369,467.35294… × 0.04073618… = 6,488,497.25 ÷ 17 = 381,676.30882… → **₱381,676.31** ✔
6. P7: 16,920,000 ÷ 381,676.30882… = 287,640,000 ÷ 6,488,497.25 = 44.3307578… → **44.33** ✔
7. P9: 44.3307578 ÷ 0.25 = 177.3230… → **177.32**; ÷ 0.70 = 253.3186… → **253.32**; ÷ 0.30 = 844.3954… → **844.40**; ÷ 0.20 = 4,221.9769… → **4,221.98** ✔
8. P10: 44.3307578 ÷ 0.30 = 147.7692… → **147.77**; ÷ 0.70 = 211.0988… → **211.10**; ÷ 0.10 = 2,110.9885… → **2,110.99** ✔
9. P11: 16,920,000 ÷ 0.04073618… = **₱415,355,587.83** (±₱0.01) = 9,369,467.35294… × 44.3307578… ✔ (identity)
10. P12: 159,280,945 + (270,000 + 1,560,000 + 120,000 + 450,000) = **₱161,680,945.00** ✔. P13: 415,355,587.83 − 161,680,945.00 = **₱253,674,642.83** ✔

All figures reproduce from the written rules alone. ∎ *(Note: a naive chain from display-rounded values gives 177.33 / 253.33 / 844.43 at the funnel steps — those figures are display-rounding drift, not fixtures; see rule 7.)*

### 9.2 Given/When/Then criteria

1. **Given** the 2026 target row (NIT ₱11,500,000, opex 22%, cos 10%, no overrides) and the live planning basis (AllTimeYield 4.0736% = 6,488,497.25 ÷ 159,280,945; AllTimePrice ₱9,369,467.35 = 159,280,945 ÷ 17) **When** the 2026 plan renders **Then** it shows exactly: net income % 0.68; raw target ₱16,911,764.71; **working goal ₱16,920,000**; fees per deal **₱381,676.31**; Listings SOLD **44.33**; Buyer ATP **44.33**; GCI monthly ₱1,410,000 / weekly ₱352,500.
2. **Given** the same state **Then** the seller funnel shows 177.32 / 253.32 / 844.40 / 4,221.98 and the buyer funnel 147.77 / 211.10 / 2,110.99 (2-dp display of full-precision chaining per Rules P9–P10; chained-display arithmetic yielding 177.33 is a failure).
3. **Given** the same state **Then** pace shows Total Sales required ₱415,355,587.83 (±₱0.01; = 16,920,000 ÷ 0.04073618…), YTD actual ₱161,680,945.00 (17 sales ₱159,280,945 + 4 rentals ₱2,400,000), balance ₱253,674,642.83 — and computing P11 as `price_eff × buyer_atp` reproduces the same figure to the centavo (identity proof in Rule P11).
4. **Given** a raw target of exactly ₱16,910,000.00 **Then** working goal = ₱16,910,000; **given** ₱16,910,000.01 **Then** ₱16,920,000 (rule 2).
5. **Given** opex 60% and cos 40% **When** saving **Then** the row is rejected with the "must total less than 100%" error and no plan renders (rule 1).
6. **Given** seller_lead_to_contact changed 20% → 25% **When** confirmed **Then** Seller Leads recomputes 4,221.98 → **3,377.58** (844.3954 ÷ 0.25) instantly and an audit entry records `0.20 → 0.25`.
7. **Given** a 2027 row with yield_override 4.2% and avg_price_override ₱7,000,000 and NIT ₱11,500,000 **Then** fees per deal = 7,000,000 × 0.042 = **₱294,000.00**, deals needed = 16,920,000 ÷ 294,000 = **57.55**, and both assumptions show the "override" chip (rule 3).
8. **Given** a workspace with zero sales deals **When** opening planning **Then** the empty-basis state appears and entering yield + price inline unblocks the plan (rules 5, FR-M3-10).
9. **Given** a PlanYearTarget for 2028 with null NIT **Then** 2028 renders the "set a Net Income Target" state and M6's 2028 target feed returns nothing (rule 9).
10. **Given** a new deal booked in the plan year in M1 (Sale, ≠Referrer, list ₱10,000,000) **When** the plan reloads **Then** ytd_actual increases by exactly ₱10,000,000 and balance decreases by the same (FR-M3-13).
11. **Given** the v30.20 workbook imported **Then** the 2026 TargetTable row, funnel rates, and every §3.3 fixture figure reproduce; blank 2027–2032 rows import as years with null NIT (rule 10).
12. **Given** an unauthenticated request, or a session belonging to a different workspace's account, **When** it calls a target or rate mutation API **Then** 403/404 and no change (rule 14 — auth + tenant isolation).

## 10. Out of scope / future

- **The hidden scratch block** (graduated agency-split calculator, Q7:T13) — excluded pending §11 OQ-2; if ever wanted, it is a separate "cost-of-sales modeler" feature.
- Activity *actuals* tracking (logging real leads/contacts/appointments against the funnel targets) — the module plans activity; it does not record it.
- Multi-scenario / what-if planning (side-by-side plans per year); integer "wall sheet" rounding toggle; per-agent funnels or per-agent goal allocation; monthly seasonality curves (the model splits evenly ÷12); budget modeling beyond the two cost lines (full MREA budget is a future module); buyer-payment-cycle forecasting (product-wide exclusion).
- No automation of conversion-rate calibration from actuals (rates stay operator-owned assumptions).

## 11. Open questions

1. **Rental volume in YTD actual (workbook discrepancy 3).** The sheet's YTD ACTUAL SALES includes rental list prices (annual rent) alongside sales volume; the task prompt §3.7 mentions only sales. Rentals also sit *inside* the pace denominator's yield only via sales (planning basis is sales-only) — so including rental volume in the numerator is arguably inconsistent. **Default: implement sheet behavior (include rentals).** Confirm with product owner; if excluded, 2026 YTD becomes ₱159,280,945.
2. **Hidden scratch block (discrepancy 5).** Q7:T13 graduated agency-split table ("GCI 892,858") appears to be the owner's personal side calculation justifying CoS = 10%. Excluded from scope — confirm it needs no product home.
3. **Working-goal rounding configurability (discrepancy 4).** The sheet hard-codes ROUNDUP to the nearest ₱10,000. Should the SaaS allow (a) a different granularity, (b) a manual working-goal override at M3 level (M6 already has a dashboard-side override), or (c) exactly the sheet rule? Default: sheet rule, no knob.
4. **Weekly denominator: 48 vs 52.** Weekly = Monthly ÷ 4 (= yearly ÷ 48) per the sheet. Should a 52-week (or configurable working-weeks) option exist? Weekly activity targets differ ~8% between the two. Default: 48, assumption stated in UI.
5. **Per-year conversion-rate history.** The sheet has one global rate set; editing rates rewrites history (a 2027 plan and a 2026 retrospective share rates). Should FunnelRates become per-year (defaulting from the previous year)? Default: global, matching the sheet; schema keeps a `year` column nullable to allow the upgrade without migration pain.
