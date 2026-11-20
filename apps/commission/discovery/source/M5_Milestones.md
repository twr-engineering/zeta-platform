# M5 — Payments Log — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M5 is the daily-use surface — the module the agent touches every day, usually on a phone. Its money math is NOT built here: the split function (`computePaymentSplit`) lives in M1's engine library (milestone M1.1) as the single source of money truth; M5 wires schema, API, events, and UX around it.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10** (M2/M3 parallel to M6; M7 depends on M1, M4, and M5 since it aggregates NET GCI and collections by lead source). **M5 is built with M4 immediately after M1** — the two are one workstream: payments restate receivables on every mutation, so schedule M4.1 (receivable schema) and M5.1 side by side. **M5.1 must land before M1.4's importer full run** — the importer's payments leg (owned by M1.4) writes through M5's bulk-create path, and the workbook cannot fully migrate without it.

---

## Milestone M5.1 — Payment schema, split snapshot & events (3–4 days)

**Objective:** payments persist with a hard deal FK, a save-time split snapshot produced by M1's engine, restatement events consumed by M4, and the importer bulk path — no UI.

**Deliverables checklist**
- [ ] Payment schema (§3.1: inputs + five snapshot ₱ fields + `vat_basis_used`/`ewt_rate_used`/`vat_rate_used` + year_paid/month_paid), soft-delete, audit fields
- [ ] Create/update/delete APIs calling `computePaymentSplit` from M1's library (no local math), snapshot semantics per PRD §3.3
- [ ] Referential integrity: existing, non-archived, same-workspace deal only (edge case 10); enum assertion `vat_basis_used ∈ {inclusive, n/a}` (the Exclusive option was removed 2026-07-17)
- [ ] Validation: gross > 0; type enum; warning contract (future date, pre-booking date, duplicate, Closed/Cancelled) returned as structured warnings requiring explicit acknowledgment
- [ ] `payment.created/updated/deleted` events, transactional with the mutation; M4 restatement consumer contract (Collected/Balance/Last+First Payment/Months Idle)
- [ ] Bulk-create path for the M1.4 importer (blank type ≡ Commission; ₱0.01 reconciliation report against workbook cache)
- [ ] Field-level old→new audit entries on every mutation

**Tasks (≤1 day each):** schema + migrations + audit wiring · create API + engine call + snapshot fields + FK/validation · update/delete + re-snapshot + optimistic locking · events + M4 consumer contract + transactional test · bulk-create + reconciliation report · warning contract + friction-gate checks (rule 11).

**Definition of done:** acceptance criteria 1–8, 10, 16 pass at API level; D021 incentive fixture stores 44,642.86 / 5,357.14 / 4,464.29 / 45,535.71 / 40,178.57 centavo-exact; deleting it restates D021's balance to ₱354,591.84; EWT 10%→5% leaves stored splits untouched and new splits at 2,232.14; the 8 live workbook payments bulk-create with 0 mismatches.

**Demo script:** POST D021's ₱50,000 incentive → response shows the five-way split; GET the M4 receivable → Collected 44,642.86 / Balance 309,948.98; POST against "D999" → rejected; DELETE the payment → balance back to 354,591.84 with audit entries throughout.

**Dependencies:** M1.1 (engine + `computePaymentSplit`), M1.2 (deal entities/events), M4.1 (receivable schema for restatement). Blocks M1.4's full importer run and all of M6/M8.

## Milestone M5.2 — Fast-entry form & split preview (3–4 days)

**Objective:** the daily-use entry surface: "log a release in < 30 seconds," mobile-first, with the searchable deal picker and live split preview.

**Deliverables checklist**
- [ ] Deal picker: type-ahead by code or client name showing "D021 — Daria & John Salon" + status/balance hint; every active deal payable (replaces sheet dropdown + cleanup script)
- [ ] Entry form: date defaults today, gross with ₱ numeric keypad, Commission/Incentive toggle (Commission default), OR/Invoice note
- [ ] Live split preview (Net / VAT / EWT / Net Cash / Retained) via preview endpoint or shared engine lib — never re-implemented in UI
- [ ] Amber warning banners with "Continue anyway" (audit-logged) incl. Closed/Cancelled reopen prompt wired to M4
- [ ] Save toast with stored split + undo (delete path); form resets for the next entry
- [ ] Mobile-first layout, one-handed usable at 360 px

**Tasks:** picker API + component · form skeleton + defaults + validation states · preview wiring · warnings + reopen action · save/undo/reset flow · mobile pass + keypad ergonomics.

**Definition of done:** acceptance criteria 9, 11–12, 14 pass as UI tests; stopwatch check with the product owner: a practiced user logs a known release on a phone-sized viewport in under 30 seconds; preview matches stored split exactly on save.

**Demo script:** on a phone viewport, type "sal" → pick "D021 — Daria & John Salon (Open · bal ₱354,591.84)" → Type = Incentive, Gross 50,000 → preview shows **₱44,642.86 / 5,357.14 / 4,464.29 / 45,535.71 / 40,178.57** → Save → toast + receivable balance now ₱309,948.98.

**Dependencies:** M5.1; M0.3 (formatting/affordance conventions), M1.3 helpful but not blocking.

## Milestone M5.3 — Payments list, per-deal panel & exports (2–4 days)

**Objective:** the read side: newest-first list with all ₱ columns, filters, per-deal payments panel embedded in M1/M4 views, export.

**Deliverables checklist**
- [ ] Payments list: newest-first, joined deal identity columns (deal year, developer, client, property), type badges, "untaxed" cell states, ₱ formats, sticky header
- [ ] Filters (year_paid, month, deal, developer, type, text) + pagination
- [ ] Stale-basis ⚠ indicator (FR-M5-12) + explicit recompute flow from M1's deal-edit confirmation (FR-M5-10)
- [ ] Per-deal payments panel with running total vs Total Collectible; embedded in deal detail (M1) and receivable view (M4); "Log a payment" pre-filled
- [ ] Edit/delete UI per rule 11's friction gates: explicit old→new confirmation + audit entry on every money-restating change
- [ ] CSV/XLSX export of filtered set; mobile card layout; empty state

**Tasks:** list + joins + filters · badges/inline states + stale-basis query · per-deal panel + cross-links · edit/delete flows · recompute flow UI · export + mobile + empty state.

**Definition of done:** acceptance criteria 7 (UI leg), 13, 15 pass; list P95 < 500 ms on the 1,000-payment fixture; per-deal panel totals tie to M4 balances centavo-exact.

**Demo script:** import the v30.20 workbook (M1.4) → payments list shows the 8 live rows newest-first, D021's incentive row badged; open D021's receivable → panel shows the release and running total 44,642.86 of 354,591.84; edit the deal's VAT basis → decline recompute → row shows ⚠ stale-basis; export CSV.

**Dependencies:** M5.1–M5.2; M1.4 for the imported-data demo; M4.2 (receivable views) for the embedded panel.

## Milestone M5.4 — Hardening, access control & performance (2–3 days)

**Objective:** production polish: access control + friction gates, concurrency, perf targets, and the 1,000-payment load fixture in CI.

**Deliverables checklist**
- [ ] Access-control integration tests: every mutation × auth state (owner / unauthenticated / cross-workspace) + friction-gate coverage — unconfirmed edit/delete rejected (rule 11; per-role boundaries deferred to v2 per OQ3)
- [ ] Concurrency: optimistic-locking conflict UX; transactional event delivery proven under parallel writes (payment + M4 restatement atomic)
- [ ] Perf: create < 300 ms, list P95 < 500 ms, preview < 100 ms, picker < 150 ms over 1,000 deals/payments; load fixtures in CI
- [ ] Data Health feed: stale-basis count exposed for M6; ₱0.50-tolerance reconciliation helpers (never float equality)
- [ ] Audit-log review pass: every path from M5.1–M5.3 produces exactly one correct entry

**Tasks:** access-control + friction-gate tests · concurrency/transactional tests · perf tuning + CI load fixture · M6 feed + tolerance helpers · audit sweep.

**Definition of done:** all §9 acceptance criteria green in CI including the 1,000-payment perf gates; forged API requests (bad auth, cross-workspace deal ref, unconfirmed destructive actions) provably rejected.

**Demo script:** run the CI suite; fire 20 parallel creates against one deal → M4 balance exact, no lost events; submit a delete without the confirmation acknowledgment, and any request against another workspace's payment, via API → rejected (400/403).

**Dependencies:** M5.1–M5.3.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M5.1 Schema, split snapshot & events | 3–4 |
| M5.2 Fast-entry form & preview | 3–4 |
| M5.3 List, per-deal panel & exports | 2–4 |
| M5.4 Hardening & performance | 2–3 |
| **Total** | **10–15** |

Assumptions: M1.1's engine ships `computePaymentSplit` fixture-tested (M5 adds integration tests only, no math authorship); M4.1 schema exists when M5.1 starts (same workstream); component library from M0/M1 reused; importer parsing effort sits in M1.4's estimate, not here.

## Test plan

Unit/integration tests for every rule in the module, using the workbook's verified numbers as fixtures. **Shared fixtures with M1 (mandatory, per working instruction 6 — same numbers, one money truth):**

- **D021** — NET GCI **₱354,591.84** (GCI ₱318,877.55 + incentive ₱35,714.29); VAT memo ₱42,551.02; EWT memo ₱35,459.18. M5 consumes it as the Inclusive deal behind the payment split and the ₱354,591.84 Total Collectible that restates to ₱309,948.98 after the release.
- **D004** — GCI ₱875,000, NET GCI ₱800,000, yield 4.5714%. M5 consumes it as the untaxed (N/A) deal: payment Gross 875,000 → all-net pass-through.
- **D011** — Fixed ₱174,500 ÷ 1.12 = ₱155,803.57. Regression anchor that Fixed-basis Inclusive deals split payments identically to %-basis ones (basis affects booking, not the payment split).
- **D021 incentive payment split** — Gross ₱50,000 → Net **₱44,642.86** / VAT **₱5,357.14** / EWT **₱4,464.29** / Net Cash **₱45,535.71** (Retained ₱40,178.57).

1. **Rule P1 (Inclusive):** D021 fixture above, centavo-exact on all five fields; identity check net + vat = gross within ₱0.01; EWT-at-5% variant → 2,232.14.
2. **Rule P2 (untaxed):** D004 875,000 pass-through; the six other untaxed live rows (D017 22,500; D018 130,000; D019 10,000; D020 37,500; D006 352,500; D001 436,050) all net = gross, VAT = EWT = 0.
3. **Rule P3 (edge case 7):** Incentive-type on incentive_taxable = No → zero VAT/EWT, net = gross (synthetic ₱30,000); Commission-type on the same deal still splits per P1; Incentive-type with taxable Yes/blank = the D021 fixture.
4. **Escape-hatch flow (former Rule P4 retired):** a Fixed-basis deal with Fixed = 112,000 (Exclusive-style VAT-inclusive total) splits per Rule P1 → Net 100,000.00 / VAT 12,000.00 / EWT 10,000.00 / Net Cash 102,000.00; enum assertion test proves no code path ever yields an "exclusive" snapshot value.
5. **Referential integrity (edge case 10):** nonexistent code, archived deal, cross-workspace deal → all rejected; FK prevents orphaning under concurrent deal-archive attempts.
6. **Snapshot policy:** deal vat_basis edit leaves stored splits byte-identical and flags stale-basis; opt-in recompute re-snapshots with per-payment audit entries; payment edit re-snapshots under current settings; EWT mid-year change isolates old vs new payments (§3.3.4).
7. **M4 restatement:** create → D021 Collected 44,642.86 / Balance 309,948.98; delete → Collected 0 / Balance 354,591.84; Last/First Payment and Months Idle restate; incentive AND commission payments both count toward Collected.
8. **Validation & warnings:** gross ≤ 0 rejected; future date, pre-booking date, duplicate (same deal+gross+date), Closed/Cancelled (with reopen action) each produce exactly one acknowledgeable warning, never a silent save.
9. **Derived periods:** year_paid/month_paid from payment_date; 2026-07-09 → (2026, 7); year-boundary payment (Dec 31 vs Jan 1) lands in the correct M6/M8 buckets.
10. **Importer reconciliation (with M1.4):** all 8 live payments from WORKBOOK_REFERENCE §4 import with splits tying to cached K/L/M/N within ₱0.01; blank and "Commission" types both stored as Commission; re-run is a no-op.
11. **Precision (edge case 15):** decimal-only code paths (property test); ₱0.50-tolerance helper used for reconciliation comparisons; float equality asserted absent; no 2-dp intermediate rounding on ÷1.12 chains.
12. **Friction gates & audit:** full mutation × auth-state matrix (owner / unauthenticated / cross-workspace); edit/delete without the explicit confirmation acknowledgment rejected; every mutation exactly one field-level old→new audit entry; warning acknowledgments logged.
