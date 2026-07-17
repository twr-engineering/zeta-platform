# M6 — Collections Dashboard — PRD

**Product:** ZETA GCI + Collections · **Module:** M6 · **Source of truth:** v30.20 workbook — *Collections Dashboard* sheet · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every business rule is stated in full with formulas in plain math notation and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M6 is the agent's Monday-morning command center for the collections side of the product: a single read-mostly screen that answers "how much commission am I owed, how much has actually landed, am I on pace for the year, who do I chase today, and is my data clean?" It aggregates M4's receivables, M5's payments, M1's deal fields, and M3's per-year targets into **eight fixed sections** (mirroring the sheet exactly):

1. **Collection Position** — lifetime expected vs. collected vs. outstanding, write-offs, realized variance, bank cash, referral fees owed out.
2. **Collected GCI vs Target** — the selected year's collections against the annual GCI target, with a **day-accurate pace** line.
3. **Cash & Tax Breakdown** — gross → VAT → EWT → net cash → retained cash across all collected payments.
4. **Aging of Open Balances** — open receivables bucketed by months since last activity.
5. **Receivables by Developer** — who owes what, per payor, plus collection speed.
6. **Monthly Cash-In** — month-by-month collections vs. a straight-line target for the selected year.
7. **Data Health** — bookkeeping hygiene checks; all ✓ = nothing to fix.
8. **Chase List** — every open balance, largest first, with a follow-up flag and an inline-editable Next Action note.

**Spreadsheet behavior it replaces.** The *Collections Dashboard* sheet computes all eight sections with SUMIFS/COUNTIFS over the Collectibles and Payments Log tabs, driven by one input cell: **Dashboard year (paid) C4** (= 2026 in the live file) plus a manual annual-target override cell (E15). The chase list is a SORT over a cached "Chase Priority" key; Next Action notes are edited over on the Collectibles tab and merely displayed here.

**What improves in SaaS form.**
1. Restatement is event-driven (a payment logged in M5 updates the dashboard within seconds) instead of formula recalculation over 1,000-row ranges.
2. Every tile and row is a **drill-down link** to the underlying records — the sheet's numbers are dead ends.
3. The Next Action note becomes editable **inline on the chase list** (writing through to M4), where the work actually happens.
4. Data Health checks (e) and (f) — "Property Type / Developer missing from Settings" — are **made unnecessary** by M0's referential integrity (see rule 17); the remaining checks become precise, tested predicates instead of fragile formulas.
5. The manual target override becomes a first-class, audited record instead of an anonymous cell.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. M6 is their Monday-morning command center — their own position, their own chase list, and they make the calls themselves.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Daily/weekly check of their own position; pace vs. their annual goal; work their own chase list top-down and decide which developer to call today; update Next Action notes after each follow-up call; spot short-paying developers via % collected and variance; verify referral payables before releasing them; clear Data Health flags (close fully-paid deals, set statuses, settle referral fees); set/clear the annual target override behind the standard confirmation + audit pattern. |
| *(v2, out of scope)* | *Brokerage/team roles — Owner/Rainmaker, Admin/ISA, Agent, Read-only (e.g., an accountant checking VAT/EWT totals) — with shared team dashboards and per-role edit rights.* |

## 3. Data model

M6 owns one small entity (the target override) plus one piece of view state (the year filter). Everything else is a **computed read model** — never stored as editable data, always derivable from M1/M3/M4/M5 (cache allowed per §8).

### 3.1 AnnualTargetOverride (owned by M6; the sheet's cell E15)

| Field | Type | Req | Editable | Validation / Default | Notes |
|---|---|---|---|---|---|
| workspace_id + year | fk + int | ✔ | no (key) | unique together | One optional override per year. |
| amount | decimal(14,2) | ✔ | owner | > 0 | Replaces the derived target for that year everywhere in M6. |
| note | string(240) | | owner | | Why the override exists (recommended; see Open Q 3). |
| audit fields | | ✔ | computed | | Every set/change/clear goes through the standard confirmation and is audit-logged (old→new). |

### 3.2 Dashboard view state

| Field | Type | Default | Notes |
|---|---|---|---|
| dashboard_year | int | current year in the workspace timezone (Asia/Manila) | **Filters sections 2 and 6 ONLY** (rule 1). Per-user view state, not workspace data (the sheet's C4 was one global cell). |

### 3.3 Read models — the eight sections

All money in exact decimals; display rounded half-up to centavos; percentages to 2 dp. Inputs referenced: `r.` = M4 receivable, `p.` = M5 payment, `d.` = M1 deal, `t.` = M3 TargetTable row, `s.` = M0 settings.

**Section 1 — COLLECTION POSITION (all deals, no year filter):**

| Metric | Formula | Worked ₱ (v30.20 fixture, 21 deals / 8 payments) |
|---|---|---|
| Total Collectible | Σ r.total_collectible (all statuses) | **₱6,763,497.25** (Σ booked NET GCI ₱6,688,497.25 with D004 overridden 800,000 → 875,000) |
| Total Collected Net | Σ r.collected_net (= Σ p.net_of_vat per deal; commission AND incentive payments both count) | **₱1,908,192.86** = 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86 |
| Balance Outstanding | Σ r.balance, where balance = total_collectible − collected_net for status Open, else 0 (rule 3) | **₱4,855,304.39** = 6,763,497.25 − 1,908,192.86 (no Closed-short or Cancelled rows in fixture) |
| % Collected | Total Collected Net ÷ Total Collectible | 1,908,192.86 ÷ 6,763,497.25 = **28.21%** |
| Written-off (Cancelled, uncollected) | Σ over status=Cancelled of (total_collectible − collected_net) | ₱0.00 (no Cancelled deals in fixture) |
| Variance realized (Closed short/over) | Σ over status=Closed of (collected_net − total_collectible) | ₱0.00 (all 7 Closed deals collected exactly) |
| Net Cash actually received | Σ p.net_cash (all payments) | **₱1,909,085.71** = 1,863,550.00 untaxed + 45,535.71 (D021 incentive) |
| Referral fees owed out | Σ d.referral_out where d.referral_out > 0 AND d.referral_paid ≠ Yes; caption "across N deal(s)" | **₱0.00 across 0 deal(s)** (D004's ₱75,000 has Referral Paid = Yes) |

**Section 2 — COLLECTED GCI vs TARGET (dashboard year, paid basis):**

| Metric | Formula | Worked ₱ (year 2026, today = 2026-07-17 Asia/Manila) |
|---|---|---|
| Annual GCI target | AnnualTargetOverride.amount if set for the year, else **ROUNDUP_10K**( t.net_income_target ÷ (1 − t.opex_pct − t.cos_pct) ), where ROUNDUP_10K(x) = ⌈x ÷ 10,000⌉ × 10,000 (always rounds UP) | 11,500,000 ÷ (1 − 0.22 − 0.10) = 11,500,000 ÷ 0.68 = 16,911,764.71 → **₱16,920,000** |
| Collected Net (year) | Σ p.net_of_vat where year(p.paid_date) = dashboard_year | **₱1,908,192.86** (all 8 payments paid in 2026) |
| % of target | Collected Net (year) ÷ Annual GCI target | 1,908,192.86 ÷ 16,920,000 = **11.28%** |
| Pace to date (day-accurate) | MIN(1, MAX(0, (today − Jan 1 of dashboard_year + 1) ÷ days_in_year)) × Annual GCI target; days_in_year = 366 in leap years, else 365 | 2026-07-17 is day (197 + 1) = **198** of 365 → 198 ÷ 365 = 54.2466% → × 16,920,000 = **₱9,178,520.55** |
| vs pace | Collected Net (year) − Pace to date; label **"ahead"** if ≥ 0 else **"behind"** | 1,908,192.86 − 9,178,520.55 = −7,270,327.69 → **"behind by ₱7,270,327.69"** |

**Section 3 — CASH & TAX BREAKDOWN (all collected, no year filter):**

| Metric | Formula | Worked ₱ (fixture: 7 untaxed payments + 1 Inclusive ₱50,000) |
|---|---|---|
| Gross collected | Σ p.gross | **₱1,913,550.00** = 1,863,550 + 50,000 |
| less Output VAT (you remit to BIR) | Σ p.vat | **₱5,357.14** (only the D021 incentive payment is taxable) |
| less EWT withheld (creditable — claimed back via BIR Form 2307) | Σ p.ewt | **₱4,464.29** |
| Net Cash (bank) | Σ p.net_cash | **₱1,909,085.71** = 1,913,550 − 4,464.29 |
| Retained Cash | Gross − VAT − EWT | 1,913,550 − 5,357.14 − 4,464.29 = **₱1,903,728.57** |

Explainer text (reproduce verbatim on the section): *"Net Cash = Gross − EWT (bank). Retained = also net of the VAT you owe. EWT comes back as an income-tax credit (Form 2307)."*

**Section 4 — AGING OF OPEN BALANCES (status = Open AND balance > 0 only):**

Age = r.age_months (M4 helper): whole months since last payment, or since booking date if nothing has been released yet. Buckets: `< 1` (age = 0), `1–3` (1 ≤ age < 3), `3–6` (3 ≤ age < 6), `6+` (age ≥ 6). Per bucket: # deals, Σ balance ₱, % of outstanding = bucket balance ÷ Balance Outstanding. **TOTAL row must tie to Section 1's Balance Outstanding** (rule 4).

Worked fixture (as of 2026-07-17; ages from booking, no payments on any open deal except D021):

| Bucket | # deals | Balance ₱ | % of outstanding |
|---|---|---|---|
| < 1 month | 9 (D009–D016 booked late Jun/early Jul + D021, last payment 2026-07-09) | 3,438,889.69 | 70.83% |
| 1–3 months | 0 | 0.00 | 0.00% |
| 3–6 months | 5 (D002 age 5, D003 age 4, D005 age 4, D007 age 3, D008 age 3) | 1,416,414.70 = 126,500 + 117,500 + 675,000 + 180,000 + 317,414.70 | 29.17% |
| 6+ months | 0 | 0.00 | 0.00% |
| **TOTAL** | **14** | **4,855,304.39** ✓ ties to Balance Outstanding | 100% |

**Section 5 — RECEIVABLES BY DEVELOPER (all-time, no year filter):**

One row per Developer (M0 list) with ≥ 1 deal, plus a **"Resale / Rental (no developer)"** row (deals with developer = blank), plus TOTAL.

| Column | Formula |
|---|---|
| Deals w/ Balance | count where deal.developer = row AND status = Open AND balance > 0 |
| Balance ₱ | Σ balance over those deals |
| Collected Net ₱ | Σ r.collected_net over ALL the developer's deals (all statuses) |
| % Collected | Collected Net ÷ Σ r.total_collectible over ALL the developer's deals |
| Avg Days → 1st Release | AVG(r.first_payment_date − d.booked_date) over the developer's deals that have ≥ 1 payment; "—" if none |

Worked fixture:

| Developer | Deals w/ Bal | Balance ₱ | Collected ₱ | % Coll. | Avg Days → 1st |
|---|---|---|---|---|---|
| CLI | 4 | 1,703,364.15 | 0.00 | 0.00% | — |
| Megaworld GERI | 3 | 685,224.20 | 0.00 | 0.00% | — |
| Abrown Inc. | 2 | 736,902.11 = 426,953.13 + 309,948.98 | 44,642.86 | 44,642.86 ÷ 781,544.97 = **5.71%** | **−1** (D021 incentive released 2026-07-09, one day before its 2026-07-10 booking — negative values are legal, rule 10) |
| Pueblo de Oro | 1 | 630,813.93 | 0.00 | 0.00% | — |
| Resale / Rental (no developer) | 4 | 1,099,000.00 | 1,863,550.00 | 1,863,550 ÷ 2,962,550 = **62.90%** | (12+115+82+83+55+56+49) ÷ 7 = **64.6 days** |
| **TOTAL** | **14** | **4,855,304.39** | **1,908,192.86** | **28.21%** | 451 ÷ 8 = 56.4 days |

**Section 6 — MONTHLY CASH-IN (dashboard year):**

Per month m = 1..12: Collected Net = Σ p.net_of_vat where paid in (year, m); Net Cash = Σ p.net_cash likewise; # payments; Cumulative Collected = running Σ; Cumulative Target = Annual GCI target × m ÷ 12; +/− vs target = Cumulative Collected − Cumulative Target.

Worked fixture (2026; only non-zero months shown — the UI shows all 12):

| Month | Collected Net | Net Cash | # | Cum. Collected | Cum. Target (16,920,000 × m ÷ 12) | +/− |
|---|---|---|---|---|---|---|
| Jan | 436,050.00 | 436,050.00 | 1 | 436,050.00 | 1,410,000.00 | −973,950.00 |
| Feb–Jun | 0.00 | 0.00 | 0 | 436,050.00 | 2,820,000 … 8,460,000 | −2,383,950 … −8,023,950 |
| Jul | 1,472,142.86 | 1,473,035.71 | 7 | 1,908,192.86 | 9,870,000.00 | −7,961,807.14 |

**Section 7 — DATA HEALTH (each check: ✓ when count = 0, else count + explanatory row):**

| # | Check | Predicate | Fixture |
|---|---|---|---|
| a | Receivables with collections activity but no Status set | r.status is null AND (r.collected_net > 0 OR deal has payments) — an **importer edge only**: M4 makes status required with default Open, so this is an invariant guard | ✓ 0 |
| b | Fully paid but not marked Closed (edge case 12) | r.status = Open AND (total_collectible − collected_net) ≤ 0 | ✓ 0 |
| c | Closed deals short/over by more than ₱0.50 (edge cases 8, 15) | r.status = Closed AND \|collected_net − total_collectible\| > 0.50 — **decimal tolerance comparison, never float equality** | ✓ 0 |
| d | Referral fees not yet paid out | count of deals where referral_out > 0 AND referral_paid ≠ Yes | ✓ 0 |
| e/f | *(sheet checks: Property Type / Developer missing from Settings)* | **Replaced by M0 referential integrity** — deleting a referenced list item is impossible (archive only), so the sheet's silent fallbacks (type → Always-VAT, developer → Net comm base) can never occur. Dropped as failure checks; optionally repurposed as informational counts of deals referencing *archived* items (rule 17). | n/a |

**Section 8 — CHASE LIST (every Open receivable with balance > 0):**

Order: **balance DESC**; tiebreaker is Open Question 1 (recommend months idle DESC). Soft warning banner when > 30 open balances (rule 15).

| Column | Source / formula |
|---|---|
| Deal | deal_code (link → receivable detail) |
| Client / Counterparty | d.client_name |
| Balance | r.balance |
| Last Payment | r.last_payment_date; "—" if none |
| Months Idle | r.age_months (since last payment, else since booking) |
| Follow up? | "no payment yet" if the deal has no payments; else "⚠ chase" if months idle ≥ s.chase_idle_months (M0 setting, default 3); else "ok" — in that precedence order |
| Developer | d.developer name; blank for resale/rental |
| Booked GCI | d.net_gci (booked NET GCI — may differ from Balance when a Confirmed Collectible override exists) |
| Next Action | r.next_action — **editable inline; writes through to M4** (the only write path in this module) |

Worked fixture (top 5 of 14 rows, as of 2026-07-17): D013 ₱906,752.23 (no payment yet) · D005 ₱675,000.00 (no payment yet) · D016 ₱630,813.93 (no payment yet) · D010 ₱426,953.13 (no payment yet) · D014 ₱401,965.08 (no payment yet). D021 appears further down with balance ₱309,948.98, last payment 2026-07-09, months idle 0, follow-up **"ok"**.

## 4. Business rules & edge cases

1. **Year filter scope — the rule everyone gets wrong.** The dashboard year (paid year) filters **sections 2 and 6 ONLY**. Sections 1, 3, 4, 5, 7, 8 are all-time / current-state and MUST ignore it — exactly like the sheet. Changing the year must visibly leave sections 1/3/4/5/7/8 untouched.
2. **Paid basis vs booked basis.** Sections 2 and 6 filter on the **payment date's** year (when cash moved), never the deal's booking year. A 2025-booked deal paid in 2026 counts toward 2026.
3. **Balance definition.** balance = total_collectible − collected_net while status = Open; on Closed the balance shuts to 0 and the residual becomes **Variance** (= collected − collectible, signed); on Cancelled the balance shuts to 0 and the uncollected residual becomes **Written-off** (= collectible − collected); cash already collected is kept. (M4 owns these fields; M6 only aggregates.)
4. **Aging reconciliation.** Section 4's TOTAL must equal Section 1's Balance Outstanding. Caveat: an Open receivable with balance ≤ 0 (overpaid, not yet closed) is excluded from aging by the balance > 0 filter but included in Balance Outstanding as a negative — the two then differ by exactly that negative amount, and Data Health (b) is simultaneously flagging the offending row. Do not "fix" the tie by hiding the check.
5. **Cancelled deals are excluded from aging** (edge case 9): they have no open balance (rule 3), so they can never appear in Section 4 or Section 8. Their collected cash still counts in Sections 1, 3, 5, 6.
6. **Overpayment on a Closed deal** (edge case 8): shows as positive Variance realized in Section 1 and trips Data Health (c) when |variance| > ₱0.50.
7. **Tolerance, not equality** (edge case 15): all money comparisons in Data Health use decimal arithmetic with the ₱0.50 tolerance (|x| > 0.50); float equality is forbidden product-wide.
8. **Target derivation.** Annual GCI target = override if set, else ROUNDUP_10K(net_income_target ÷ (1 − opex% − cos%)) from M3's per-year TargetTable. The rounding is **always up** to the next ₱10,000: 16,911,764.71 → 16,920,000 (never 16,910,000). Blank opex/cos in the TargetTable default to 22% / 10% (M3's rule).
9. **No target row → no error.** A dashboard year with no TargetTable row and no override ⇒ target = 0; % of target and pace display **"—"** (not ∞, not an error); the vs-pace line is suppressed; monthly cumulative-target column shows "—".
10. **Pace clamps and calendar.** Pace fraction = MIN(1, MAX(0, (today − Jan 1 + 1) ÷ days_in_year)). Jan 1 ⇒ day 1 ⇒ 1 ÷ 365 = 0.2740% (₱46,356.16 on the 2026 target). Dec 31 ⇒ 365 ÷ 365 = 100%. **Leap years use 366** (2028: Dec 31 = 366 ÷ 366). Selecting a fully past year clamps to 100% of target; a future year clamps to 0%. "Today" is **workspace-local Asia/Manila** — a UTC server clock crossing midnight 8 hours late shows the wrong pace day. Negative first-release day counts (payment before booking date, as in fixture D021) are legal and averaged as-is.
11. **Both payment types count as collected.** Commission and Incentive payments both roll into collected_net (fixture: D021's ₱44,642.86 incentive release is 100% of its collected so far).
12. **Referral tile is deal-level, not payment-level.** "Referral fees owed out" reads M1's referral_out and referral_paid flags — money the agent must pay OUT; it never nets against collections figures. Caption format: "across N deal(s)".
13. **Confirmed Collectible flows through untouched.** Section 1's Total Collectible uses r.total_collectible (override-aware); chase list shows Booked GCI beside Balance so an overridden row is visibly different (D004-style: booked 800,000, collectible 875,000).
14. **Chase Follow up? precedence:** "no payment yet" (never paid) → "⚠ chase" (idle ≥ chase_idle_months) → "ok". A never-paid deal shows "no payment yet" even when months idle ≥ threshold (matches the sheet).
15. **> 30 open balances** shows a soft warning ("Your chase list is longer than 30 — consider a collections sprint"); non-blocking; threshold is Open Question 4.
16. **Only one write path.** The Next Action inline edit is the module's sole mutation; it writes to M4's receivable (M4 audit rules apply). Everything else on the dashboard is read-only.
17. **Data Health (e)/(f) dropped by design** (workbook observation 8): M0 prevents the referenced-item-deleted state outright. If informational counts of archived-item references are wanted, they render as neutral info rows (never warnings). This PRD notes the divergence from the sheet explicitly so testers do not report it as a missing feature.
18. **Data Health checks never mutate.** Each failing check links to the filtered list where the user fixes the records (e.g., check (b) → M4 list filtered to Open + balance ≤ 0).
19. **Empty workspace**: all sections render with zeros/"—" and an empty-state hint ("Log deals and payments to light this up"), never errors.

## 5. Functional requirements

- **FR-M6-01** Render Section 1 (Collection Position) per §3.3 formulas over all receivables/payments/deals, unaffected by the year filter.
- **FR-M6-02** Render Section 2 with target derivation (override → TargetTable → "—"), collected-for-year, % of target, day-accurate pace with MIN/MAX clamps and leap-year denominator, and the ahead/behind line.
- **FR-M6-03** The account owner can set, change, and clear the AnnualTargetOverride per year, behind the standard confirmation + audit pattern (M0 friction-gating); every mutation audit-logged; the dashboard restates immediately.
- **FR-M6-04** Render Section 3 (Cash & Tax) as the five-line waterfall with the verbatim explainer text.
- **FR-M6-05** Render Section 4 aging buckets from r.age_months with the exact bucket boundaries (0 / 1–2 / 3–5 / 6+ whole months) and a TOTAL row that ties to Balance Outstanding (rule 4 caveat surfaced, not hidden).
- **FR-M6-06** Render Section 5 per-developer rows + "Resale / Rental (no developer)" + TOTAL per §3.3 column formulas; developers with zero deals are omitted.
- **FR-M6-07** Render Section 6 as 12 month rows for the dashboard year with cumulative collected, cumulative straight-line target (target × m ÷ 12), and signed variance.
- **FR-M6-08** Render Section 7 checks (a)–(d) with counts, ✓ states, and drill-down links to the offending records; (e)/(f) per rule 17.
- **FR-M6-09** Render Section 8 chase list: all Open receivables with balance > 0, ordered balance DESC (+ tiebreaker per Open Q 1), with all nine columns of §3.3 and the > 30 warning.
- **FR-M6-10** Next Action is editable inline on the chase list (the account owner edits it directly — no role gate in v1); saving writes through to the M4 receivable and appears on the receivable's detail view and audit trail.
- **FR-M6-11** Year filter: a single control changing dashboard_year; switching it restates sections 2 and 6 only; default = current Asia/Manila year; persisted as per-user view state.
- **FR-M6-12** Every tile/row links to its drill-down: position tiles → filtered receivable lists; referral tile → deal list (referral_out > 0, unpaid); monthly rows → payments list for that month; aging buckets → receivable list filtered by bucket; developer rows → that developer's receivables; chase row → receivable detail; Data Health counts → offending records.
- **FR-M6-13** Live-ish restatement: dashboard reflects M1/M4/M5 mutations via events, or a cache no staler than 60 s (§8).
- **FR-M6-14** CSV/XLSX export of any tabular section (aging, by-developer, monthly, chase list) matching on-screen values.
- **FR-M6-15** All eight sections respect workspace scoping (auth + absolute tenant isolation per M0); the account owner views everything and owns the module's two mutations — Next Action (audit-logged) and the target override (confirmation + audit per Master PRD cross-cutting #1).
- **FR-M6-16** All money aggregation server-side in decimal arithmetic; the UI never computes money (Master PRD cross-cutting rule).

## 6. UI/UX requirements

- **Layout:** single scrollable page in the sheet's section order 1→8; sections 1–3 as tile groups (Position: 8 tiles; Target: 5 tiles with a pace progress bar; Cash & Tax: a 5-line waterfall); sections 4–8 as tables. Sticky header carrying the year filter with the caption **"Filters 'Collected vs Target' and 'Monthly Cash-In' only"** — this caption is mandatory (rule 1 is the most common misreading).
- **Ahead/behind styling:** vs-pace renders green "ahead by ₱…" / red "behind by ₱…"; written-off and negative variance render red; ✓ Data Health rows render green with "nothing to fix" when all pass.
- **Target override affordance:** the target tile shows a small "override" badge + note tooltip when an override is active (the SaaS equivalent of the sheet's blue E15 cell); click-to-edit for the account owner, behind the standard confirmation + audit pattern, with the derived value shown alongside ("derived: ₱16,920,000 from 2026 targets").
- **Chase list:** the working table — sticky first column, ₱-formatted, "⚠ chase" chips in amber, "no payment yet" in grey; Next Action is the blue-input affordance (M0 convention) with save-on-blur + toast; > 30 warning as an amber banner above the table.
- **Data Health:** each failing check is a row with count + one-line fix instruction (reuse the sheet's phrasing, e.g., "Open with zero balance — mark it Closed") + drill-down link.
- **Drill-downs** open filtered list views (M4/M5/M9 surfaces) in context, preserving back-navigation to the dashboard.
- **Empty states:** per rule 19; monthly table always renders 12 rows.
- **Mobile (360 px):** tiles stack; tables collapse to cards; chase list becomes the default landing section on mobile (it is the field-use case).
- **₱ formatting** everywhere: `₱ 4,855,304.39`; percentages 2 dp.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M4 | receivable.total_collectible, collected_net, balance, status, variance, last_payment_date, first_payment_date, age_months / months_idle, next_action, confirmed_collectible (override presence), deal_id |
| reads ← | M5 | payment.gross, vat, ewt, net_of_vat, net_cash, paid_date (→ year, month), deal_id |
| reads ← | M1 | deal.referral_out, referral_paid, net_gci (chase "Booked GCI"), client_name, developer_id, booked_date, deal_code |
| reads ← | M3 | TargetTable rows: year, net_income_target, opex_pct, cos_pct (target derivation; can be stubbed — see Milestones sequencing note) |
| reads ← | M0 | chase_idle_months; Developer list (Section 5 grouping); friction-gate confirmation pattern; workspace timezone |
| writes → | M4 | receivable.next_action (inline edit — the ONLY write) |
| owns | — | AnnualTargetOverride (workspace, year, amount, note) |
| consumes events ← | M1/M4/M5 | deal.updated (referral flags), receivable.updated (status/override/balance), payment.created/updated/deleted → restate affected read models |

## 8. Non-functional requirements

- **Performance:** full dashboard (all eight sections) loads < **1.5 s** at 1,000 deals + 1,000 payments; year-filter switch < 500 ms (only sections 2/6 recompute).
- **Freshness:** event-driven restatement, or a materialized cache no staler than **60 s**; a payment logged in M5 must be visible on the dashboard within that bound.
- **Correctness:** all aggregation in exact decimals server-side; internal reconciliation assertions in CI (aging TOTAL = Balance Outstanding; Section 5 TOTAL balance = Balance Outstanding; Σ Section 5 collected = Total Collected Net; Section 6 December cumulative = Section 2 collected-for-year).
- **Permissions:** auth + absolute tenant isolation server-enforced (M0); target-override mutations go through the standard friction-gate confirmation, and both write paths (override, Next Action) are audit-logged; schema and routes stay v2-role-ready (no permission middleware in v1).
- **Timezone:** pace "today" and default year resolved in Asia/Manila (workspace-local), independent of server/browser clocks.

## 9. Acceptance criteria (Given/When/Then)

### 9.1 Canonical current-state fixture (per-receivable)

The **current-state fixture** = the imported v30.20 workbook (21 deals D001–D021, 8 payments, D004 Confirmed Collectible ₱875,000 + referral paid ₱75,000, 7 Closed deals, clock frozen at **2026-07-17**, dashboard year 2026, no target override, TargetTable 2026 = NIT 11,500,000 / opex 22% / CoS 10%). Derived per receivable (Total Collectible = Confirmed Collectible if set, else booked NET GCI; Collected = Σ payment net-of-VAT for the deal):

| Deal | Status | Total Collectible ₱ | Collected Net ₱ | Balance ₱ | Note |
|---|---|---|---|---|---|
| D001 | Closed | 436,050.00 | 436,050.00 | 0.00 | paid 2026-01-13 |
| D002 | Open | 126,500.00 | 0.00 | 126,500.00 | booked 2026-02-09 → age 5 mo |
| D003 | Open | 117,500.00 | 0.00 | 117,500.00 | age 4 mo |
| D004 | Closed | 875,000.00 | 875,000.00 | 0.00 | **override** (booked NET GCI 800,000); referral ₱75,000 paid |
| D005 | Open | 675,000.00 | 0.00 | 675,000.00 | age 4 mo |
| D006 | Closed | 352,500.00 | 352,500.00 | 0.00 | |
| D007 | Open | 180,000.00 | 0.00 | 180,000.00 | age 3 mo |
| D008 | Open | 317,414.70 | 0.00 | 317,414.70 | age 3 mo |
| D009 | Open | 322,724.20 | 0.00 | 322,724.20 | age 0 |
| D010 | Open | 426,953.13 | 0.00 | 426,953.13 | age 0 |
| D011 | Open | 155,803.57 | 0.00 | 155,803.57 | age 0 |
| D012 | Open | 206,696.43 | 0.00 | 206,696.43 | age 0 |
| D013 | Open | 906,752.23 | 0.00 | 906,752.23 | largest balance — chase #1 |
| D014 | Open | 401,965.08 | 0.00 | 401,965.08 | age 0 |
| D015 | Open | 77,232.14 | 0.00 | 77,232.14 | age 0 |
| D016 | Open | 630,813.93 | 0.00 | 630,813.93 | age 0 |
| D017 | Closed | 22,500.00 | 22,500.00 | 0.00 | rental |
| D018 | Closed | 130,000.00 | 130,000.00 | 0.00 | rental |
| D019 | Closed | 10,000.00 | 10,000.00 | 0.00 | rental |
| D020 | Closed | 37,500.00 | 37,500.00 | 0.00 | rental |
| D021 | Open | 354,591.84 | 44,642.86 | 309,948.98 | incentive release 2026-07-09 counts as collected |
| **Σ** | | **6,763,497.25** | **1,908,192.86** | **4,855,304.39** | ties: 6,763,497.25 − 1,908,192.86 = 4,855,304.39 |

Cross-check: Σ booked NET GCI = ₱6,688,497.25 (= Yield Summary's all-time sales NET GCI ₱6,488,497.25 + rentals ₱200,000.00); + D004's override delta ₱75,000.00 = ₱6,763,497.25. ∎

### 9.2 Given/When/Then criteria

1. **Given** the fixture **When** the dashboard loads **Then** Section 1 shows exactly: Total Collectible **₱6,763,497.25**; Total Collected Net **₱1,908,192.86**; Balance Outstanding **₱4,855,304.39**; % Collected **28.21%**; Written-off ₱0.00; Variance realized ₱0.00; Net Cash **₱1,909,085.71**; Referral fees owed out **₱0.00 across 0 deal(s)**.
2. **Given** the fixture **Then** Section 2 shows target **₱16,920,000** (derived: 11,500,000 ÷ 0.68 = 16,911,764.71 → rounded UP to ₱10,000), collected ₱1,908,192.86, **11.28%** of target, pace day 198 ÷ 365 = 54.2466% → **₱9,178,520.55**, and **"behind by ₱7,270,327.69"** in red.
3. **Given** an override set to ₱15,000,000 for 2026 **When** the dashboard reloads **Then** the target tile shows ₱15,000,000 with the override badge, pace = 198 ÷ 365 × 15,000,000 = **₱8,136,986.30**, and an audit entry exists; clearing the override restores ₱16,920,000.
4. **Given** the fixture **Then** Section 3 shows Gross **₱1,913,550.00** / VAT **₱5,357.14** / EWT **₱4,464.29** / Net Cash **₱1,909,085.71** / Retained **₱1,903,728.57**, with the verbatim explainer.
5. **Given** the fixture at 2026-07-17 **Then** aging shows < 1 month: 9 deals ₱3,438,889.69 (70.83%); 1–3: 0; 3–6: 5 deals ₱1,416,414.70 (29.17%); 6+: 0; TOTAL 14 / ₱4,855,304.39 = Balance Outstanding.
6. **Given** the fixture **Then** Section 5 shows the six rows of §3.3's worked table — including Abrown Inc. % Collected **5.71%** and Avg Days → 1st Release **−1** (payment 2026-07-09 precedes booking 2026-07-10), and "Resale / Rental (no developer)" collected ₱1,863,550.00 at **62.90%** / **64.6 days** — with TOTAL tying to Sections 1's figures.
7. **Given** the fixture **Then** Section 6 shows Jan: 436,050.00 / 1 payment / cumulative −973,950.00 vs target; Feb–Jun zero-payment rows; Jul: 1,472,142.86 collected (Net Cash 1,473,035.71) / 7 payments / cumulative 1,908,192.86 vs 9,870,000.00 = **−7,961,807.14**; Aug–Dec zeros.
8. **Given** the fixture **Then** all Data Health checks show ✓ 0; **When** D009's status is cleared via importer-style data **Then** check (a) shows 1; **When** an Open deal is paid to exactly its collectible **Then** check (b) shows 1 with a drill-down to that receivable.
9. **Given** a deal Closed with collected = collectible − 0.50 **Then** check (c) stays ✓ (tolerance boundary: |−0.50| > 0.50 is false); at −0.51 it flags 1 (edge cases 8/15 — decimal comparison).
10. **Given** the fixture **Then** the chase list has 14 rows ordered D013 (₱906,752.23) → D005 → D016 → D010 → D014 → … → D015 (₱77,232.14); 13 rows show "no payment yet"; D021 shows last payment 2026-07-09, months idle 0, **"ok"**.
11. **Given** chase_idle_months = 3 and a clock at 2026-10-15 **Then** D021 (still unpaid since 2026-07-09, idle 3) flips to **"⚠ chase"**; never-paid rows still read "no payment yet" (rule 14).
12. **Given** the agent types "Called CLI — releasing Aug 15" into D013's Next Action **When** saved **Then** M4's receivable shows the same note with an audit entry, and the dashboard cell reflects it after reload.
13. **Given** the year filter switched 2026 → 2025 **Then** sections 2 and 6 restate (2025: zero collected; target "—" if no 2025 TargetTable row) while sections 1, 3, 4, 5, 7, 8 are **byte-identical** to before (rule 1).
14. **Given** dashboard year 2028 (leap) with a target row **Then** pace on 2028-12-31 uses 366 ÷ 366 = 100%; on Jan 1 of the dashboard year pace = 1 ÷ days_in_year × target (2026: ₱46,356.16); a fully past year shows 100% pace, a future year 0%.
15. **Given** a Cancelled deal with partial collection (synthetic: collectible 100,000, collected 40,000) **Then** Written-off = ₱60,000.00 in Section 1, the deal is absent from aging and chase (edge case 9), and its ₱40,000 still counts in Sections 1/3/5/6.
16. **Given** 1,000 deals + 1,000 payments (synthetic load fixture) **Then** the dashboard renders < 1.5 s and a newly logged payment appears within 60 s.

## 10. Out of scope / future

- No forecasting of buyer-to-developer payment cycles (product philosophy: reactive logging; the dashboard reports what happened, never predicts releases).
- No collections workflows (reminder emails, task assignment, promise-to-pay tracking) — the chase list + Next Action note is the v1 workflow.
- No developer-facing statements/SOA generation; no BIR e-filing or 2307 document management (EWT is reported, not filed).
- No configurable/custom dashboard sections or KPI builder — the eight sections are fixed.
- No team or per-member dashboards — v1's dashboard is inherently the agent's own book of business; multi-agent workspaces with per-agent attribution arrive in v2 (brokerage/team edition).
- Monthly straight-line target (× m ÷ 12) stays linear — no seasonality curves.

## 11. Open questions

1. **Chase list tiebreaker (workbook discrepancy register item 2).** The prompt says ties on equal balance break by idle time; the sheet's cached Chase Priority key = balance + row_index × 10⁻⁶ (row order ≈ booking order). Evidence favors row-index epsilon, which is an artifact, not intent. **Recommendation: balance DESC, then months_idle DESC.** Needs product-owner confirmation.
2. **Should Section 1's % Collected optionally exclude Cancelled deals?** The sheet includes Cancelled collectibles in both Σ collectible and Σ collected, so heavy write-offs depress % Collected forever. Faithful = include (as specced). Decide whether a toggle or a second "% collected (active deals)" figure is wanted.
3. **Manual target override persistence & governance.** Confirm: one override per year (as modeled)? Should the note be required (mirroring M4's required Next Action on Confirmed Collectible)? Does the override also drive M3's calculator displays, or is it dashboard-only (sheet: dashboard-only cell E15 — specced as dashboard-only)?
4. **Is the "> 30 open balances" warning threshold configurable** (M0 setting) or hard-coded as in the sheet? Specced hard-coded; trivial to move to M0 later.
