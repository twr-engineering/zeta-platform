# M5 — Payments Log — PRD

**Product:** ZETA GCI + Collections · **Module:** M5 · **Source of truth:** v30.20 workbook — *Payments Log* sheet (+ Start Here payment rules) · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every business rule is stated in full with formulas and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M5 is the **daily-use surface of the whole product**: every time a developer or client releases commission money, the user logs one payment row here — date, which deal, gross amount — and the system splits that gross into Net-of-VAT income, Output VAT, EWT withheld, Net Cash (what hits the bank), and Retained Cash (what is truly the agent's after taxes). Payments are the only source of "collected" truth: M4 balances, M6 dashboard position and pace, M8 cash/tax reports, and M9 search all aggregate M5 rows.

**Spreadsheet behavior it replaces.** The *Payments Log* sheet holds 1,000 payment rows. The user fills four "blue" inputs — Date, Deal ID (a dropdown showing `"D001 — Client Name"`, with a helper column and an optional Apps Script to strip the label back to a clean ID), Gross Commission ₱ (as billed), Type (blank = Commission; `Incentive` for a standalone incentive release), plus an optional OR/Invoice note. ARRAYFORMULA columns then look up the referenced deal and compute the tax split live. A Deal ID that matches no real deal computes nothing (the "typo safeguard"). Live rows store an explicit `"Commission"` type even though blank is documented as commission.

**What improves in SaaS form.**

1. The dropdown + cleanup-script dance becomes a **searchable deal picker** (type-ahead on code or client name) backed by a **hard foreign key** — a payment cannot reference a nonexistent or archived deal (edge case 10); the API rejects unknown references instead of silently computing nothing.
2. **⚠ Deliberate behavior change — split snapshot.** The sheet recomputes every payment's tax split live, forever: change a deal's VAT Basis or the workspace EWT rate and all historical payment rows silently rewrite. The SaaS instead **captures the split at save time** using the deal's then-current `vat_basis` and the workspace `ewt_rate`, and stores it on the payment row. Payment rows are *statements of what was actually withheld when the money moved* — historical facts, not live formulas. Editing a payment deliberately recomputes with current deal/settings; editing the deal or the rates does **not** silently rewrite past payments. (Flagged again in Open Questions 6 for product-owner sign-off; consistent with M0 §4 rule 3 and M1 edge case 13.)
3. Every mutation is audit-trailed; deleting a payment restates the receivable balance through an M4 event instead of a spreadsheet recalc.
4. Mobile-first fast entry — the workbook tab used daily, often from a phone, becomes a form optimized for "log a release in under 30 seconds."

**Domain glossary (payment-side; the developer has no context — see M1 §1 for the full deal-side glossary):**
- **Commission release** — the payor (a property developer, or a resale/rental client) actually paying out part or all of the commission owed on a deal. Pre-selling developers pay in **tranches** over months or years, so multiple payments per deal is the normal case, not the exception.
- **Gross Commission (as billed)** — the ₱ figure on the payor's payment advice *before* any tax withholding. This is the user's input; everything else derives.
- **Output VAT** — the 12% value-added tax inside (or on top of) the commission, which the broker must remit to the BIR (Philippine tax bureau). Not the broker's money.
- **EWT** — Expanded Withholding Tax (default 10%). The payor deducts it *before* wiring the money and remits it to the BIR on the broker's behalf; the broker claims it back later as an income-tax credit via **BIR Form 2307**. So the bank deposit is smaller than the gross, but the EWT is not lost — it is prepaid income tax.
- **Net Cash** — what actually lands in the bank: `gross − EWT`. Ties bank statements to the app.
- **Retained Cash** — what the agent truly keeps after setting aside the VAT they owe: `gross − VAT − EWT`.
- **OR / Invoice** — Official Receipt or BIR-registered invoice number issued for the payment; free-text reference in v1.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. They wear every hat the workbook's team divided up.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Log their own releases the moment a payment advice arrives — often from a phone, minutes after the developer's advice email; verify a deal's payment history before chasing the developer themselves; attach OR/invoice references; correct their own mis-keyed payments (friction-gated: explicit confirmation + audit entry, rule 11); reconcile against Collection Reports (M8); trust that Net Cash ties to the bank; export for their bookkeeper. |
| *(v2, out of scope)* | Team roles — Owner/Rainmaker, Admin/ISA bulk entry, team Agents logging on own deals, Read-only — arrive with multi-member workspaces (see Open Question 3). |

## 3. Data model

### 3.1 Payment entity

Inputs (user-editable) — `(I)`; computed — `(C)`. Money `decimal(14,2)` at rest, full-precision decimal in computation (M1 rounding policy applies: full precision through intermediates, round half-up to centavos at storage/display; never binary floats — edge case 15). All rows carry `workspace_id`, `created_at/by`, `updated_at/by`, soft-delete `deleted_at`, and audit trail.

| # | Field | Sheet col | I/C | Type | Req | Validation / Default | Derivation |
|---|---|---|---|---|---|---|---|
| 1 | payment_date | B | I | date | ✔ | any date; **warn** (not block) if in the future; **warn** if earlier than the deal's booked_date (Open Question 5) | |
| 2 | deal_id | C (+R helper) | I | fk → M1 Deal | ✔ | must reference an **existing, non-archived** deal in this workspace — hard FK, API rejects unknown/archived references (edge case 10). Picker shows `display_label` = `"D021 — Daria & John Salon"`, searchable by code or client name; stores the FK, not the label (replaces the sheet's dropdown + helper column R + cleanup script). | |
| 3 | gross_amount | H | I | money | ✔ | **> 0** (zero and negative rejected; refunds/clawbacks are Open Question 2) | |
| 4 | payment_type | I | I | enum | ✔ | `Commission` (default) \| `Incentive`. Sheet treats blank as Commission; live rows store explicit `"Commission"`; the importer (M1.4) treats blank ≡ `Commission` (workbook register item 9). | |
| 5 | reference_note | O | I | string(240) | | optional OR / Invoice / free note (uniqueness not enforced in v1 — Open Question 4) | |
| 6 | net_of_vat | K | C | money | | | **Split snapshot** — Rule P1–P4 result stored at save time (§3.2/§3.3) |
| 7 | vat_amount | L | C | money | | | snapshot, §3.2 |
| 8 | ewt_amount | M | C | money | | | snapshot, §3.2 |
| 9 | net_cash | N | C | money | | | snapshot, §3.2: `= gross_amount − ewt_amount` |
| 10 | retained_cash | (dashboard) | C | money | | | snapshot, §3.2: `= gross_amount − vat_amount − ewt_amount` (the sheet computes this at dashboard level; the SaaS stores it with the split) |
| 11 | vat_basis_used | J | C | enum | | | snapshot of the deal's `vat_basis` at save time (`inclusive`/`n/a` — the Exclusive value was removed from the product 2026-07-17) — the split's audit anchor |
| 12 | ewt_rate_used | — | C | rate | | | snapshot of workspace `ewt_rate` at save time (e.g., 0.10) |
| 13 | vat_rate_used | — | C | rate | | | snapshot of workspace `vat_rate` at save time (0.12) |
| 14 | year_paid | P | C | int | | | `= year(payment_date)` — feeds M6 monthly cash-in, M8 cash-per-year and tax-per-month |
| 15 | month_paid | Q | C | int | | | `= month(payment_date)` — same consumers |

**Denormalized display fields (never stored — resolved by join at read time):** deal booking year (D), developer (E), client/buyer (F), property details (G), and the deal's *current* VAT Basis for reference. Joining (rather than copying) means M0 rename-propagation works and the payments list always shows current deal identity; the **tax split** is the only snapshotted part, because it is a statement of money that already moved. `vat_basis_used` (stored) and the deal's current `vat_basis` (joined) can legitimately differ after a deal correction — the UI marks such rows (§6).

### 3.2 Split computation — contract of M1's `computePaymentSplit` (single source of money truth)

The split is computed by **`computePaymentSplit(gross, payment_type, deal, settings)` in M1's engine library** (M1 FR-M1-05, built in milestone M1.1, fixture-tested there). **M5 must NOT re-implement this math** — not in the API, not in the UI preview. The rules below are the *contract* M5 depends on, restated with worked ₱ examples so this PRD stands alone; the implementation and its unit tests live in M1.

**Rule P1 — deal VAT Basis = `Inclusive`** (the 12% VAT is inside the billed gross):

```
net_of_vat    = gross ÷ 1.12
vat           = gross − net_of_vat
ewt           = net_of_vat × ewt_rate
net_cash      = gross − ewt              (what the bank receives — payor withheld only EWT)
retained_cash = gross − vat − ewt        (yours after setting aside the VAT owed to BIR)
```

*Worked ₱ (verified fixture — D021 incentive release, Gross ₱50,000, EWT 10%):*
net = 50,000 ÷ 1.12 = 44,642.857142… → **₱44,642.86**; VAT = 50,000 − 44,642.86 = **₱5,357.14**; EWT = 44,642.857142… × 0.10 = 4,464.2857… → **₱4,464.29**; Net Cash = 50,000 − 4,464.29 = **₱45,535.71**; Retained = 50,000 − 5,357.14 − 4,464.29 = **₱40,178.57**.

**Rule P2 — deal untaxed (`vat_basis = N/A`)** (unreceipted resale/rental — see M1 Rule D):

```
net_of_vat = gross;  vat = 0;  ewt = 0;  net_cash = gross;  retained_cash = gross
```

*Worked ₱ (verified fixture — D004 payment, Gross ₱875,000):* Net **₱875,000.00** / VAT **₱0** / EWT **₱0** / Net Cash **₱875,000.00** / Retained **₱875,000.00**.

**Rule P3 — `payment_type = Incentive` AND the deal's `incentive_taxable = No`** (edge case 7): the incentive was booked tax-free, so its release carries no tax regardless of the deal's VAT basis:

```
net_of_vat = gross;  vat = 0;  ewt = 0;  net_cash = gross;  retained_cash = gross
```

*Worked ₱:* a ₱30,000 incentive release on an Inclusive deal whose Incentive Taxable? = No → Net ₱30,000.00 / VAT ₱0 / EWT ₱0 / Net Cash ₱30,000.00. (An Incentive-type payment where `incentive_taxable` = Yes/blank follows the deal's basis normally — that is exactly the D021 fixture under Rule P1.)

**Rule P5 — non-VAT-registered workspace (product decision 2026-07-17, M0 `vat_registered = false`):** commission VAT never exists on any payment. EWT-subject deal (developer, or receipted resale/rental — M1 Rule D gate): `net_of_vat = gross`; `vat = 0`; `ewt = gross × ewt_rate`; `net_cash = gross − ewt`; `retained_cash = net_cash`. Unreceipted deal → all-net pass-through (as Rule P2). Incentive-type payment with `incentive_taxable = No` → all-net (as Rule P3).
*Worked ₱ (fixture N1 payment; ewt_rate 5%):* commission release Gross ₱357,142.86 on a non-VAT workspace → Net **₱357,142.86** / VAT **₱0** / EWT **₱17,857.14** / Net Cash **₱339,285.71** / Retained ₱339,285.71. Note vat_basis is `n/a` on every non-VAT-workspace deal (M1 Rule D).

**Rule P4 — retired (2026-07-17).** The former Exclusive-basis rule is deleted with the option itself: OQ1 was **resolved by removal** — taxable deals always split per Rule P1 (VAT inside the gross), so no blocked state, disabled picker rows, or pending interpretation exists anywhere in M5. An Exclusive-style release booked via M1's Fixed escape hatch (Fixed = VAT-inclusive total) flows through Rule P1 correctly by construction.

**Rounding & identity checks:** compute in full precision; round each stored field half-up to centavos. After rounding, `net + vat` may differ from `gross` by ≤ ₱0.01 — reconciliation checks (M6 Data Health, M8) use the ₱0.50 tolerance, **never** float equality (edge case 15).

**Booked memos vs payment splits — do not conflate (common developer trap):** M1's per-deal `vat_memo`/`ewt_memo` (M1 Rule I) are *projections* of the tax the whole deal will eventually carry, computed on booked figures. M5's per-payment VAT/EWT are the *actuals* of each release. They need not tie row-for-row (D021: booked EWT memo ₱35,459.18 for the full deal; the first release's actual EWT is ₱4,464.29). **M8 reports tax from payments (actuals), never from memos.** The memos exist for planning and for sanity-checking a fully-collected deal.

### 3.3 Snapshot policy (deliberate change from the sheet)

1. **On create:** split computed from the deal's *current* `vat_basis` + `incentive_taxable` and the workspace's *current* `vat_rate`/`ewt_rate`; all five ₱ fields + the three `*_used` snapshot fields stored on the row.
2. **On payment edit** (date, deal reference, gross, type): the split **recomputes with the deal/settings as they are now** — an edit asserts "this is what the payment really was," so it re-snapshots. Old→new audit entry mandatory.
3. **Deal edits and settings changes never rewrite stored payment splits.** When a deal's `vat_basis` (or `incentive_taxable`) changes while payments exist, M1's edit-confirmation (M1 §4 rule 3) lists the affected payments and offers an explicit, opt-in "recompute these N payment splits" — each recompute is per-payment audit-trailed. Declining leaves history intact and the rows marked stale-basis (§6).
4. **EWT rate change mid-year** (edge case 14 corollary): existing payments keep their stored split; only payments saved after the change use the new rate. *Worked ₱:* EWT 10%→5% on July 1 — a June payment of Gross ₱50,000 (Inclusive) keeps EWT ₱4,464.29; the same gross logged in July gets EWT = 44,642.86 × 0.05 = **₱2,232.14**.

**Why snapshot wins over live recompute (rationale for the product owner and the developer):** payment splits are *tax facts* — the EWT on a March release was actually withheld at March's rate and will appear on a March 2307 certificate; the VAT on it belongs to March's BIR remittance. If a later settings change rewrote those rows, M8's "Tax collected per month" would stop matching the certificates and remittances already filed. The sheet tolerates live recompute because its data rarely spans a rate change; a multi-year SaaS cannot.

### 3.4 Event payloads (consumed by M4/M6/M8/M9)

| Event | Emitted on | Payload (beyond ids/actor/timestamp) | Consumers & effect |
|---|---|---|---|
| `payment.created` | FR-M5-01, importer bulk path | deal_id; payment_date; year_paid, month_paid; gross, net_of_vat, vat_amount, ewt_amount, net_cash, retained_cash; payment_type | M4: Collected += net_of_vat, Balance/Last+First Payment/Months Idle restate · M6/M8: aggregate caches · M9: index row |
| `payment.updated` | FR-M5-07, recompute flow (FR-M5-10) | old + new values of every §3.1 field that changed | M4: restate deltas · M6/M8: re-aggregate affected periods (old AND new year/month) · M9: reindex |
| `payment.deleted` | FR-M5-08 | full final field set (for reversal math) | M4: Collected −= net_of_vat, balance/idle restate · M6/M8/M9: drop from aggregates/index |

Delivery is transactional with the mutation (§8): a payment row and its receivable restatement commit together or not at all.

## 4. Business rules & edge cases (numbered)

1. **Referential integrity (edge case 10).** A payment must reference an existing, non-archived deal in the same workspace. The sheet's typo safeguard (bad ID → row computes nothing) becomes a hard FK; the API rejects unknown, archived, or cross-workspace deal references with a clear error. There is no "orphan payment" state.
2. **Multiple releases per deal are normal.** Pre-selling developers pay in tranches (monthly amortized shares, bulk releases at milestones); D021 already shows an incentive released before any commission tranche. No uniqueness constraint on (deal, date, amount) — same-day multiple payments are allowed (rule 3 covers accidental doubles).
3. **Duplicate guard (soft).** Same deal + same gross + same date as an existing payment → non-blocking "possible duplicate" warning with the existing row shown. Never a hard block (legitimate identical tranches exist).
4. **Gross must be positive.** Zero and negative amounts rejected. Refunds/clawbacks (developer takes money back after a buyer default) are not representable in v1 — Open Question 2.
5. **No blocked payment states.** Every deal in the workspace is payable (rule retired 2026-07-17 with the Exclusive option — formerly this rule blocked Exclusive deals pending OQ1). The engine asserts `vat_basis_used ∈ {inclusive, n/a}` at save; any other value is a defect, not a business state.
6. **Incentive-type payment on a non-taxable-incentive deal → zero tax** (edge case 7, Rule P3). Driven by the *deal's* `incentive_taxable` flag at save time — the payment row itself carries no taxable flag.
7. **Payment against a `Cancelled` or `Closed` receivable: allowed with warning** — late releases happen (a developer pays a tranche after the user already closed the deal short, or cash arrives on a cancelled deal). The warning states the receivable status and **prompts to reopen** (set M4 status back to `Open`) so balance math resumes; the user may decline and log anyway (M4 then shows over-collection in Variance — edge case 8 surfaces it in Data Health). Reopening itself is an M4 mutation behind M4's friction-gate confirmation.
8. **Future-dated payments: warn, don't block.** Post-dated check releases are real; the warning prevents typos (e.g., 2062).
9. **Payment date before the deal's booking date: warn only** (Open Question 5). The sheet allows it silently — and live data actually contains one: D021's incentive release is dated 2026-07-09, one day *before* its booking date 2026-07-10 (D001's payment, by contrast, is 13 days after booking). A hard block would reject real workbook data at import. Recommendation: warn on manual entry; importer accepts without warning (historical fact).
10. **Deleting a payment restates the receivable.** Soft-delete; emits `payment.deleted` consumed by M4 to restate Collected / Balance / Last Payment / Months Idle / First Payment. *Worked ₱:* deleting D021's ₱50,000 incentive release returns its balance from ₱309,948.98 to ₱354,591.84 (Collected 44,642.86 → 0).
11. **Edit/delete is friction-gated (v1).** The account owner can edit or delete any payment — but both are money-restating actions, so each requires an explicit confirmation (delete states the receivable restatement; edit shows the current stored split vs the recomputed one) and always writes a field-level old→new audit entry (cross-cutting requirement). The confirmation is the safeguard where the team workbook would have relied on role restrictions; per-role edit scopes (e.g., team Agents limited to own recent payments, proposed ≤ 7 days) are a v2 concern — Open Question 3.
12. **Snapshot policy per §3.3** — deal/settings edits never silently rewrite stored splits; payment edits re-snapshot; recompute is always explicit and audit-trailed.
13. **Decimal money everywhere** (edge case 15): decimal arithmetic only; ₱0.50 tolerance for reconciliation comparisons; float equality forbidden.
14. **Blank type ≡ Commission on import** (workbook register item 9): the M1.4 importer maps blank and `"Commission"` to `Commission`; the SaaS itself always stores an explicit value.
15. **Deal archival with payments** is governed by M1 §4 rule 2 (blocked / explicit cascade); M5's FK makes payments un-orphanable from this side.
16. **Every payment counts toward Collected, regardless of type.** M4's Collected (Net of VAT) sums `net_of_vat` over commission AND incentive payments alike — verified: D021's receivable shows Collected ₱44,642.86 from the incentive release alone. Do not filter by type when restating balances.
17. **Snapshot fields are immutable outside the audited flows.** No API or admin path may write `net_of_vat`/`vat_amount`/`ewt_amount`/`net_cash`/`retained_cash`/`*_used` directly; they change only via payment edit (§3.3.2) or the explicit recompute flow (§3.3.3), each of which re-runs the engine and writes audit entries.
18. **Payment identity is workspace-scoped and boring on purpose:** no user-visible payment numbering (the OR/Invoice note carries the payor's reference); ordering in every view is by payment_date, newest first, ties broken by created_at.
19. **Period derivation** (feeds M6/M8): `year_paid = year(payment_date)`, `month_paid = month(payment_date)` — always from the payment date, never the booking date; the deal's `booked_year` (from M1) is what M8's vintage matrix crosses against `year_paid`. *Worked:* D021's release dated 2026-07-09 lands in paid-period (2026, July) and, since D021 booked 2026-07-10 → booked_year 2026, in the matrix cell (paid 2026 × booked 2026).
20. **Dates are calendar dates, not timestamps.** `payment_date` is a date-only field — no timezone conversion may ever shift a payment across a month/year bucket. The form's "today" default is computed in the workspace timezone (v1 fixed to Asia/Manila, matching the PHP-only currency scope); servers must not derive it from UTC (a 7 AM Manila entry is *not* yesterday).

## 5. Functional requirements

- **FR-M5-01** Create payment: form/API accepting payment_date, deal reference, gross_amount, payment_type, reference_note; server computes the split via M1's `computePaymentSplit` and stores the snapshot (§3.1–3.3) atomically; rejects invalid deal references (rule 1) and non-positive gross (rule 4).
- **FR-M5-02** Deal picker API: type-ahead search over active deals by deal code and client name, returning `display_label` ("D021 — Daria & John Salon"), developer, booked year, and receivable status/balance (so the picker can hint "Open · bal ₱309,948.98"); every active deal is payable (rule 5).
- **FR-M5-03** Split preview: before save, the form shows the full computed split (Net / VAT / EWT / Net Cash / Retained) for the entered gross — produced by the same engine function via a preview endpoint or shared library, **never a UI re-implementation**.
- **FR-M5-04** Warnings engine: future date, pre-booking date, possible duplicate, Closed/Cancelled receivable (with reopen prompt) — amber, non-blocking, "Continue anyway" audit-logged.
- **FR-M5-05** Read: payments list, default sort payment_date **newest first** (the sheet's daily-use convention), columns per §6; filters: year_paid, month, deal, developer, payment_type, text (client/property/reference); pagination.
- **FR-M5-06** Per-deal payments panel: embeddable list of a deal's payments (chronological) with running collected total, surfaced on the M1 deal detail and the M4 receivable view.
- **FR-M5-07** Update payment per rule 11 (friction-gated): explicit confirmation, then re-runs validation + split snapshot (§3.3.2); old→new audit entry; emits `payment.updated`.
- **FR-M5-08** Delete (soft) per rule 11: confirmation states the receivable restatement; emits `payment.deleted`; audit entry (rule 10).
- **FR-M5-09** Events: `payment.created/updated/deleted` carrying deal_id, old/new split fields, year_paid/month_paid — consumed by M4 (collected/balance/idle restatement), M6 (position, pace, monthly cash-in), M8 (all reports), M9 (search index).
- **FR-M5-10** Explicit recompute flow (§3.3.3): when M1 signals a basis-affecting deal edit, list affected payments and apply opt-in per-payment recompute with audit entries.
- **FR-M5-11** CSV/XLSX export of the payments list (filtered set, all ₱ columns).
- **FR-M5-12** Stale-basis indicator: rows where `vat_basis_used` ≠ the deal's current `vat_basis` are flagged in list/detail (§6) and queryable (feeds an M6 Data Health check).
- **FR-M5-13** Importer support (leg owned by M1.4): expose a bulk-create path that preserves payment dates/types/notes, treats blank type as Commission, computes splits via the engine, and reconciles against the workbook's cached K/L/M/N within ₱0.01 — the 8 live payments in WORKBOOK_REFERENCE §4 are the acceptance fixtures.

## 6. UI/UX requirements

### 6.1 Fast-entry form — the "log a release in < 30 seconds" bar

Field order and behavior are the product's daily heartbeat; optimize ruthlessly:

- Opens with **date defaulted to today** and keyboard focus in the **deal picker**.
- Picker is type-ahead over deal code and client name — typing "sal" or "21" finds `D021 — Daria & John Salon` — each option showing developer, receivable status and open balance ("Open · bal ₱354,591.84") so the user confirms they grabbed the right deal without leaving the form. This replaces the sheet's dropdown + helper column + cleanup Apps Script.
- **Gross amount** next (₱ numeric keypad on mobile); then **type toggle** Commission/Incentive with Commission preselected (one extra tap only for the rarer case); optional OR/Invoice note last.
- **Live split preview** — Net of VAT / VAT / EWT / Net Cash / Retained, ₱-formatted — renders before save so the user can eyeball the split against the payor's payment advice (the advice typically states net-of-VAT and EWT explicitly; matching numbers = correctly picked deal and basis).
- Save → success toast showing the stored split + an "undo" affordance (the delete path, friction-gated); form resets with focus back in the picker for the next entry.

### 6.2 Payments list

- Default sort payment_date **newest first** (the sheet's daily-use convention), ties by created_at.
- Columns: Date · Deal (label, linked) · Deal Year · Developer · Client/Buyer · Property · Type badge · Gross · Net of VAT · VAT · EWT · Net Cash · Note. All ₱ `#,##0.00`.
- Joined identity columns always show *current* deal data (renames propagate); split columns are the stored snapshot, visually locked per the product-wide input-vs-computed convention (M0 §6) with formula tooltips (e.g., "Net = Gross ÷ 1.12 — captured at save, 2026-07-09, EWT 10%").
- Sticky header; filters (year, month, deal, developer, type) + text search; Export button on the filtered set.

### 6.3 Per-deal payments panel

- Embedded on the M1 deal detail and the M4 receivable view: chronological rows + running collected total vs Total Collectible (e.g., D021: "44,642.86 of 354,591.84 · 12.6%").
- "Log a payment" button pre-fills the fast-entry form with that deal.

### 6.4 Inline states & warnings

- Incentive rows carry a badge; zero-tax rows (Rules P2/P3) show "untaxed" in the VAT/EWT cells rather than bare ₱0.00 with no context.
- Stale-basis rows (FR-M5-12): ⚠ badge with tooltip "Split captured under VAT basis 'inclusive'; the deal is now 'n/a' (e.g., receipt flag or VAT registration changed). Recompute from the payment's edit screen."
- Warnings (future date, pre-booking date, duplicate, Closed/Cancelled) render as amber inline banners with explicit "Continue anyway" (audit-logged); the Closed/Cancelled banner includes a "Reopen receivable" action (M4 confirmation-gated).
- Edit screen shows current stored split vs what a recompute would produce, side by side, before the user commits (§3.3.2).

### 6.5 Mobile-first & empty states

- This is the tab used daily, often on a phone: the entry form must be fully usable one-handed at 360 px; the list collapses to cards (date, deal label, gross, net cash, type badge).
- Empty state: "No payments yet — log the first release against a deal," with an importer entry point if the workspace has no deals either.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M0 | TaxSettings `vat_rate`, `ewt_rate` (snapshot inputs); friction-gate confirmation pattern (§3.2); audit infrastructure |
| reads ← | M1 | Deal by FK: `deal_code`, `display_label`, `client_name`, `property_details`, `developer`, `booked_year`, `vat_basis`, `incentive_taxable`, `archived_at`; engine function `computePaymentSplit` (the only split implementation) |
| writes → | M4 | `payment.created/updated/deleted` → restate Collected (Σ net_of_vat, commission AND incentive types both count), Balance = Total Collectible − Collected, Last/First Payment dates, Months Idle, Days to 1st Release; reopen prompt (rule 7) invokes M4 status change |
| read by | M6 | position (Σ gross/vat/ewt/net_cash → Cash & Tax section), Collected Net vs target pace (year_paid), monthly cash-in (month_paid), Data Health (stale-basis, closed-short/over via M4) |
| read by | M8 | all five reports: cash per year_paid, collection × booking-year matrix (year_paid × deal.booked_year), monthly cash flow, tax per month (Σ vat_amount to remit, Σ ewt_amount as 2307 credits), booking-year summary |
| read by | M9 | search index: date, deal code/client/property, gross, net_of_vat, net_cash, year_paid |
| receives ← | M1.4 importer | bulk payment creation per FR-M5-13 (importer leg owned by M1.4; M5.1 schema must land first) |
| read by | M10 | fast-entry form is a first-run guided step ("log your first payment"); input-vs-computed legend covers the locked split columns |

## 8. Non-functional requirements

- **Performance:** ≥1,000 payments per workspace stays instant — list P95 < 500 ms; create round-trip (validate + split + events) < 300 ms server time; split preview < 100 ms; picker type-ahead < 150 ms over 1,000 deals.
- **Correctness:** split math only via M1's engine (one code path); decimal-exact; snapshot fields immutable except through the audited edit/recompute flows.
- **Access control:** auth + absolute tenant isolation enforced server-side on every route; money-restating mutations (edit/delete/recompute) are friction-gated per rule 11 — explicit confirmation + audit entry, no role checks in v1; schema stays v2-role-ready (M0 §3.2).
- **Auditability:** every create/update/delete/recompute writes an immutable audit entry with field-level old→new; the snapshot `*_used` fields make any historical split independently re-derivable.
- **Concurrency:** optimistic locking on payment edits; event delivery to M4 transactional with the mutation (a payment can never exist whose receivable ignores it).

## 9. Acceptance criteria (Given/When/Then)

Fixtures reproduce **to the centavo** (verified against the workbook; same numbers as M1 §9.1).

1. **Given** deal D021 (Inclusive, incentive_taxable = Yes) and EWT 10% **When** a payment of Gross ₱50,000, Type = Incentive, date 2026-07-09 is saved **Then** the stored split is exactly: Net of VAT **₱44,642.86** / VAT **₱5,357.14** / EWT **₱4,464.29** / Net Cash **₱45,535.71** / Retained **₱40,178.57**; `vat_basis_used = Inclusive`, `ewt_rate_used = 0.10`; **and** M4 shows D021 Collected ₱44,642.86, Balance ₱309,948.98 (= 354,591.84 − 44,642.86).
2. **Given** untaxed deal D004 (vat_basis N/A) **When** Gross ₱875,000 is logged **Then** Net **₱875,000.00** / VAT ₱0 / EWT ₱0 / Net Cash **₱875,000.00** / Retained ₱875,000.00 (Rule P2).
2b. **Given** a non-VAT-registered workspace (EWT 5%) and fixture N1's deal **When** Gross ₱357,142.86 is logged **Then** Net ₱357,142.86 / VAT ₱0 / EWT **₱17,857.14** / Net Cash **₱339,285.71** (Rule P5); the same workspace's unreceipted resale payment passes through all-net.
3. **Given** an Inclusive deal with incentive_taxable = No **When** an Incentive-type payment of ₱30,000 is logged **Then** VAT = EWT = ₱0 and Net = Net Cash = ₱30,000.00 (Rule P3, edge case 7); a Commission-type payment on the same deal still splits per Rule P1.
4. **Given** a payment referencing deal code "D999" (nonexistent) or an archived deal **When** submitted via API **Then** rejected with a referential-integrity error; nothing stored (edge case 10).
5. **Given** an Exclusive-style release booked via M1's Fixed escape hatch (Fixed = ₱112,000 VAT-inclusive total) **When** Gross ₱112,000 is logged **Then** it splits per Rule P1: Net **₱100,000.00** / VAT **₱12,000.00** / EWT ₱10,000.00 / Net Cash **₱102,000.00** — ties to the payor's advice with zero special-case code (rule 5: no blocked states).
6. **Given** an existing D021-style payment (EWT ₱4,464.29) **When** workspace EWT changes to 5% **Then** the stored split is untouched; a new Gross ₱50,000 Inclusive payment then computes EWT **₱2,232.14** (§3.3.4).
7. **Given** payments exist on a deal **When** the deal's vat_basis is edited in M1 **Then** stored splits do not change; the confirmation offers opt-in recompute; declined → rows flagged stale-basis (FR-M5-12); accepted → per-payment audit entries and re-snapshotted splits (§3.3.3).
8. **Given** D021's ₱50,000 payment **When** the user deletes it (confirming the stated receivable restatement — the rule-11 friction gate) **Then** soft-deleted with audit entry; M4 restates Collected → ₱0 and Balance → ₱354,591.84; M6/M8 aggregates drop it (rule 10).
9. **Given** a receivable with status Closed (or Cancelled) **When** a payment is logged against it **Then** an amber warning names the status and offers "Reopen receivable"; logging proceeds on explicit continue (rule 7).
10. **Given** Gross ₱0 or −₱5,000 **When** submitted **Then** rejected (rule 4).
11. **Given** a payment dated tomorrow, or dated before the deal's booked_date **Then** save succeeds after an explicit warning acknowledgment; the acknowledgment is audit-logged (rules 8–9).
12. **Given** same deal + gross + date as an existing payment **When** saving **Then** the possible-duplicate warning shows the existing row; continue is allowed (rules 2–3).
13. **Given** the v30.20 workbook's 8 live payments **When** imported via M1.4 **Then** all 8 rows land with splits matching the sheet's cached values within ₱0.01 and blank/"Commission" types both stored as `Commission`. The full importer fixture set (WORKBOOK_REFERENCE §4):

    | Date | Deal | Gross | Type | Basis | Net of VAT | VAT | EWT | Net Cash |
    |---|---|---|---|---|---|---|---|---|
    | 2026-01-13 | D001 | 436,050.00 | Commission | N/A | 436,050.00 | 0 | 0 | 436,050.00 |
    | 2026-07-03 | D004 | 875,000.00 | Commission | N/A | 875,000.00 | 0 | 0 | 875,000.00 |
    | 2026-07-04 | D017 | 22,500.00 | Commission | N/A | 22,500.00 | 0 | 0 | 22,500.00 |
    | 2026-07-05 | D018 | 130,000.00 | Commission | N/A | 130,000.00 | 0 | 0 | 130,000.00 |
    | 2026-07-06 | D019 | 10,000.00 | Commission | N/A | 10,000.00 | 0 | 0 | 10,000.00 |
    | 2026-07-07 | D020 | 37,500.00 | Commission | N/A | 37,500.00 | 0 | 0 | 37,500.00 |
    | 2026-07-08 | D006 | 352,500.00 | Commission | N/A | 352,500.00 | 0 | 0 | 352,500.00 |
    | 2026-07-09 | D021 | 50,000.00 | Incentive | Inclusive | 44,642.86 | 5,357.14 | 4,464.29 | 45,535.71 |

    (D001's basis cell lost its cache in the export — it hosts the sheet's formula anchor row — but the deal is an unreceipted resale, so N/A / all-net is the correct recomputation; the importer reconciles it by recomputation, not cache.)
14. **Given** a phone-sized viewport and an existing deal **When** a practiced user logs a release **Then** date defaults to today, the picker finds the deal by typing part of the client name, the split preview renders before save, and the whole flow takes < 30 seconds.
15. **Given** any filtered payments list **When** Export is clicked **Then** CSV/XLSX downloads matching on-screen rows and ₱ values.
16. **Given** a payment edit or delete request **When** submitted without the explicit confirmation acknowledgment, or from another workspace's account **Then** rejected (400/403), nothing changes, no audit entry; **When** the owner confirms **Then** it succeeds with a field-level old→new audit entry (rule 11 friction gate).
17. **Given** D021 with its ₱50,000 release **When** the per-deal payments panel renders on the deal or receivable view **Then** it shows the release row and "₱44,642.86 of ₱354,591.84 · 12.6%" — tying centavo-exact to M4's Collected/Total Collectible.
18. **Given** a server running in UTC and a user in Manila at 7:00 AM on July 10 **When** the entry form opens **Then** the date defaults to July 10 (not July 9), and a payment saved with that date lands in July's M6/M8 buckets (rule 20).

## 10. Out of scope / future

- Refunds, clawbacks, negative adjustments (Open Question 2) — v1 models money in only.
- Payor remittance forecasting (no buyer-to-developer payment-cycle prediction — product philosophy: reactive logging).
- Bank-feed integration / auto-matching bank credits to payments; receipt (2307/OR) file attachments; automated BIR e-filing.
- Payment-level EWT overrides (rate is workspace-global at snapshot time — M0 Open Question 4).
- Splitting one bank credit across multiple deals in a single entry (log one payment per deal).
- Exclusive-style VAT-basis modeling (option removed 2026-07-17; Fixed-basis escape hatch covers the edge case).

## 11. Open questions

1. **Exclusive-VAT payment interpretation — ✅ RESOLVED BY REMOVAL (product owner, 2026-07-17; shared with M1 OQ1).** The Inclusive/Exclusive option is removed from the product entirely: all splits on taxable deals follow Rule P1, the Exclusive entry block (former rule 5 / Rule P4) is deleted, and the Exclusive-style edge case is covered by M1's Fixed-basis escape hatch (acceptance criterion 5 proves the flow). Reintroduction path, if ever observed: per-developer attribute on the reserved `vat_basis` column.
2. **Clawbacks / negative payments:** how should a developer reclaiming a released tranche (buyer default) be represented — negative payment, reversal entry linked to the original, or deal cancellation flow only? v1 rejects negatives (rule 4).
3. **May Agents log payments? — deferred to v2.** Moot in v1: the workspace has exactly one user, and the account owner logs every payment (friction gates, not roles, guard edits — rule 11). When v2 team roles arrive, decide whether team Agents create payments on own deals only, and define the "recent" window for Agent self-edits (proposed ≤ 7 days). Keep `created_by` on every payment row now (§3.1 already does) so v2 attribution works retroactively.
4. **OR/Invoice number uniqueness:** should reference_note (or a dedicated OR-number field) enforce per-workspace uniqueness to catch double-entry? Sheet has no constraint; v1 free-text.
5. **Payment date before deal booking date:** sheet allows silently, and the live workbook contains one such row — D021's incentive release (2026-07-09) precedes its booking date (2026-07-10). Recommendation: **warn only** on manual entry, importer accepts silently (rule 9) — confirm no hard block is wanted; a block would both reject real historical data at import and fight real-world practice (releases advised before formal booking paperwork lands).
6. **Split snapshot policy sign-off (§3.3):** confirm the deliberate divergence from the sheet — stored splits are frozen at save; deal/settings edits require explicit opt-in recompute per payment. Also confirm payment *edits* re-snapshotting under *current* deal/settings (not the original save-time settings) matches intent.
