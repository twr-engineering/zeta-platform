# M1 — Deal Log & Commission Engine — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M1 is the schedule-critical module — everything downstream consumes its engine and events.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 parallel to M6; M7 after M1+M4+M5). Within M1: the engine (M1.1) unblocks *all* downstream math and should be built first, before any UI. The importer (M1.4) needs M4/M5 schemas to exist for a full-fidelity run, but its deal-only pass can ship earlier; plan it late in M1 and finish the payments/collectibles legs alongside M4/M5.

---

## Milestone M1.1 — Calculation engine library (3–4 days)

**Objective:** the complete pure-function engine (Rules A–J) with exhaustive fixture tests — no UI.

**Deliverables checklist**
- [ ] `computeDeal(inputs, settings, developer, propertyType) → derived` pure library, decimal arithmetic
- [ ] `computePaymentSplit(...)` co-located for M5 reuse (same library, one source of money truth)
- [ ] Fixture test suite: D001–D021 full table + §9.1 derivations + edge cases 1–7, 14–17
- [ ] Rounding-policy doc & tests (full precision internally; 2-dp half-up at boundaries; ₱0.50 tolerance helper)
- [ ] Property-based tests (e.g., Inclusive: billed = GCI × 1.12 ± centavo; NET GCI ≤ GCI + incentive_net)

**Tasks:** decimal utilities + rounding policy · Rules A–D · Rules E–J · fixture suite from WORKBOOK_REFERENCE table (21 deals) · payment-split function + D021-incentive fixture · property-based tests.

**Definition of done:** D021 → NET GCI 354,591.84 / VAT 42,551.02 / EWT 35,459.18; D004 → 875,000 / 800,000 / 4.5714%; D011 → 155,803.57; D021 incentive split → 44,642.86 / 5,357.14 / 4,464.29 / 45,535.71; non-VAT fixture N1 (D021 inputs, vat_registered = false, EWT 5%) → GCI 357,142.86 / NET GCI 397,142.86 / VAT 0 / EWT memo 19,857.14 — all centavo-exact in CI; 100% branch coverage on the engine.

**Demo script:** run the test suite; feed D021's inputs to a REPL/endpoint and read back ₱354,591.84.

**Dependencies:** M0.2 (settings shape). Blocks everything downstream.

## Milestone M1.2 — Deal CRUD with permanent IDs (3–5 days)

**Objective:** deals persist with immutable codes; engine wired server-side; events emitted.

**Deliverables checklist**
- [ ] Deal schema + atomic deal_code sequence (concurrency-safe)
- [ ] CRUD APIs with auth + friction-gate confirmations; conditional validation (§4 rule 12)
- [ ] Engine invoked in-transaction on create/update; derived fields persisted
- [ ] `deal.created/updated/archived` events with old/new payloads
- [ ] Delete protection & archive cascade confirmation contract
- [ ] Audit trail on every financial edit (field-level old→new)

**Tasks:** schema + sequence + concurrency test · create/read APIs · update flow + recompute + optimistic locking · delete/archive rules · events · audit writes.

**Definition of done:** parallel create requests never duplicate codes; API-level test replays acceptance criteria 1–4, 8–9.

**Demo script:** create D021 via API → response carries computed ₱354,591.84 and code "D001" (fresh workspace); create again → "D002"; attempt delete with a stub payment → blocked.

**Dependencies:** M0.1–M0.3, M1.1.

## Milestone M1.3 — Deal entry UI & list (4–6 days)

**Objective:** the daily-use deal form with live computed panel, warnings, and the deal list/detail.

**Deliverables checklist**
- [ ] Three-group form, conditional fields, blue-input/locked-computed affordances
- [ ] Live computed panel (same engine — shared lib or preview endpoint)
- [ ] Warning banners (duplicate, split-at-source, representation mismatch) with audit-logged overrides
- [ ] Deal list: sort/filter/search/year, ₱ formats, column chooser, export CSV/XLSX
- [ ] Deal detail with formula tooltips + cross-links (receivable, payments)
- [ ] Mobile layouts; empty state with importer entry

**Tasks:** form skeleton + conditional logic · computed panel wiring · warnings · list + filters + export · detail view · mobile pass.

**Definition of done:** acceptance criteria 1–7, 10–11 pass as UI tests; a non-technical user can enter D021 from a developer computation sheet in < 2 min (usability check with the product owner).

**Demo script:** "Log deal D021's inputs, watch the panel show **₱354,591.84**; flip Receipt Issued on a resale and watch GCI change by ÷1.12 with preview."

**Dependencies:** M1.2.

## Milestone M1.4 — v30.x workbook importer (4–6 days)

**Objective:** one-time migration of an existing workbook: settings, lists, deals (this milestone), wired to extend to payments (M5) and collectible states (M4) when those schemas land.

**Deliverables checklist**
- [ ] Upload + parse (xlsx) with sheet/column mapping per WORKBOOK_REFERENCE layout
- [ ] Settings & lists import via M0 APIs (tax settings, property types + rules, developers + comm base, lead sources)
- [ ] Deal import preserving codes; sequence continues after max imported code
- [ ] Reconciliation: recompute vs cached values, ₱0.01 tolerance, per-row mismatch report; dry-run mode; idempotency by file hash
- [ ] Payments + collectibles legs (status, Confirmed Collectible, Next Action) — implemented once M4/M5 schemas exist; importer runs all legs in one transaction
- [ ] Import summary screen (counts, warnings, mismatches)

**Tasks:** parser + mapping · settings/lists leg · deals leg + code preservation · reconciliation + dry-run · payments/collectibles legs (scheduled with M4/M5) · summary UI.

**Definition of done:** the real v30.20 file imports 21 deals, 8 payments, statuses/overrides intact; every recomputed figure ties to cache within ₱0.01 (D001 included); re-running is a no-op.

**Demo script:** upload the v30.20 workbook → dry-run shows 21 deals/8 payments/0 mismatches → import → open D021 and see ₱354,591.84; Dashboard position matches the sheet.

**Dependencies:** M1.2 (+ M4.1, M5.1 for the full run).

## Milestone M1.5 — Recompute service & hardening (2–3 days)

**Objective:** bulk recompute on settings/developer changes; performance and audit polish.

**Deliverables checklist**
- [ ] Bulk recompute job (progress, resumable) consuming M0's confirmation events
- [ ] Per-deal audit entries on bulk changes
- [ ] Perf: 1,000-deal list < 500 ms P95; bulk recompute 1,000 deals < 30 s
- [ ] Load-test fixtures (1,000 synthetic deals) in CI

**Definition of done:** changing Abrown's comm_base Net→Gross restates its deals with audit entries; perf targets met on the 1,000-deal fixture.

**Demo script:** flip a developer's comm base → confirmation lists 3 affected deals → progress → restated figures + audit log.

**Dependencies:** M1.2; M0.2 events.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M1.1 Engine library | 3–4 |
| M1.2 Deal CRUD + IDs | 3–5 |
| M1.3 Entry UI & list | 4–6 |
| M1.4 Importer | 4–6 |
| M1.5 Recompute & hardening | 2–3 |
| **Total** | **16–24** |

Assumptions: decimal library available in the chosen stack; xlsx parsing via a mature library; no OCR; importer handles v30.13+ layouts only (older versions manual).

## Test plan

Every formula unit-tested with the workbook's verified numbers as fixtures:
1. **Rule A/B:** threshold boundary (3,600,000.00 exempt / .01 vat_able); always_vat (D011 lot); always_exempt; force_vat override; resale/rental → n/a; net list 8,000,000 → 7,142,857.142857….
2. **Rule C:** gross base (D009: base 12,048,370) vs net base (D021: base 7,142,857.14); non-developer base = list.
3. **Rule E:** % + Inclusive (D021 → 318,877.55; D009 → 322,724.20; D008 → 277,236.13; D010 → 391,238.84; D013 → 777,287.95; D016 → 612,956.79); Fixed + Inclusive (D011 → 155,803.57; D012 → 206,696.43); untaxed (D001 → 436,050; D004 → 875,000; D007 → 180,000); VAT-basis invariant: taxable ⇒ ÷1.12 always (the removed Exclusive option has NO code path — assert the enum never leaves {inclusive, n/a}); escape-hatch fixture: Fixed 112,000 on a taxable deal → GCI 100,000.00; **non-VAT registration gate (fixture N1):** D021 inputs with `vat_registered = false`, EWT 5% → GCI 357,142.86 / incentive 40,000.00 as-is / NET GCI 397,142.86 / VAT memo 0 / EWT memo 19,857.14 / yield 4.9643%; same workspace, D004 inputs → unchanged (untaxed stays untaxed, no EWT).
4. **Rule F:** taxable incentive (40,000 → 35,714.29; 145,000 → 129,464.29); non-taxable passes through; incentive on untaxed deal passes through.
5. **Rule G/H:** D004 referral fixed (875,000 − 75,000 = 800,000); % + fixed combined (synthetic: 2% × 875,000 + 10,000 = 27,500).
6. **Rule I:** D021 memos 42,551.02 / 35,459.18; D008 38,089.76 / 31,741.47; non-taxable incentive excluded; untaxed → 0; EWT-at-5% variant (D021 base → EWT 17,729.59).
7. **Rule J:** D004 4.5714%; rentals 8.3333% exact via 1/12 (D017 22,500/270,000).
8. **Payment split (shared fn):** D021 incentive fixture (44,642.86 / 5,357.14 / 4,464.29 / 45,535.71 / 40,178.57); untaxed pass-through (D004: 875,000 → all-net); incentive-taxable-No → zero VAT/EWT.
9. **Full-table regression:** all 21 workbook deals recomputed to cache within ₱0.01.
10. **Integrity:** code permanence under insert/sort/delete; delete-with-payments blocked; edit-after-payments restates M4 balance without touching payments (integration).
11. **Precision:** property test that no code path uses binary floats; centavo-drift test on ÷1.12 chains (intermediate rounding forbidden).
