# M1 — Deal Log & Commission Engine — PRD

**Product:** ZETA GCI + Collections · **Module:** M1 · **Source of truth:** v30.20 workbook — *Deal Log* sheet + *Start Here* rules · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every business rule is stated in full with formulas and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M1 is the system of record for closed deals and the **calculation engine** that turns a deal's inputs into money figures: VAT-exclusive commission income (GCI), incentives, referral-outs, NET GCI, tax memos, and yield. In v1 this is the solo agent's system of record for their own closed deals — one workspace, one agent, one book of business (Master PRD positioning). Everything downstream — receivables (M4), payments (M5), dashboards (M6), analytics (M2/M7/M8), planning (M3) — reads M1's outputs.

**Spreadsheet behavior it replaces.** The Deal Log is a 36-column table (one row per closed deal) where the user fills "blue" input cells and ARRAYFORMULA-driven columns compute Property VAT status, Net List Price, Comm Base, VAT Basis, GCI, incentive net, referral-out, NET GCI, VAT/EWT memos, yield, year, and a dropdown helper. Deal IDs (D001, D002, …) are permanent values written once by an Apps Script and never renumbered. The sheet holds 1,000 deal rows.

**What improves in SaaS form.** Deal IDs become a real immutable per-workspace sequence (no script fragility); computed values become a server-side, unit-tested pure function library instead of locked cells; referential integrity replaces the "typo safeguard"; edits after payments exist require confirmation and are audit-trailed; validation happens at entry instead of via a downstream Data Health panel; and the one-time importer migrates an existing v30.x workbook.

**Domain glossary (reproduce — the developer has no context):**
- **GCI** — Gross Commission Income. Booked GCI in this product is always stated **Net of VAT** (the 12% output VAT is stripped out, because that portion is remitted to the tax bureau, not earned).
- **TCP / List Price** — Total Contract Price of the property.
- **Deal Type** — `Developer` (a unit sold for a property developer, pre-selling or ready-for-occupancy), `Resale` (secondary market), `N/A` (used for rentals).
- **Transaction Type** — `Sale` or `Rental`.
- **Agent Representation** — `Double Ended` (the agent represents both sides, earns full commission), `Seller` / `Buyer` (one side only, e.g., a co-broke), `Lessor` / `Lessee` (rental sides), `Referrer` (the agent introduced the parties only and earns a referral fee; reported on its own analytics line).
- **Rate %** — the rate the agent actually earns, **already net of any co-broke split**.
- **EWT** — Expanded Withholding Tax, creditable (BIR Form 2307). The payor withholds it from the commission and the broker claims it back as an income-tax credit. Default 10%.
- **Output VAT** — 12% value-added tax on the commission that the broker must remit to the BIR (Philippine tax bureau).
- **BIR RR 1-2024** — the regulation setting the ₱3,600,000 dwelling VAT threshold used for property VAT.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. They wear every hat the workbook's team divided up.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Log their own closed deals from developer computation sheets with guided inputs (dropdowns, warnings); trust the booked numbers for planning and chasing; run the workbook importer once at onboarding; correct deal economics when the contract genuinely changed (Corrections doctrine case 1). |
| *(v2, out of scope)* | *Team roles — Owner/Rainmaker, Admin/ISA, Agents, Read-only — and shared deal entry arrive with the brokerage/team edition.* |

## 3. Data model

### 3.1 Deal entity

Inputs (user-editable) — `(I)`; computed (never directly editable) — `(C)`. All money `decimal(14,2)` display / full-precision decimal internal; rates `decimal(10,6)` or exact rational for values like 1/12 (see rule 21). FKs are to M0 entities.

| # | Field | Sheet col | I/C | Type | Req | Validation / Default | Derivation (computed fields) |
|---|---|---|---|---|---|---|---|
| 1 | deal_code | B | C | string | ✔ | immutable | `"D" + zero-padded next value of workspace.deal_id_sequence` assigned at creation, **never renumbered, never reused** — even after deletion (§4 rule 1). |
| 2 | booked_date | C | I | date | ✔ | any date | |
| 3 | transaction_type | D | I | enum | ✔ | `Sale` \| `Rental` | |
| 4 | deal_type | E | I | enum | ✔ | `Developer` \| `Resale` \| `N/A`; Rental ⇒ `N/A` (rule 12) | |
| 5 | developer_id | F | I | fk | if deal_type=Developer | must be active Developer; blank otherwise | |
| 6 | client_name | G | I | string(160) | ✔ | "Client / Counterparty" — the party represented; for Developer deals, **the actual unit buyer**; for Referrer deals, the party introduced | |
| 7 | representation | H | I | enum | ✔ | `Double Ended`\|`Seller`\|`Buyer`\|`Lessor`\|`Lessee`\|`Referrer`; Lessor/Lessee only when Rental (warn otherwise) | |
| 8 | property_type_id | I | I | fk | ✔ | active PropertyType | |
| 9 | lead_source_id | J | I | fk | ✔ | active LeadSource | |
| 10 | property_details | K | I | string(240) | ✔ | free text ("Blk 5 Lot 20 Xavier Southwoods") | |
| 11 | mode_of_payment | L | I | enum | ✔ | `Cash`\|`Bank`\|`Pagibig`\|`Deferred Cash` — collection-timing view: pre-selling Cash = current <1 yr; Bank/Pagibig/Deferred = long-term; resale/rental all current | |
| 12 | list_price | M | I | money | ✔ | > 0 | |
| 13 | force_vat | N | I | bool | | default false; only meaningful on Developer deals | |
| 14 | property_vat | O | C | enum | | | See **Rule A** below → `vat_able` \| `exempt` \| `n/a` |
| 15 | net_list_price | P | C | money | | | **Rule B**: `= list_price ÷ (1 + vat_rate)` if property_vat = vat_able, else `= list_price` |
| 16 | commission_basis | Q | I | enum | ✔ | `%` \| `Fixed` | |
| 17 | rate_pct | R | I | rate | if basis=% | 0 < r ≤ 1 (entered as %, e.g., 5%); supports exact fractions (rentals use 1/12 = 8.3333%) | |
| 18 | fixed_amount | S | I | money | if basis=Fixed | > 0 | |
| 19 | comm_base | T | C | enum | | | **Rule C**: Developer deal → the Developer's `comm_base` (`Gross`/`Net`); otherwise `N/A` |
| 20 | receipt_issued | U | I | bool | | Developer deals: always treated `Yes` (taxable); Resale/Rental: default `No` (untaxed) | |
| 21 | vat_basis | V | C | enum | | | **Rule D — computed invariant, no user input (decision 2026-07-17, resolves OQ1 by removal):** `inclusive` on taxable deals of a VAT-registered workspace; `n/a` otherwise. The workbook's Inclusive/Exclusive picker is **removed from the product** — all observed developers bill VAT inside the figure; the column is retained (reserved) so payment snapshots stay coherent and a future per-developer reintroduction is non-breaking. |
| 22 | gci_net_of_vat | W | C | money | | | **Rule E** (billed commission → GCI) |
| 23 | incentive_billed | X | I | money | | ≥ 0, default 0 — developer bonus on top of commission, entered **as billed** | |
| 24 | incentive_taxable | Y | I | enum | | `Yes`\|`No`\|blank; **blank = Yes** (follows the deal's receipt/VAT-basis rules) | |
| 25 | incentive_net | Z | C | money | | | **Rule F** |
| 26 | referral_out_pct | AA | I | rate | | 0 ≤ r < 1, default 0 | |
| 27 | referral_out_fixed | AB | I | money | | ≥ 0, default 0 | |
| 28 | referral_out | AC | C | money | | | **Rule G**: `= referral_out_pct × billed_commission + referral_out_fixed` |
| 29 | net_gci | AD | C | money | | | **Rule H**: `= gci_net_of_vat + incentive_net − referral_out` |
| 30 | referral_paid | AE | I | bool | | default false; meaningful only when referral_out > 0 | |
| 31 | vat_memo | AF | C | money | | | **Rule I**: taxable base × vat_rate; 0 for untaxed deals |
| 32 | ewt_memo | AG | C | money | | | **Rule I**: taxable base × ewt_rate; 0 for untaxed deals |
| 33 | yield_on_list | AH | C | rate | | | `= net_gci ÷ list_price` |
| 34 | booked_year | AI | C | int | | | `= year(booked_date)` |
| 35 | display_label | AJ | C | string | | | `deal_code + " — " + client_name` (payment-picker label) |
| 36 | archived_at / audit fields | — | C | | | soft delete + full audit trail | |

### 3.2 The calculation engine (pure function; server-side only)

**Inputs:** the deal's input fields + workspace TaxSettings + Developer.comm_base + PropertyType.vat_rule. **Outputs:** fields 14, 15, 19, 21(auto part), 22, 25, 28, 29, 31, 32, 33. All arithmetic in exact decimals; round **only at display/storage boundaries** to 2 dp, half-up; comparisons use the ₱0.50 tolerance where specified (M6 Data Health), never float equality.

**Rule A — Property VAT determination** (applies to `deal_type = Developer` only; Resale/Rental are never developer sales → `n/a`):

```
if deal_type ≠ Developer:                property_vat = n/a
else if force_vat = true:                property_vat = vat_able        # adjacent-property override
else match property_type.vat_rule:
    always_vat:                          vat_able
    always_exempt:                       exempt
    threshold:                           vat_able if list_price > property_vat_threshold else exempt
```
Strictly **greater than**: at exactly ₱3,600,000.00 the unit is **exempt** (edge case 1). The `force_vat` toggle implements the BIR **adjacent-property rule** — 2+ adjacent units, same developer, sold to the same buyer within 12 months, aggregating above the threshold, are VAT-able even though each unit is individually under it. It is one deliberate toggle; the system does **not** automate the aggregation (out of scope §10).
*Worked ₱:* D021, House & Lot (threshold rule), List ₱8,000,000 > ₱3,600,000 → `vat_able`. D007-style Lot resale ₱3,600,000 → deal_type Resale → `n/a` regardless of price.

**Rule B — Net List Price:** `net_list_price = list_price ÷ 1.12` when vat_able (the 12% property VAT inside the contract price is stripped to get the developer's net selling price), else `= list_price`.
*Worked ₱:* 8,000,000 ÷ 1.12 = **₱7,142,857.14**.

**Rule C — Commission base price.** Each Developer carries `comm_base`:
- `Gross` — the rate applies to the gross TCP (`base = list_price`). Example: Megaworld-style computation.
- `Net` — the rate applies to `net_list_price` (**the default** for new developers).
Non-developer deals: `base = list_price`; comm_base displays `N/A`.

**Rule D — Taxability and VAT Basis.** A deal is **taxable** when it is a Developer deal, or a Resale/Rental deal with `receipt_issued = Yes`. Resale/rental deals are **untaxed by default** (`No` → vat_basis = `N/A`, GCI = billed commission, VAT = EWT = 0).

**Registration gate (product decision 2026-07-17, M0 `vat_registered`):** on a **non-VAT-registered** workspace the commission-VAT machinery is off for every deal — vat_basis = `N/A` always (field hidden), no ÷1.12 anywhere in Rules E/F, vat_memo = 0. "Taxable" then means **EWT-subject only**: developers still withhold EWT (default 5%, sworn-declaration rate) on developer deals and receipted resale/rental deals; unreceipted deals carry no EWT either. Property VAT (Rules A/B — the *developer's* VAT on the property, driving Net List Price for Comm Base = Net) applies **regardless** of the agent's registration.

On a VAT-registered workspace, a taxable deal's billed commission is **always treated as VAT-inclusive** — the VAT is inside the billed figure and income = billed ÷ 1.12. **Product decision (2026-07-17, resolves OQ1 by removal):** the workbook carried an Inclusive/Exclusive VAT-basis option as speculative future-proofing, but every observed developer bills Inclusive and no Exclusive deal has ever occurred; the per-developer variable that actually matters is **Comm Base** (Rule C). The picker is therefore removed — a deliberate divergence from the sheet, not an oversight.
**Escape hatch (document in help copy):** if a payor ever bills the commission net-of-VAT and adds 12% on top ("Exclusive-style"), book the deal with **Basis = Fixed using the VAT-inclusive total**. Worked ₱: commission 100,000 + VAT 12,000 billed separately → Fixed = 112,000 → GCI = 112,000 ÷ 1.12 = **₱100,000.00** — centavo-exact with zero special-case code. If Exclusive billing ever becomes a recurring pattern, reintroduce it as a **per-developer attribute** (like comm_base), which the reserved `vat_basis` column makes a feature release, not a migration.

**Rule E — Billed commission and GCI:**
```
billed_commission = rate_pct × base_price        (basis = %)
                  = fixed_amount                  (basis = Fixed)

gci_net_of_vat = billed_commission ÷ 1.12        (taxable — VAT always inside the billed figure)
               = billed_commission               (untaxed)
               = billed_commission               (any deal on a non-VAT-registered workspace — Rule D gate)
```
*Worked ₱ (Inclusive, % basis — D021):* base = net list ₱7,142,857.14 (Abrown = Net); billed = 5% × 7,142,857.14 = ₱357,142.86; GCI = 357,142.86 ÷ 1.12 = **₱318,877.55**.
*Worked ₱ (Inclusive, Gross base — D009):* billed = 3% × 12,048,370 = ₱361,451.10; GCI = ÷1.12 = **₱322,724.20**. (Start-Here example: 3% × TCP = 322,369.80 billed → ÷1.12 = 287,830.18 income.)
*Worked ₱ (Fixed — D011):* billed = ₱174,500 (Fixed on a VAT-able Megaworld lot, Inclusive); GCI = 174,500 ÷ 1.12 = **₱155,803.57** (edge case 3).
*Worked ₱ (untaxed resale — D004):* billed = 5% × 17,500,000 = ₱875,000 = GCI.

**Rule F — Incentive:** entered **as billed**. `incentive_taxable = No` → carried as-is (`incentive_net = incentive_billed`) and **excluded from the tax memos**. `Yes`/blank → follows the deal's receipt rules: taxable deal on a VAT-registered workspace → `incentive_net = incentive_billed ÷ 1.12`; on an untaxed deal → `= incentive_billed`; on a non-VAT-registered workspace → `= incentive_billed` always (the taxable flag then controls only whether it joins the EWT memo base in Rule I).
*Worked ₱ (D021):* ₱40,000 taxable on an Inclusive deal → 40,000 ÷ 1.12 = **₱35,714.29**.

**Rule G — Referral Out** (fee the agent pays a third party — referrer endorsements, *balato*, tip fees): `referral_out = referral_out_pct × billed_commission + referral_out_fixed`, tracked with `referral_paid`. *Worked ₱ (D004):* 0% × 875,000 + 75,000 = **₱75,000**.

**Rule H — NET GCI (what the agent actually earns):** `net_gci = gci_net_of_vat + incentive_net − referral_out`.
*Worked ₱ (D021):* 318,877.55 + 35,714.29 − 0 = **₱354,591.84**. *(D004):* 875,000 + 0 − 75,000 = **₱800,000**.

**Rule I — Tax memos (booked, informational):** on a taxable deal, `vat_memo = taxable_income × vat_rate` and `ewt_memo = taxable_income × ewt_rate`, where `taxable_income = gci_net_of_vat + (incentive_net if incentive_taxable else 0)`. Untaxed deal → both 0. A non-taxable incentive is excluded from the memo base. **Non-VAT-registered workspace:** `vat_memo = 0` always; `ewt_memo = taxable_income × ewt_rate` on EWT-subject deals (Rule D gate), 0 otherwise.

**Worked ₱ — fixture N1 (non-VAT twin of D021; ewt_rate 5%):** same inputs as D021 on a workspace with `vat_registered = false`. Rules A–C unchanged: vat_able, Net List ₱7,142,857.14, base = net list. Rule E: billed = 5% × 7,142,857.14 = 357,142.86; no ÷1.12 → GCI = **₱357,142.86**. Rule F: incentive 40,000 as-is → **₱40,000.00**. Rule H: NET GCI = **₱397,142.86**. Rule I: VAT memo **₱0**; EWT memo = 397,142.857… × 0.05 = **₱19,857.14**. Rule J: yield = **4.9643%**.
*Worked ₱ (D021):* base 354,591.84 → VAT memo **₱42,551.02**, EWT memo **₱35,459.18**. ⚠ Interaction with Referral Out when > 0 on a taxable deal is Open Question 2 — no live fixture exercises it.

**Rule J — Yield on List:** `yield_on_list = net_gci ÷ list_price`. *Worked ₱ (D004):* 800,000 ÷ 17,500,000 = **4.5714%**. Rentals yield on *annual rent* (D017: 22,500 ÷ 270,000 = 8.3333% — one month of a one-year lease).

### 3.3 Corrections & booking doctrines (business policy encoded in UX — reproduce verbatim in training/help)

**Collectible Corrections doctrine — which tool when a deal's number changes:**
1. **Economics truly changed** (price amended, rate renegotiated before release, wrong base and the contract backs the developer) → **edit the deal itself.** Earned GCI, yield, and planning all reflect the new reality.
2. **Earnings stand, expected cash differs and you accept it** (recomputed base you'll tolerate, part collected elsewhere, netting arrangement) → **use Confirmed Collectible** on the receivable (M4), ALWAYS with a Next Action note (e.g., "CLI advice 7/20: base excl. promo disc — confirmed 303,806"). The override is one opaque number; the note is its audit trail — the note is **required** in the SaaS.
3. **Eating a shortfall you do NOT agree is correct** → touch nothing. Close the deal short and let **Variance** (M4) tell the story — short-paying developers stay visible in %-collected stats instead of the gap being hidden.

**What-to-Book doctrine — only money that passes through your hands:**
- **Splits at source** (payer splits the commission before it reaches you: co-broke disbursed by the listing side, bank-accredited splits, escrow) → enter Rate % = **your net share only**. Do NOT also use Referral Out — that money never touched your account. Split-at-source does not occur in pre-selling (developers tag one agent per deal); it is a resale pattern.
- **Referral Out = outflows you disburse yourself**: you collect the full commission, THEN pay it out.
- Engine safeguard (edge case 16): a Resale deal with `representation ∈ {Seller, Buyer}` (one-sided/co-broke) **and** referral_out > 0 triggers a warning: "One-sided resale with a Referral Out — if the other side's cut is deducted at source, your Rate % should already be your net share. Continue?"

## 4. Business rules & edge cases (numbered)

1. **Permanent IDs.** deal_code assigned on create from an immutable per-workspace sequence; never renumbered, never reused, survives deletion (a deleted D005's code is retired). Sorting/inserting never changes codes (in the sheet this needed an Apps Script; here it is a DB sequence).
2. **Delete protection.** Deleting a deal with payments logged against it is **blocked**; the user must delete/reassign payments first or use archive with explicit cascade confirmation listing the N payments and the receivable that will go with it. Soft-delete always; hard-delete never for deals with financial children.
3. **Edits after payments exist** (edge case 13): allowed behind an explicit confirmation (friction gate, per Master PRD cross-cutting rule 1) that shows old→new for every recomputed field; booked figures recompute, payment history stays intact, the receivable's balance/variance restate automatically (M4); audit entry mandatory.
4. **Exactly-at-threshold** (edge case 1): ₱3,600,000.00 on a threshold-rule type → exempt.
5. **Force VAT on under-threshold unit** (edge case 2): force_vat=Yes → vat_able even at, e.g., ₱2,000,000; UI shows an "adjacent-property override" badge.
6. **Fixed-basis on developer deal** (edge case 3): D011 — Fixed ₱174,500, Inclusive → GCI ₱155,803.57. Note Fixed ignores comm_base (no rate × base), but VAT Basis still applies.
7. **Rentals** (edge case 4): transaction=Rental → deal_type `N/A`, representation Lessor/Lessee (or Double Ended), rate typically 1/12 of annual rent (8.333%), untaxed unless receipted. List Price holds the **annual rent** (D017: ₱270,000 → GCI ₱22,500).
8. **Referrer representation** (edge case 5): the commission received IS a referral fee; deal sits on its own Yield-Summary line (M2) and is excluded from blended sales yield. Engine math is unchanged (rate/fixed × base, receipt rules apply).
9. **Referral Out ≠ Referrer** (edge case 6): opposite directions — Referral Out is a fee *paid*, Referrer deals are fees *received*. Never conflate in UI copy.
10. **Non-taxable incentive** (edge case 7): incentive_taxable=No → excluded from memos; standalone incentive payments (M5) carry zero VAT/EWT.
11. **Untaxed-by-default resale/rental**: receipt_issued defaults No; switching to Yes recomputes (GCI drops by ÷1.12 under Inclusive) with inline preview.
12. **Transaction/Deal-Type coupling**: Rental ⇒ deal_type N/A enforced; Sale ⇒ deal_type ∈ {Developer, Resale}. Developer deals require developer_id; Resale/N-A must have none.
13. **EWT is a setting** (edge case 14): 5% sworn-declaration brokers just change M0's rate; engine takes the rate as a parameter.
14. **Decimal money** (edge case 15): all computation in decimal; the engine's contract tests assert centavo-exact fixture outputs.
15. **Missing/archived list references**: entry forms only offer active items; historical deals referencing archived items keep computing with the stored FK's values. The sheet's silent fallbacks (missing type → Always-VAT; missing developer → Net) are **not** reproduced — integrity constraints make the state unrepresentable.
16. **Split-at-source warning** (edge case 16): see doctrine safeguard in §3.3.
17. **Rate entry precision** (workbook observation 12): rentals store rate as the exact fraction 1/12, not 0.0833; support fraction entry or a "1 month of annual rent" preset so 270,000 × 1/12 = 22,500.00 exactly.
18. **Duplicate guard (soft)**: same client + property details + list price within 30 days → non-blocking "possible duplicate" warning (D013/D014/D015 show same-buyer same-day deals are legitimate).
19. **Year derivation**: booked_year from booked_date; drives every year filter downstream (M2/M3/M7/M8/M9).
20. **Force VAT is ignored on non-developer deals** (property VAT is n/a regardless); UI hides the toggle there.
21. **VAT basis is an invariant, not an option** (decision 2026-07-17): taxable + VAT-registered → treated VAT-inclusive, always. The Exclusive-style edge case is handled by the Rule-D escape hatch (Fixed basis on the VAT-inclusive total); the importer validates the workbook's VAT Basis column contains only `Inclusive`/`N/A` values and errors on anything else (none exist in v30.20).

## 5. Functional requirements

- **FR-M1-01** Create deal: guided form with only valid inputs (dropdowns from M0; conditional fields per §4 rule 12); on save, engine computes all derived fields server-side; deal_code assigned atomically.
- **FR-M1-02** Read: deal list (default sort booked_date desc) with all sheet columns, column chooser, year filter; deal detail view showing inputs vs computed (locked) fields with formula tooltips.
- **FR-M1-03** Update: input fields editable by the authenticated owner (no role gating in v1); any change recomputes derived fields in the same transaction; §4 rule-3 friction-gate confirmation when payments exist.
- **FR-M1-04** Delete/archive per §4 rule 2.
- **FR-M1-05** Engine as a pure library: `computeDeal(inputs, settings) → derived` with no I/O, unit-tested against §9 fixtures; the ONLY code path that produces money figures (UI never computes money).
- **FR-M1-06** Live preview: the deal form shows computed GCI/NET GCI/memos as inputs change (server round-trip or WASM/shared lib of the same engine — never a re-implementation).
- **FR-M1-07** Recompute service: settings/developer changes (M0 rules 3, 8) re-run the engine over affected deals in bulk with progress + audit.
- **FR-M1-08** Deal events: `deal.created/updated/archived` events carry old/new derived values for M4 (receivable upsert) and analytics caches.
- **FR-M1-09** CSV/XLSX export of the deal table (all columns, filtered set).
- **FR-M1-10** Workbook importer (one-time, behind typed confirmation): upload a v30.x file → parse Settings lists + tax settings → map Deal Log columns → preview with per-row validation → import deals preserving original deal codes; then Payments (M5) and Collectible statuses/overrides/notes (M4) in the same run; dry-run report; idempotent re-run per file hash. Column mapping per the WORKBOOK_REFERENCE §3 layout; treat blank and "Commission" as the same payment type; recompute all derived fields and reconcile against the workbook's cached values within ₱0.01, reporting any row that disagrees rather than importing it silently.
- **FR-M1-11** Warnings engine: soft warnings (duplicate, split-at-source, Lessor/Lessee-on-Sale) surfaced inline, never blocking saves silently.
- **FR-M1-12** Search hooks: deals queryable by year, code, client/property text (feeds M9).

## 6. UI/UX requirements

- **Deal form** in three groups mirroring the mental model: *What closed* (date, transaction/deal type, developer, client, representation, property type, source, details, mode of payment) → *The money* (list price, Force VAT toggle with plain-language helper, basis, rate/fixed, receipt issued, VAT basis with the "quick test" helper text, incentive + taxable flag, referral out % / fixed + paid flag) → *Computed panel* (Property VAT badge, Net List, billed commission, GCI, incentive net, referral out, **NET GCI large**, VAT/EWT memos, yield) updating live and visibly locked.
- Input affordance = the product-wide "blue" input style from M0; computed values read-only with formula tooltips (e.g., "GCI = billed ÷ 1.12 (Inclusive)").
- Conditional visibility: Developer picker only for Developer deals; Force VAT only for Developer deals; rate vs fixed switch; receipt toggle only for Resale/Rental (Developer deals show "taxable — developer deal" as static text); VAT basis only when taxable.
- Representation picker copy taken from Start Here definitions (Double Ended: "you represent BOTH sides — full commission", Referrer: "you introduced the parties — referral fee; reported on its own line").
- Deal list: sticky header, ₱-formatted columns, year filter, text search, computed columns visually distinct; row → detail drawer; "Log a payment" and "View receivable" cross-links.
- Empty state: "No deals yet — log your first closed deal" + importer entry point.
- Mobile: entry form fully usable at 360 px (field groups become steps); list collapses to cards showing code, client, NET GCI, date.
- Warnings render as amber inline banners with "Continue anyway" (audit-logged).

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M0 | TaxSettings (vat_rate, ewt_rate, property_vat_threshold); PropertyType.vat_rule; Developer.comm_base; LeadSource; auth/session + friction-gate confirmation pattern |
| writes → | M4 | on create: receivable row (deal_id, booked_net_gci = net_gci, defaults per M4); on update: restated booked figures; on archive: receivable archival |
| read by | M5 | payment form joins deal by deal_code: vat_basis, incentive_taxable, client_name, property_details, developer, booked_year |
| read by | M2 | transaction_type, deal_type, representation, list_price, net_gci, incentive_net, referral_out, booked_year (segment aggregates) |
| read by | M3 | list_price, transaction_type, representation, booked_year (YTD actual sales); via M2: blended yield/price |
| read by | M6 | referral_out, referral_paid (fees owed out); deal fields on chase list |
| read by | M7 | lead_source_id (via M4's receivable projection), deal_type, net_gci, booked_year |
| read by | M8/M9 | booked_year, identity fields, computed figures |
| imports → | M0 | importer creates missing list items via M0 APIs |

## 8. Non-functional requirements

- Engine: pure, deterministic, side-effect-free; property-based tests plus fixture tests; decimal-exact; documented rounding policy (round half-up to centavos at persistence; keep full precision through intermediate steps — 2-dp intermediate rounding produces visible centavo drift on ÷1.12 chains and is forbidden).
- Performance: deal list with 1,000+ deals paginates/filters < 500 ms P95; single-deal compute < 10 ms; bulk recompute of 1,000 deals < 30 s with progress.
- Access control per M0's v1 model: auth on every route + absolute tenant isolation + friction-gate confirmations on money-restating actions — no role middleware in v1 (schema stays v2-role-ready per M0 §3.2); every financial edit audit-trailed (old→new per field).
- Concurrency: optimistic locking on deal edits (stale write → conflict prompt).
- Importer: 1,000-deal workbook imports < 2 min with per-row error report.

## 9. Acceptance criteria

### 9.1 Mandatory self-verification — fixtures re-derived from THIS document's rules only

The following arithmetic was performed using only Rules A–J as written above (not the source prompt, not the workbook's cached values), in exact decimal arithmetic. **These derivations are the module's canonical test fixtures and must reproduce to the centavo.**

**D021 — Developer / Abrown Inc. (comm_base = Net) / House & Lot (threshold) / List ₱8,000,000 / % basis 5% / Inclusive / incentive ₱40,000 taxable / no referral out**
1. Rule A: deal_type = Developer; force_vat = No; vat_rule = threshold; 8,000,000 > 3,600,000 → property_vat = **vat_able**.
2. Rule B: net_list = 8,000,000 ÷ 1.12 = **7,142,857.142857…** → ₱7,142,857.14.
3. Rule C: comm_base = Net → base = 7,142,857.142857…
4. Rule E: billed = 0.05 × 7,142,857.142857… = **357,142.857142…** (₱357,142.86); Inclusive → GCI = 357,142.857142… ÷ 1.12 = **318,877.5510204…** → **₱318,877.55** ✔
5. Rule F: incentive taxable, Inclusive → 40,000 ÷ 1.12 = 35,714.285714… → **₱35,714.29** ✔
6. Rule H: NET GCI = 318,877.5510… + 35,714.2857… − 0 = 354,591.8367… → **₱354,591.84** ✔
7. Rule I: taxable base = 354,591.8367…; VAT memo = × 0.12 = 42,551.0204… → **₱42,551.02** ✔; EWT memo = × 0.10 = 35,459.1836… → **₱35,459.18** ✔
8. Rule J: yield = 354,591.8367… ÷ 8,000,000 = **4.4324%** ✔

**D004 — Resale / House & Lot / List ₱17,500,000 / 5% / receipt_issued = No / referral out fixed ₱75,000**
1. Rule A: Resale → property_vat = **n/a**; Rule B: net_list = 17,500,000.
2. Rule D: untaxed (no receipt) → vat_basis N/A.
3. Rule E: billed = 0.05 × 17,500,000 = 875,000; untaxed → GCI = **₱875,000.00** ✔
4. Rule G: referral_out = 0 + 75,000 = 75,000. Rule H: NET GCI = 875,000 − 75,000 = **₱800,000.00** ✔
5. Rule I: untaxed → VAT memo = EWT memo = ₱0 ✔. Rule J: yield = 800,000 ÷ 17,500,000 = 0.0457142857… = **4.5714%** ✔

**D011 — Developer / Megaworld GERI (comm_base = Gross) / Lot (always_vat) / List ₱12,359,740 / Fixed ₱174,500 / Inclusive**
1. Rule A: always_vat → vat_able. Rule B: net_list = 12,359,740 ÷ 1.12 = 11,035,482.14 (informational — Fixed basis does not use it).
2. Rule E: billed = 174,500 (Fixed); Inclusive → GCI = 174,500 ÷ 1.12 = 155,803.5714… → **₱155,803.57** ✔
3. Rule I: VAT memo = 155,803.5714 × 0.12 = **₱18,696.43**; EWT memo = **₱15,580.36** ✔

**D021 incentive release (payment-level, M5 Rule mirror):** Gross ₱50,000 on an Inclusive deal, Type = Incentive, incentive_taxable = Yes → Net = 50,000 ÷ 1.12 = 44,642.8571… → **₱44,642.86** ✔; VAT = 50,000 − 44,642.8571… = **₱5,357.14** ✔; EWT = 44,642.8571… × 0.10 = **₱4,464.29** ✔; Net Cash = 50,000 − 4,464.2857… = **₱45,535.71** ✔; Retained = 50,000 − 5,357.14 − 4,464.29 = **₱40,178.57** ✔.

All figures reproduce from the written rules alone. ∎

### 9.2 Given/When/Then criteria

1. **Given** default settings and M0 fixtures (Abrown Inc. = Net) **When** D021's inputs are entered **Then** the computed panel shows exactly: Net List ₱7,142,857.14; GCI ₱318,877.55; Incentive (Net) ₱35,714.29; NET GCI ₱354,591.84; VAT memo ₱42,551.02; EWT memo ₱35,459.18; Yield 4.43%.
2. **Given** D004's inputs **Then** GCI ₱875,000.00; NET GCI ₱800,000.00; memos ₱0; yield 4.57%; **and** M4 receives booked_net_gci = 800,000 (its Total Collectible logic is M4's).
3. **Given** D011's inputs **Then** GCI ₱155,803.57 despite comm_base = Gross (Fixed ignores base).
4. **Given** a threshold-type Developer deal at exactly ₱3,600,000.00 **Then** property_vat = exempt; at ₱3,600,000.01 → vat_able.
5. **Given** an under-threshold Developer deal with Force VAT = Yes **Then** vat_able with the override badge; audit shows the toggle.
6. **Given** a Rental with annual rent ₱270,000 and the 1-month preset **Then** GCI = ₱22,500.00 exactly and yield = 8.3333%.
7. **Given** a resale with receipt_issued switched No→Yes (Inclusive) **Then** GCI changes from billed to billed÷1.12 with a preview before save.
8. **Given** a deal with 2 payments **When** list_price is edited **Then** a confirmation lists old→new for every derived field; on confirm, M4 balance restates and payments are untouched; audit entry exists (edge case 13).
9. **Given** a payment exists against D010 **When** delete is attempted **Then** blocked with cascade explanation (edge case 10 counterpart).
10. **Given** a one-sided resale (representation = Buyer) with referral_out_pct = 2% **When** saving **Then** the split-at-source warning appears; save requires explicit continue (edge case 16).
11. **Given** an incentive with taxable = No on a taxable deal **Then** memos exclude it and incentive_net = billed.
12. **Given** the v30.20 workbook uploaded to the importer **Then** all 21 deals import with original codes D001–D021; recomputed figures match the workbook cache within ₱0.01 for every row (including D001's ₱436,050); mismatches would be reported, not imported.
13. **Given** 1,000 imported deals **Then** list view responds < 500 ms P95 and bulk recompute completes with progress UI.

## 10. Out of scope / future

No buyer-payment-cycle forecasting; no automated adjacent-property aggregation (manual toggle only); no accounting GL / e-BIR filings; no intra-team agent commission splits; no multi-currency; no document management (contracts/computation sheets) beyond a notes field; no OCR of developer computation sheets; no Exclusive-style VAT-basis modeling (removed 2026-07-17 — escape hatch via Fixed basis; reintroduce as a per-developer attribute only if observed in the wild).

## 11. Open questions

1. **Exclusive-VAT payment interpretation — ✅ RESOLVED BY REMOVAL (product owner, 2026-07-17).** The Inclusive/Exclusive option is removed from the product: all observed developers bill VAT-inclusive; the option was speculative future-proofing for a never-observed edge case, and its payment-side ambiguity was unanswerable without a live fixture. Billed commission on taxable deals is always treated VAT-inclusive (Rule D); the Exclusive-style edge case books via the Fixed-basis escape hatch; reintroduction path = per-developer attribute on the reserved `vat_basis` column. M5's Exclusive entry block is deleted (no blocked state exists).
2. **Memo base vs Referral Out.** All live taxable rows have zero referral out, so whether vat/ewt memos should be computed on `GCI + taxable incentive` (per prompt §3.4.5) or on `NET GCI` (net of referral out) is indistinguishable on the data (D021 ties both ways). Rule I implements `GCI + taxable incentive` per the prompt; confirm the intended treatment when a taxable deal carries a referral out — the sheet's cached AF/AG on such a row would settle it.
3. **Client/Counterparty semantics**: Start Here says "the party you represent … for Double Ended, the primary contact — the seller, or the developer for a Developer sale," while the Deal Log header says "for developer deals … the actual unit buyer." Live data uses the buyer. Importer + UI copy follow the header (buyer); confirm.
4. ~~Editable VAT Basis per Developer~~ — **retired with the OQ1 resolution** (2026-07-17): with the picker removed there is nothing to default. The per-developer-attribute design is recorded in Rule D as the reintroduction path if Exclusive billing is ever observed.
5. **Per-agent attribution (moot for v1 — single user)**: with one user per workspace, deal ownership needs no answer in v1; every deal is the agent's own. Recommendation stands: carry `created_by` on deals now (M0 §3.2 already requires it on financial rows; importer resolves it to the owner) so v2 per-agent attribution and views are free — no attribution UI or analytics in v1. Sheet has no agent column.
6. **Backdated deals & sequence**: importer preserves workbook codes; new deals continue after the highest imported code (D022). Confirm no requirement to re-open gaps (e.g., a workbook that skipped D005).
7. **Non-VAT payee billing by Inclusive developers (successor to resolved Q2).** For a non-VAT-registered agent, the engine books GCI = rate × base with no VAT component (fixture N1). Assumption to verify with the first real non-VAT developer SOA: Inclusive-style developers state the commission to a non-VAT payee as the same rate × base figure with **no VAT line at all** (they neither add 12% nor carve it out). If any developer instead strips 12% from a non-VAT payee's commission, that developer needs a per-developer override — do not build until observed.
