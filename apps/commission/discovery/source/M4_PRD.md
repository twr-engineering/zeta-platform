# M4 — Collectibles (Receivables Ledger) — PRD

**Product:** ZETA GCI + Collections · **Module:** M4 · **Source of truth:** v30.20 workbook — *Collectibles* sheet + *Start Here* rules · **Audience:** developers with zero real-estate and zero PH-tax knowledge. Every business rule is stated in full with formulas and worked ₱ examples; nothing is left as "see the spreadsheet."

---

## 1. Module overview

M4 is the **receivables ledger**: exactly one receivable per deal, tracking the commission the agent is owed (**Total Collectible**) against the cash actually collected (from M5 payments), the **balance** left, and the receivable's lifecycle (**Open / Closed / Cancelled**). It embodies the product's core philosophy verbatim from the workbook: *"track total commission owed per deal vs cash actually collected = balance left. No forecasting of buyer-to-developer payment cycles."* Reactive payment logging; the receivable is the scoreboard.

**Spreadsheet behavior it replaces.** The *Collectibles* sheet auto-generates one row per Deal Log deal via ARRAYFORMULA (columns B–Y, rows 6–1005): identity columns mirrored from the deal, Booked NET GCI, Total Collectible (with a user-entered **Confirmed Collectible** override that turns the cell blue), a Status input, Collected/Balance/%/Variance computed from the Payments Log, idle-time and payment-date helpers, a Chase Priority sort key, and a Next Action note that surfaces on the Dashboard chase list. Users can edit exactly four things (Status, Confirmed Collectible, Next Action, and nothing else); everything else is locked formula output.

**What improves in SaaS form.** Receivables become real entities with a status lifecycle enforced by explicit friction-gate confirmations and audit (the sheet lets any value be typed into Status); the Confirmed Collectible override **requires** its audit-trail note instead of merely deserving one; deal edits and payment postings restate the receivable transactionally instead of via volatile recalculation; and the ledger exposes clean projections to the Dashboard (M6), Source Performance (M7), Reports (M8), and Search (M9).

**v30.20 structure note (reproduce in the data design):** the receivable holds **expected-vs-collected balances ONLY**. Per-payment tax splits (Gross / Output VAT / EWT / Net Cash / Retained Cash) are attributes of **payments** (M5); reconciliation and period tax views **aggregate payments** (M6/M8). v30.20 deliberately removed the per-deal Collected Gross/VAT/EWT/Net Cash/Retained columns from Collectibles — do **not** add per-deal tax columns to this entity. The one addition v30.20 made is a **Source** helper (the deal's lead source) so M7 can aggregate receivables by lead channel.

**Header doctrine (verbatim from the sheet — the module's most misread rule):**
> "Booked NET GCI = earned after referral-outs; Total Collectible = full cash you expect in (you pay referrers separately — tracked on the Dashboard)."

In other words: NET GCI is an *earnings* figure (net of fees the agent pays out), while Total Collectible is a *cash-in* figure (the payor sends the full commission; the agent pays referrers themselves afterwards). The two differ exactly when a deal has a Referral Out. See §3.2 Rule K.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. They wear every hat the workbook's team divided up.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | See at a glance which payor owes what; work their own chase list — keep Next Action notes current per receivable, verify collected-vs-owed after logging payments (M5), then chase the developer themselves; decide corrections themselves via the Corrections doctrine (§3.3): close receivables when a payor finishes paying (and read the Variance when they finish short), cancel receivables on dead deals, apply Confirmed Collectible when they accept a developer's confirmed figure (case 2). |
| *(v2, out of scope)* | Team roles — Owner/Rainmaker, Admin/ISA, team Agents, Read-only — split these jobs across a brokerage; role-gated transitions and per-agent read scopes arrive with multi-member workspaces. |

## 3. Data model

### 3.1 Receivable entity

Exactly **one receivable per deal**, created by the system on `deal.created` and never user-created or user-deleted (§4 rule 1). Inputs (user-editable) — `(I)`: only **status**, **confirmed_collectible**, **next_action_note**. Everything else is computed `(C)` — either **mirrored** from the deal (restated on every `deal.updated`) or **derived** from payments/dates. Money `decimal(14,2)` display / full-precision decimal internal.

| # | Field | Sheet col | I/C | Type | Req | Validation / Default | Derivation (computed fields) |
|---|---|---|---|---|---|---|---|
| 1 | deal_id | — | C | fk | ✔ | unique (1:1 with deal), immutable | set at auto-creation |
| 2 | deal_code | B | C | string | ✔ | | mirror `deal.deal_code` ("D021") |
| 3 | booked_year | C | I/C | int | ✔ | | mirror `deal.booked_year` (drives M7 Year filter, M8 vintages) |
| 4 | developer | D | C | string | | blank for Resale/Rental/N-A | mirror `deal.developer` (name via FK) |
| 5 | client_name | E | C | string | ✔ | | mirror `deal.client_name` |
| 6 | property_details | F | C | string | ✔ | | mirror `deal.property_details` |
| 7 | deal_type | G | C | enum | ✔ | | mirror `deal.deal_type` (`Developer`/`Resale`/`N/A`) |
| 8 | lead_source | Y | C | fk | ✔ | | mirror `deal.lead_source_id` — v30.20 Source helper; feeds M7 |
| 9 | booking_date | U | C | date | ✔ | | mirror `deal.booked_date` (helper for idle/aging math) |
| 10 | payor | S | C | string | ✔ | | chase-list helper: `developer` when deal_type = Developer, else `client_name` (the party who owes the commission) |
| 11 | booked_net_gci | H | C | money | ✔ | | **Rule K.1**: `= deal.net_gci` — earned, after referral-outs |
| 12 | confirmed_collectible | R | I | money | | null default; if set: > 0; **requires next_action_note** (§4 rule 4); friction-gated (explicit confirm + audit) | |
| 13 | total_collectible | I | C | money | ✔ | | **Rule K.2**: `= confirmed_collectible` if set, else `default_total_collectible` |
| 14 | status | J | I | enum | ✔ | `Open` \| `Closed` \| `Cancelled`; default `Open` at creation; transitions per §4 rule 6 (confirmation-gated) | |
| 15 | collected_net | K | C | money | ✔ | | **Rule L**: `= Σ payment.net_of_vat` over the deal's M5 payments — Commission **and** Incentive types both count |
| 16 | balance | L | C | money | ✔ | | **Rule M**: `= total_collectible − collected_net` (may be negative — §4 rule 9) |
| 17 | pct_collected | M | C | rate | | | **Rule M**: `= collected_net ÷ total_collectible` (null when total_collectible = 0) |
| 18 | variance | N | C | money | | shown only when Closed | **Rule N**: `= collected_net − total_collectible` (negative = collected short; positive = over-collected) |
| 19 | written_off | — | C | money | | shown only when Cancelled | **Rule O**: `= total_collectible − collected_net` at cancellation (cash already collected is kept) |
| 20 | last_payment_date | O | C | date | | null if no payments | `= MAX(payment.date)` over the deal's payments |
| 21 | first_payment_date | W | C | date | | null if no payments | `= MIN(payment.date)` |
| 22 | months_idle | P | C | int | | **null when Closed/Cancelled or no payments yet** | **Rule P**: whole calendar months from `last_payment_date` to today (DATEDIF-style: complete months elapsed) |
| 23 | age_months | V | C | int | | **null when Closed/Cancelled** | **Rule P**: whole months since `last_payment_date` if any payment exists, else since `booking_date` — this variant feeds M6's aging buckets |
| 24 | days_to_first_release | X | C | int | | null if no payments | `= first_payment_date − booking_date` in days (negative possible — §4 rule 12); feeds M6 per-developer "Avg Days → 1st Release" |
| 25 | chase_priority | Q | C | sort key | | | **Rule Q**: `ORDER BY balance DESC, months_idle DESC NULLS LAST, deal_code` (see §4 rule 13 and Open Question 1) |
| 26 | next_action_note | T | I | string(500) | required when confirmed_collectible set | free text; surfaces verbatim on M6's chase list | |
| 27 | archived_at / audit fields | — | C | | | archive follows the deal's archive (§4 rule 1); full audit trail on status/override/note changes | |

### 3.2 Derivation rules (server-side, same pure-library discipline as M1)

All arithmetic in exact decimals; round only at display/storage boundaries (2 dp, half-up); ₱0.50 tolerance comparisons belong to M6 Data Health, never to this module's stored values.

**Rule K — Booked vs Collectible (the two money anchors):**

```
K.1  booked_net_gci          = deal.net_gci
                             = gci_net_of_vat + incentive_net − referral_out          (M1 Rule H)

K.2  default_total_collectible = gci_net_of_vat + incentive_net
                               (equivalently: = net_gci + referral_out)
     total_collectible         = confirmed_collectible  if entered (override)
                               = default_total_collectible  otherwise
```

Why the default is **not** simply `net_gci`: the payor (developer or client) pays the **full** commission + incentive into the agent's account; referral-outs are fees the agent then disburses themselves (M1 What-to-Book doctrine). So the cash expected **in** excludes nothing for referral-outs — those are tracked as payables on the Dashboard (M6 "Referral fees owed out", read from M1's `referral_out`/`referral_paid`, **not** from this entity).

*Worked ₱ (D004 — referral out, no override):* gci_net_of_vat ₱875,000 + incentive_net ₱0 = **Total Collectible ₱875,000**, while booked_net_gci = 875,000 − 75,000 referral out = **₱800,000**. The receivable expects ₱875,000 in; the ₱75,000 owed to the referrer is a separate outflow.
*Worked ₱ (D021 — no referral out):* gci_net_of_vat ₱318,877.55 + incentive_net ₱35,714.29 = **Total Collectible ₱354,591.84** = net_gci exactly (referral_out = 0 makes the two figures coincide).
*Precision note (D013):* compute the default from **full-precision** components, not 2-dp displays: 777,287.946428… + 129,464.285714… = 906,752.232142… → **₱906,752.23** (adding the rounded displays 777,287.95 + 129,464.29 would give 906,752.24 — a centavo off; forbidden per M1 §8 rounding policy).

**Rule L — Collected (Net of VAT):** `collected_net = Σ payment.net_of_vat` across every M5 payment referencing the deal, **regardless of payment Type** — a standalone Incentive release counts toward the receivable exactly like a Commission release.
*Worked ₱ (D021):* one payment exists — the incentive release, Gross ₱50,000 → net_of_vat ₱44,642.86 (M5 split). collected_net = **₱44,642.86**.

**Rule M — Balance and % Collected:** `balance = total_collectible − collected_net`; `pct_collected = collected_net ÷ total_collectible`. Balance lives on the **Net-of-VAT basis** — the same basis as booked GCI — so owed and collected are always compared like-for-like. **Net Cash** (what actually lands in the bank after EWT withholding) is a *payments-side* concept (M5/M6/M8); it never appears on the receivable.
*Worked ₱ (D021):* 354,591.84 − 44,642.86 = **₱309,948.98** balance; 44,642.86 ÷ 354,591.84 = **12.59%** collected.

**Rule N — Variance (Closed):** when the payor has finished paying, the agent closes the receivable; the balance stops being "owed" and the residual becomes `variance = collected_net − total_collectible` — negative = paid short, positive = over-collected. Variance is the deliberate home of accepted shortfalls (Corrections doctrine case 3, §3.3): it keeps short-paying developers visible in %-collected stats instead of hiding the gap.
*Worked ₱ (D004, Closed):* collected 875,000 − collectible 875,000 = **₱0** variance. *Synthetic short-close:* collectible ₱354,591.84, collected ₱350,000, Closed → variance **−₱4,591.84**.

**Rule O — Write-off (Cancelled):** the deal died (buyer backed out, developer cancelled the sale). `written_off = total_collectible − collected_net` at the moment of cancellation. Cash already collected is **kept** (not reversed); the uncollected remainder is written off; the receivable leaves every open-balance view and aging bucket (edge case 9).
*Worked ₱ (synthetic):* collectible ₱675,000, collected ₱200,000, Cancelled → written_off **₱475,000**; the ₱200,000 stays in all collected/cash totals.

**Rule P — Idle and age (whole calendar months, DATEDIF-style):**

```
months_idle = whole months from last_payment_date to today        (null: Closed/Cancelled, or no payments)
age_months  = whole months from (last_payment_date if any, else booking_date) to today
              (null: Closed/Cancelled)
```

"Whole months" = complete calendar months elapsed: last payment 2026-07-09 → 0 months on 2026-08-08, 1 month on 2026-08-09. `months_idle` is the chase-list figure ("how long since this payor last sent money"); the sheet's chase list shows **"no payment yet"** for open receivables where it is null. `age_months` is the aging-bucket helper — it falls back to booking date so a never-paid receivable still ages (an Open developer deal booked 2026-04-07 with no payments has age_months = 3 on 2026-07-17). The chase flag itself (`⚠ chase` when months_idle ≥ chase_idle_months) is M6's rule; M4 only supplies the numbers.

**Rule Q — Chase Priority (ordering key for M6's chase list):** largest balance first. Specified ordering:

```
ORDER BY balance DESC, months_idle DESC NULLS LAST, deal_code ASC
```

⚠ **Discrepancy (workbook register item 2):** the task prompt describes the tiebreaker as *idle time*, but the sheet's cached Chase Priority values are `balance + row_index × 10⁻⁶` — i.e., balance with a **row-index epsilon** (row order ≈ booking order), not idle time. The spec above adopts balance DESC then idle DESC as the recommended SaaS behavior; **listed as Open Question 1 — do not treat the tiebreaker as settled.**

### 3.3 Collectible Corrections doctrine (reproduced in full — business policy encoded in UX; identical text lives in M1 §3.3)

**Which tool to use when a deal's number changes:**

1. **Economics truly changed** (price amended, rate renegotiated before release, wrong base and the contract backs the developer) → **edit the deal itself** (M1). Earned GCI, yield, and planning all reflect the new reality. The receivable restates automatically (§4 rule 7).
2. **Earnings stand, expected cash differs and you accept it** (recomputed base you'll tolerate, part collected elsewhere, netting arrangement) → **use Confirmed Collectible**, ALWAYS with a Next Action note (e.g., "CLI advice 7/20: base excl. promo disc — confirmed 303,806"). The override is one opaque number; the note is its audit trail — in the SaaS the note is **required** when a Confirmed Collectible is entered (§4 rule 4; prompt edge case 17).
3. **Eating a shortfall you do NOT agree is correct** → touch nothing. Close the deal short and let **Variance** tell the story — this keeps short-paying developers visible in the %-collected stats instead of hiding the gap.

The three cases are the module's editing philosophy: case 1 changes *booked truth* (M1), case 2 changes *expected cash* (this module, with an audit note), case 3 changes *nothing* and records the outcome (Variance). The UI must present these as the three options whenever a user tries to "fix" a receivable's number (§6).

## 4. Business rules & edge cases (numbered)

1. **System-managed lifecycle.** One receivable is auto-created per deal on `deal.created`; users can never create a receivable directly, never delete one, and never detach it from its deal. Archiving a deal archives its receivable (and removes it from all open-balance views); restoring the deal restores it. Because creation is automatic and `status` defaults to `Open`, the sheet's Data Health check (a) "deals with no Status set" becomes structurally unrepresentable — M6 keeps the check only for imported legacy data.
2. **Identity mirrors are always current.** Fields 2–10 restate on every `deal.updated` event (rename the client on the deal → the receivable shows the new name). They are projections, not copies that drift.
3. **Default collectible per Rule K.2** — `gci_net_of_vat + incentive_net` (= `net_gci + referral_out`), NOT `net_gci`. Fixtures D004 (875,000 vs booked 800,000) and D021 (354,591.84, identical to booked) in §3.2 are the canonical tests.
4. **Confirmed Collectible requires its note (edge case 17 — resolved as: block).** Saving a `confirmed_collectible` without a non-empty `next_action_note` is **rejected** ("The note is the override's audit trail — say why: e.g., 'CLI advice 7/20: base excl. promo disc — confirmed 303,806'"). The required note + explicit confirmation **is** the safeguard in v1 — a friction gate, not a role check. Every set/change/clear of the override writes an audit entry (old→new, actor, note snapshot).
5. **Override is visibly overridden (edge case 11).** When `confirmed_collectible` is set, Total Collectible renders in the product's "overridden input" style — the SaaS equivalent of the sheet turning the cell **blue** — with a tooltip showing the default it replaced (`Default ₱875,000.00 → confirmed ₱850,000.00`) and the note. Every consumer of total_collectible (M6 chase list, M9 search results) carries an "overridden" marker.
6. **Status transitions.** Allowed: `Open → Closed`, `Open → Cancelled`, and reopening `Closed → Open` / `Cancelled → Open` (reopening is **allowed** — e.g., a "dead" deal revives, or a close was premature — but is audit-logged with actor + timestamp and restores balance/aging math). `Closed ↔ Cancelled` direct transitions are not offered (go through Open). All transitions are **friction-gated** per M0 §3.2: closing or cancelling restates money, so each goes through an explicit confirmation dialog (previewing variance/write-off) and always writes an audit entry — in v1 the confirmation is the safeguard where the team workbook relied on an Owner/Admin restriction; role-gating returns with v2 teams.
7. **Deal edits restate the receivable (edge case 13).** When M1 confirms an edit on a deal with payments, the receivable recomputes booked_net_gci, default/total collectible, balance, %, and variance in the same transaction; **payment history is untouched**; if a `confirmed_collectible` is set, it survives the restatement (it is the user's number) but the UI flags "deal restated since override — review" until the agent re-confirms or clears it.
8. **Overpayment on a Closed receivable (edge case 8).** Collected > collectible → `variance` positive ("over"). M6 Data Health flags Closed receivables with `|variance| > ₱0.50`. M4 stores the true signed value; no clamping.
9. **Negative balance on an OPEN receivable.** If payments exceed total_collectible while still Open, `balance` goes **negative and is displayed as negative** (sheet behavior — no clamp to 0), styled distinctly (§6) since it usually means a missing Confirmed Collectible, an unbooked incentive, or a mispost. M6 Data Health check (b) "fully paid but not marked Closed" (edge case 12) fires on `balance ≤ 0` for Open receivables. Whether to clamp instead is Open Question 5 — implement negative-allowed (sheet-faithful) unless the owner overrules.
10. **Cancelled with partial collections (edge case 9).** Per Rule O: written_off = uncollected remainder; collected cash is kept and continues to count in every payments-side total (M6 §1 position "Written-off (Cancelled)", M8 cash reports); the receivable is **excluded from open-balance aging** and the chase list. pct_collected remains meaningful and is still reported (e.g., M7's per-source % collected — see workbook register item 10, owned by M7).
11. **Incentive payments count as collected.** Rule L includes Incentive-type payments. Fixture: D021's only payment is the ₱50,000 gross incentive release → collected ₱44,642.86 against a collectible that *includes* the booked net incentive (₱35,714.29 of the 354,591.84).
12. **Booked incentive ≠ released incentive (workbook register item 11 — document, don't "fix").** The collectible carries the incentive at its *booked* amount (billed ÷ 1.12 when taxable); the actual release can differ. D021: booked incentive ₱40,000 → ₱35,714.29 net inside the collectible, but the developer released ₱50,000 gross → ₱44,642.86 net collected. **The receivable never adjusts booked figures to match cash** — if the deal ultimately collects more/less than booked, the gap lands in **Variance at close** (or the user applies the Corrections doctrine: case 1 if the incentive was misbooked, case 2 if the expected cash is simply confirmed different). Related quirk, same fixture: D021's release (2026-07-09) predates its booking date (2026-07-10), so `days_to_first_release = −1` — **negative values are allowed** and displayed as-is (payments may be dated before the deal's booked date; M5 does not forbid it); comparison fixtures: D001 = 12 days (Jan 1 → Jan 13), D004 = 115 days (Mar 10 → Jul 3).
13. **Chase ordering is deterministic.** Rule Q's three-key sort guarantees a stable order even for equal balances; the M6 chase list consumes the ordered projection as-is. Tiebreaker choice is Open Question 1.
14. **No per-deal tax columns — ever.** Per the v30.20 structure note (§1): requests to show "VAT collected on this deal" are answered by the deal's payment list (M5 drill-down), not by receivable columns. Keeps the entity stable and the reconciliation single-sourced.
15. **Zero-collectible guard.** `pct_collected` is null (displayed "—") when total_collectible = 0 (theoretically possible via a ₱0-commission deal); balance math is unaffected.
16. **Receivables for archived deals** are archived with their deal (rule 1), excluded from all M6/M7/M8 aggregates and the chase list, but remain reachable via M9 search (with an "archived" badge) and the audit trail. Payments referencing the deal keep their referential integrity (M1 blocks hard-delete of deals with payments).
17. **Currency/precision:** all money decimal-exact; the ₱0.50 tolerance appears only in M6 Data Health comparisons (edge case 15), never in stored balances.

## 5. Functional requirements

- **FR-M4-01** On `deal.created`: auto-create the receivable (status Open, mirrors populated, booked/default collectible computed per Rule K) in the same transaction as the deal. One per deal, enforced by a unique constraint.
- **FR-M4-02** On `deal.updated`: restate mirrors and all Rule K–N derived fields per §4 rules 2 and 7; emit `receivable.restated` (consumed by M6/M7 caches); flag surviving overrides for review.
- **FR-M4-03** On `deal.archived`/`deal.restored`: archive/restore the receivable (§4 rules 1, 16).
- **FR-M4-04** On M5 payment events (`payment.created/updated/deleted`): recompute collected_net, balance, pct_collected, variance (if Closed), last/first payment dates, months_idle, age_months, days_to_first_release for the affected deal, transactionally with the payment write.
- **FR-M4-05** Status transitions per §4 rule 6: each behind an explicit friction-gate confirmation; Open→Closed computes and freezes-for-display the variance; Open→Cancelled computes written_off; reopening restores Open math; every transition audit-logged (old→new, actor, timestamp).
- **FR-M4-06** Confirmed Collectible: the user can set, change, or clear the override; **save is blocked** without a non-empty Next Action note (§4 rule 4); clearing reverts total_collectible to the Rule K.2 default (clear-behavior pending Open Question 3 — implement clearable-with-audit as the default); all changes audit-logged with the note captured.
- **FR-M4-07** Next Action note: editable on any receivable (a plain edit — not money-restating, so no friction gate; still audit-logged); shown verbatim on the M6 chase list; kept on Closed/Cancelled rows for history.
- **FR-M4-08** Ledger list view: all §3.1 columns, default sort = chase priority (Rule Q); filters: status, developer, deal_type, booked_year, lead_source, has-balance, overridden-only; text search on client/property; sticky totals row (Σ collectible, Σ collected, Σ balance for the filtered set).
- **FR-M4-09** Receivable detail: booked-vs-collectible explainer (shows Rule K.2 arithmetic: "GCI 318,877.55 + incentive 35,714.29 = 354,591.84"), payment history (from M5, read-only, with per-payment tax splits shown *there*), status timeline from audit, override panel, note editor, cross-links to the deal (M1) and "Log a payment" (M5).
- **FR-M4-10** Chase projection for M6: ordered open-balance rows (Rule Q) exposing deal_code, client, payor, balance, last_payment_date, months_idle, developer, booked_net_gci, next_action_note, override marker.
- **FR-M4-11** Aggregate projections: (a) position totals — Σ total_collectible, Σ collected_net, Σ balance, Σ written_off over Cancelled, Σ variance over Closed (M6 §1); (b) aging rows — open receivables with balance > 0 bucketed by age_months (M6 §4); (c) per-developer rollups incl. AVG(days_to_first_release) (M6 §5); (d) per-lead-source rollups of booked_net_gci / balance / deal counts by booked_year (M7); (e) booking-year summary — deals, booked, collected, outstanding (M8 Report 5).
- **FR-M4-12** CSV/XLSX export of the ledger (filtered set, all columns, override marker included).
- **FR-M4-13** Search hooks for M9: receivables queryable by year, deal code, status, has-balance, client/property text; M9's collectibles result columns (ID, client, property, deal type, Total Collectible, Collected, Balance, Status) sorted balance high→low.
- **FR-M4-14** Importer leg (invoked by M1's FR-M1-10): for each imported deal, populate the receivable's status, confirmed_collectible (+ its note), and next_action_note from the workbook's Collectibles columns J/R/T; recompute everything else and reconcile K/L/I against the sheet's cached values within ₱0.01, reporting mismatches instead of importing them silently. **Legacy exception:** the sheet allows an override without a note — import it, but flag it "note missing (legacy)" for follow-up rather than blocking the import.

## 6. UI/UX requirements

- **Ledger screen** (the module's home): table per FR-M4-08 with status chips (Open = neutral, Closed = green, Cancelled = grey), ₱-formatted money, % collected as a compact progress bar, months-idle column showing "no payment yet" when null-with-Open, and the totals row pinned. Computed cells use the product-wide locked style with formula tooltips ("Balance = Total Collectible − Collected (Net of VAT)").
- **Override affordance:** total_collectible on an overridden row renders in the **blue "input" style** (the sheet's convention — blue = user-entered) with a corner badge; hover/tap reveals default → confirmed values and the note. Non-overridden rows render it as a locked computed value. This is the literal translation of "the sheet turns the cell blue."
- **"Fix a number" flow:** an *Adjust…* action on the detail view presents the three Corrections-doctrine cases (§3.3) as explicit choices — "Edit the deal (economics changed)" → deep-link to M1 edit; "Confirm a different collectible (you accept a different cash figure)" → override form with the required-note field inline; "Close short and record the variance" → close dialog previewing the variance. Doctrine text appears as helper copy.
- **Close dialog:** shows collected vs collectible and the resulting variance before confirming ("Closing with variance −₱4,591.84 — the shortfall stays visible in your stats"). **Cancel dialog:** shows the write-off amount and "cash already collected (₱200,000) is kept" copy; both dialogs are the v1 friction gate — explicit confirm + audit entry.
- **Negative balance / over-collection:** negative balances render in a warning color with an "over-collected — close it or confirm the collectible" hint (ties to M6 Data Health (b)).
- **Restated-override flag** (§4 rule 7): banner on the receivable ("The deal was edited on {date}; your confirmed ₱850,000 predates it — review").
- **Status timeline** on detail: creation → transitions → reopenings, from audit entries.
- **Empty state:** "Receivables appear here automatically — one per deal. Log your first deal to start." (No create button exists, by design.)
- **Mobile:** ledger collapses to cards (code, client, balance, status chip, months idle); detail stacks; chase-first ordering preserved at 360 px.

## 7. Interactions with other modules

| Direction | Module | Field-level mapping |
|---|---|---|
| reads ← | M1 | `deal.created/updated/archived` events → upsert/restate/archive; mirrors (deal_code, booked_year, developer, client_name, property_details, deal_type, lead_source_id, booked_date); money inputs to Rule K (net_gci, gci_net_of_vat, incentive_net, referral_out) |
| reads ← | M5 | `payment.created/updated/deleted` events → Rule L/M/N/P recompute; per-payment fields consumed: deal_id, date, net_of_vat, type |
| reads ← | M0 | friction-gate confirmation pattern + audit infrastructure (transition/override safeguards, §3.2); Developer list (grouping); chase_idle_months is **M6's** input, not M4's |
| provides → | M6 | position totals (Σ collectible/collected/balance, written-off, closed variance); aging rows (age_months, balance, status); per-developer rollups (+ AVG days_to_first_release); chase projection (Rule Q order + next_action_note + override marker); data-health inputs (open balance ≤ 0; Closed \|variance\| > ₱0.50) |
| provides → | M7 | per-receivable booked_net_gci, balance, deal_type, lead_source, booked_year (Source Performance aggregates COLLECTIBLES rows, per the sheet) |
| provides → | M8 | booking-year summary (Report 5): deals, booked_net_gci Σ, collected Σ, outstanding Σ by booked_year |
| provides → | M9 | searchable receivable projection (year, code, status, has-balance, client/property text; balance-desc sort) |
| explicitly NOT | M6 | referral payables ("Referral fees owed out") come from M1's referral_out/referral_paid — the receivable carries no referral data beyond its effect on booked_net_gci |
| imports ← | M1 importer | status / confirmed_collectible / next_action_note per FR-M4-14 |

## 8. Non-functional requirements

- Recompute path (payment posted → receivable updated) is transactional and synchronous — a user logging a payment in M5 sees the receivable's new balance immediately (< 200 ms server time added to the payment write).
- Ledger with ≥1,000 receivables: list/filter/sort < 500 ms P95; aggregate projections for M6/M7 served < 300 ms (cache + event invalidation acceptable; correctness over staleness — invalidate on every M1/M5 event).
- Access control: auth + absolute tenant isolation enforced server-side on every mutation (status, override, note); money-restating mutations (status transitions, override set/change/clear) additionally require the explicit friction-gate confirmation and always write audit entries; schema stays v2-role-ready (M0 §3.2).
- Full audit trail: every status transition, override set/change/clear, and note edit stores old→new + actor; restatements triggered by deal edits reference the originating M1 audit entry.
- Decimal-exact money end-to-end; date math in the workspace's timezone (months_idle "today" boundary must not wobble across UTC).

## 9. Acceptance criteria (Given/When/Then — workbook state as of 2026-07-17 is the fixture)

1. **Given** deal D021 exists (NET GCI ₱354,591.84; GCI ₱318,877.55; incentive net ₱35,714.29; no referral out) **When** its receivable is auto-created **Then** booked_net_gci = ₱354,591.84 and total_collectible = ₱354,591.84 (Rule K.2, no override), status Open.
2. **Given** deal D004 (GCI ₱875,000; referral out ₱75,000; NET GCI ₱800,000; no confirmed collectible) **Then** its receivable shows booked_net_gci = **₱800,000** and total_collectible = **₱875,000** — proving the default is `gci + incentive_net`, not `net_gci`.
3. **Given** D021's receivable and its single M5 payment (Incentive type, net_of_vat ₱44,642.86) **Then** collected_net = ₱44,642.86, balance = **₱309,948.98**, pct_collected = **12.59%** — proving Incentive-type payments count (Rule L).
4. **Given** D004's receivable with collected ₱875,000 **When** the user sets status Closed (through the confirmation dialog) **Then** variance = ₱0.00, months_idle/age_months = null, and the row leaves the chase and aging projections. Same expectation for D001 (collected ₱436,050), D017, D018, D019, D020, D006 — the workbook's seven Closed fixtures all close with variance 0.
5. **Given** a Closed receivable (collectible ₱875,000) **When** an extra ₱5,000-net payment is posted to the deal **Then** variance = +₱5,000.00 and M4's data-health projection surfaces it to M6 (|variance| > ₱0.50) (edge case 8).
6. **Given** an Open receivable, collectible ₱675,000, collected ₱200,000 **When** Cancelled **Then** written_off = ₱475,000, the ₱200,000 remains in collected/position totals, and the row is excluded from aging and chase (edge case 9).
7. **Given** a status-transition or override request submitted without the explicit confirmation acknowledgment — or any request from another workspace's account — **When** it hits the API **Then** it is rejected (400/403), no change occurs, and no audit entry is written (the friction gate + tenant isolation are the v1 safeguards; no role checks).
8. **Given** the user enters confirmed_collectible ₱850,000 with an empty note **Then** save is **blocked** with the note-required message; **When** a note is supplied **Then** total_collectible = ₱850,000, the ledger and M6 chase list render it in the overridden (blue) style with the default (₱875,000) in the tooltip, and an audit entry captures old→new + note (edge cases 17, 11).
9. **Given** an overridden receivable **When** the underlying deal's list price is edited in M1 (with confirmation) **Then** booked_net_gci and the *default* collectible restate, the override value persists, the "deal restated since override" flag appears, and payments are untouched (edge case 13).
10. **Given** an Open receivable fully paid (balance = ₱0.00 or negative) **Then** it appears in the "fully paid but not Closed" projection consumed by M6 Data Health; balance −₱1,000 displays as **−₱1,000.00** (negative, no clamp) with the over-collected hint (edge case 12; §4 rule 9).
11. **Given** the 14 Open workbook receivables **When** the chase projection is requested **Then** ordering per Rule Q starts D013 (₱906,752.23) → D005 (₱675,000) → D016 (₱630,813.93) → D010 (₱426,953.13) → … and D021 shows months_idle = 0 (last payment 2026-07-09) while D008 (no payments, booked 2026-04-07) shows "no payment yet" with age_months = 3.
12. **Given** D021's dates (booked 2026-07-10, first payment 2026-07-09) **Then** days_to_first_release = **−1** (allowed, displayed as-is); D001 = 12; D004 = 115 (§4 rule 12).
13. **Given** deal D013's components at full precision **When** the default collectible is computed **Then** it equals **₱906,752.23** (not 906,752.24 from summed 2-dp displays) — rounding-policy regression.
14. **Given** the v30.20 workbook imported (M1 FR-M1-10 + FR-M4-14) **Then** 21 receivables exist with statuses Open×14 / Closed×7 / Cancelled×0, zero confirmed collectibles, collected/balance figures reconciling to the sheet within ₱0.01 per row (D021: 44,642.86 / 309,948.98), and Σ balance over open rows ties to the sheet's Balance Outstanding within ₱0.50.
15. **Given** a Closed receivable **When** the user reopens it (through the confirmation dialog) **Then** status = Open, variance clears, balance/aging math resumes, and the audit timeline shows close + reopen entries with actors.

## 10. Out of scope / future

- **No forecasting** of buyer-to-developer payment cycles, expected payment dates, or installment schedules (core philosophy — reactive logging only). Mode of Payment (M1) remains a coarse timing hint for humans, not a model input.
- **No dunning automation** (reminder emails/SMS to developers) — the chase list (M6) is a human worklist.
- **No partial write-offs** or write-off reversals short of reopening; no reason-code taxonomy on cancellation (Open Question 2).
- **No per-deal tax reconciliation columns** on the receivable (v30.20 structure note — permanently out, not deferred).
- **No referral-payables ledger** here (M1 fields + M6 rollup cover it); no interest/penalty computation on aged balances; no multi-currency.

## 11. Open questions

1. **Chase Priority tiebreaker (workbook register item 2).** Prompt says balance then *idle time*; the sheet's cached key is `balance + row_index × 10⁻⁶` (row order ≈ booking order). Spec implements `balance DESC, months_idle DESC NULLS LAST, deal_code` — confirm with the product owner, since the sheet's own behavior differs from the prompt's description.
2. **Should Cancelled require a reason code?** The sheet has none (free-text Next Action only). Recommendation: keep free-text note (optional on cancel), no taxonomy in v1 — confirm.
3. **Can Confirmed Collectible be cleared once set?** The sheet allows deleting the cell. Recommendation: **yes**, clearable behind the friction-gate confirmation, with an audit entry and a note explaining the reversion — confirm the note should be required on clear as it is on set.
4. **Should reopening a Closed receivable be time-limited** (e.g., locked after N days / after a reporting period closes)? Sheet: freely editable forever. Recommendation: unlimited but audit-logged in v1; revisit when accounting-period features exist.
5. **Negative balance on Open receivables: display negative or clamp at 0?** Sheet: negative allowed and shown. Spec follows the sheet (§4 rule 9) with warning styling; confirm the owner doesn't prefer clamping plus a data-health-only signal.
