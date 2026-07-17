# ZETA GCI + Collections — Master PRD

**Working name:** ZETA GCI + Collections (final name TBD) · **Source of truth:** `ZETA_GCI_Calculator__Collections_v30.20.xlsx` (verified extraction in `WORKBOOK_REFERENCE.md`) · **Package:** this Master PRD + one PRD and one Milestone Document per module M0–M10 · **Audience:** developers with zero real-estate and zero Philippine-tax knowledge.

> **v1 positioning (product decision, 2026-07-17):** ZETA GCI + Collections v1 is a **micro SaaS for individual Philippine real estate agents who self-log their own commissions.** One workspace = one agent = one book of business. There are no teams, roles, or shared access in v1 — the **brokerage/team edition is the defined next version (v2)**, and the v1 architecture is deliberately team-ready so v2 is a feature release, not a migration. Wherever a module document says "the agent," the source workbook said "the team" — the math is identical; the tenant changed.

---

## 1. Product vision

Philippine real estate agents run their money on fragile spreadsheets — when they track it at all. The v30.20 workbook this product replaces is a battle-tested one: it books every closed deal through a BIR-compliant commission and VAT engine, tracks the commission each developer still owes as a receivable, logs every cash release with its tax split, and feeds realized yields into MREA-style GCI goal planning with lead-generation funnel math.

**ZETA GCI + Collections is the only tool that combines**, in one product:
(a) a **BIR-compliant commission & VAT engine** for PH real estate (property VAT per RR 1-2024, VAT-inclusive commission billing with per-developer Comm Base, creditable EWT / Form 2307, VAT-registered and non-VAT agents);
(b) **commission receivables/collections tracking against developers** — total owed per deal vs cash collected = balance left, with aging, chase lists, and vintage analysis;
(c) **GCI goal planning** — an annual economic model and seller/buyer funnels whose average commission rate and average sale price link live to the agent's own actuals.

Generic CRMs track leads; accounting tools track invoices; nothing on the PH market tracks *an agent's commission economics* end-to-end. The philosophy to preserve, verbatim from the workbook: **"track total commission owed per deal vs cash actually collected = balance left. No forecasting of buyer-to-developer payment cycles."** Reactive payment logging. Only inputs are editable; all computed values are locked and derived.

**Why solo-first (micro SaaS logic):** the individual agent is the atomic unit of this problem — pre-selling commissions arrive in tranches over years, and it is the *agent's* money stuck in developer pipelines. Solo-first means: self-serve onboarding, no seat management, one price, the workbook importer as the growth wedge (every serious agent already has some spreadsheet), and a product one developer can build and maintain. Teams (v2) then arrive as an upgrade for agents who grow into leaders — the same engine, shared.

**Target users (v1):** individual Philippine real estate brokers and salespersons — solo practitioners self-logging commissions on developer (pre-selling/RFO), resale, rental, and referral deals. **v2:** selling teams and brokerages (Rainmaker + admin/ISA staff + agents) on shared workspaces.

## 2. Personas

| Persona | Description | Primary surfaces | What success feels like |
|---|---|---|---|
| **The solo agent (v1's only user)** — e.g., a broker with a ₱16.9M GCI goal, selling for 4–5 developers plus resale/rental listings | Wears every hat the workbook's team divided: logs own deals from developer computation sheets, logs every release, chases developers, plans the year | Everything; daily loop = M5 Payments + M6 Dashboard; weekly = M1/M4; monthly = M2/M3/M7/M8 | Opens the dashboard Monday, sees position/pace/chase list, knows exactly which developer to call; logs a release from their phone in 30 seconds; taxes split themselves |
| **Their accountant/bookkeeper** (indirect — receives exports, not a login in v1) | Prepares monthly VAT/percentage-tax filings and annual ITR with 2307 credits | M8 report exports (esp. tax-per-month) | Report 4 prints and ties to the centavo |
| *(v2)* Rainmaker / team leader; Admin/ISA; team Agents; Read-only | The workbook's original cast — arrives with multi-member workspaces | Team dashboards, per-agent attribution | Deferred |

## 3. End-to-end flow

```
                     M0 Settings (rates, VAT rules, developers, sources)
                          │ feeds every computation & dropdown
                          ▼
   ┌─────────────► M1 DEAL LOG ──────────────────────────────┐
   │               (commission engine:                       │
   │                GCI, NET GCI, memos, yield)              │
   │                     │ auto-creates                      │ aggregates
   │                     ▼                                   ▼
   │               M4 COLLECTIBLE                       M2 YIELD SUMMARY
   │               (one receivable per deal:            (segments, blended
   │                collectible vs collected             yield & avg price)
   │                = balance; status;                        │ planning basis
   │                variance; write-off)                      ▼
   │                     ▲ restates                      M3 GCI CALCULATOR
   │                     │                               (goal, funnels,
   │               M5 PAYMENTS LOG                        pace vs actual)
   │               (each release; tax split                   │ targets
   │                VAT / EWT / net cash)                     ▼
   │                     │                               M6 DASHBOARD ◄──── M4/M5
   │                     ├──────────────► M8 COLLECTION REPORTS
   │                     │                (cash & tax by period, vintage)
   │                     └──────────────► M7 SOURCE PERFORMANCE ◄─── M4 (by lead source)
   │
   └── M9 SEARCH (read-only across deals/collectibles/payments)
       M10 ONBOARDING (wizard, legend, doctrines, empty states — wraps everything)
```

Deal → Collectible → Payments → Dashboard/Reports is the collections spine; Deals → Yield → Calculator is the planning spine. Both spines share one calculation engine (M1's pure library) — **money is computed in exactly one place**.

## 4. Cross-cutting requirements (referenced by every module)

1. **Multi-tenancy, single-user tenants (v1).** One workspace per agent; absolute tenant isolation; the sole user is the workspace `owner` who can do everything. **Friction-gating replaces role-gating:** destructive or money-restating actions (deal edits after payments exist, close/cancel, rate changes, deletions) require explicit confirmations and always write audit entries. The membership schema is team-ready (M0 §3.2); role UIs, invitations, and permission middleware are v2. Where module documents mention approval-worthy actions, read "requires confirmation," not "requires a role."
2. **₱ PHP formatting throughout.** `₱ #,##0.00`; percentages to 2 dp (4 dp where the sheet shows finer, e.g., yields); dates workspace-local (Asia/Manila initially).
3. **Decimal money everywhere** (edge case 15). All computation in exact decimal arithmetic; full precision through intermediate steps; round half-up to centavos only at persistence/display boundaries; comparisons that the sheet makes with tolerance use **₱0.50** (Data Health), never float equality.
4. **Computed fields are never directly editable.** The product-wide input-vs-computed affordance ("blue" inputs, locked computed values with formula tooltips) is specced in M0/M10 and mandatory in every module.
5. **Audit trail on financial edits.** Every mutation of deals, payments, receivable statuses/overrides, and settings writes an immutable field-level old→new audit entry with timestamp (M0 §3.7 schema). In v1 this is the agent's self-audit and BIR-defensibility trail; in v2 it becomes the multi-user accountability trail unchanged.
6. **Soft-delete with referential integrity.** Deals with payments cannot be deleted (block or explicit cascade confirmation); list items in use can only be archived; payments must reference an existing deal (the sheet's "typo safeguard" becomes a hard FK). The sheet's silent fallbacks (missing property type → Always-VAT; missing developer → Net) are replaced by prevention.
7. **CSV/XLSX export on every table** — deals, payments, receivables, every report, every settings list, search results. For a solo product this is also the trust contract: the agent's data is never captive.
8. **One-time importer** (part of M1's milestones) that migrates an existing v30.x workbook: Settings lists + tax settings → M0; deals (preserving Deal IDs) → M1; payments → M5; collectible statuses, Confirmed Collectibles, Next Action notes → M4. Reconciles every recomputed figure against the workbook's cached values to ₱0.01 and reports mismatches instead of importing them silently. The importer is the **acquisition wedge** — serious agents already keep a spreadsheet.
9. **Permanent deal identity.** `D001, D002, …` from an immutable per-workspace sequence, assigned at creation, never renumbered or reused (M1 §4.1).
10. **Performance envelope:** every workspace must stay instant at ≥1,000 deals and ≥1,000 payments — list views < 500 ms P95, dashboard < 1.5 s, reports < 1 s, search < 300 ms P95. (A solo agent logging ~50 deals/year won't approach this for a decade; the envelope also covers v2 team workspaces on the same schema.)
11. **Mobile is first-class.** The solo agent runs the daily loop (log a release, check the chase list) from a phone; M5 fast-entry and M6's chase list must be excellent at 360 px, not merely usable.
12. **Doctrines as product copy.** The Collectible Corrections doctrine (3 cases), the What-to-Book doctrine (splits at source vs referral out), and Closed-vs-Cancelled ship verbatim as contextual help (M10) — business policy, not documentation garnish. (The Inclusive/Exclusive "quick test" retired with the VAT-basis option on 2026-07-17; its help slot now carries the Fixed-basis escape-hatch note.)

## 5. Module map with dependencies

| # | Module | Depends on | Feeds | PRD/Milestones |
|---|---|---|---|---|
| M0 | Account Foundation & Settings | — | everything | `M0_PRD.md` / `M0_Milestones.md` |
| M1 | Deal Log & Commission Engine | M0 | M2–M9 (engine + events); importer | `M1_*.md` |
| M2 | Yield Summary & Realized Analytics | M1 | M3 (planning basis) | `M2_*.md` |
| M3 | GCI Calculator & Goal Planning | M2, M0 | M6 (annual target) | `M3_*.md` |
| M4 | Collectibles (Receivables Ledger) | M1 (auto-create), M5 (collected) | M6, M7, M8, M9 | `M4_*.md` |
| M5 | Payments Log | M1 (deal ref, split fn), M0 (rates) | M4, M6, M8, M9 | `M5_*.md` |
| M6 | Collections Dashboard | M4, M5, M3 (target; stub-able), M0 | — | `M6_*.md` |
| M7 | Source Performance | M1, M4, M5, M0 (sources) | — | `M7_*.md` |
| M8 | Collection Reports | M5, M4, M1 | — | `M8_*.md` |
| M9 | Search Console | M1, M4, M5 | — | `M9_*.md` |
| M10 | Onboarding & In-App Guidance | all (orchestrates M0/M1 flows) | — | `M10_*.md` |

**Dependency-safe build order:** **M0 → M1 → M4+M5 (together) → M6 → M2 → M3 → M7 → M8 → M9 → M10.** M2/M3 can run parallel to M6. M7 depends on M1, M4, and M5 since it aggregates NET GCI and collections by lead source. M10 is last, but its legend component is built in M0 and adopted from M1 onward.

**Estimate roll-up (solo full-stack dev, ideal days):** M0 8–13 · M1 16–24 · M2 7–11 · M3 9–14 · M4 9–13 · M5 10–15 · M6 11–15 · M7 5–8 · M8 7–11 · M9 5–8 (+2 optional) · M10 13–18 → **100–150 ideal dev-days** end-to-end; the MVP cut below is **~55–80**. (The Q2 resolution — dual VAT-registration support — adds roughly 2–4 days inside the M0/M1/M5 ranges: one settings flag, one engine mode branch with fixture N1, one payment-split rule.)

## 6. Recommended tech constraints (recommendations, not mandates)

- **Multi-tenant web app** with a **relational database** (PostgreSQL-class): the domain is joins and aggregates over strictly-typed money — relational integrity (FKs for the typo safeguard, sequences for deal codes) is load-bearing.
- **Server-side calculation engine as a pure, unit-tested function library** — `computeDeal()` and `computePaymentSplit()` (M1.1) are the only code paths producing money figures. **Never compute money in the UI**; form previews call the same library (shared package or preview endpoint).
- **Exact-decimal types end to end** (DB `numeric`, decimal library in code); binary floats forbidden in money paths and linted against.
- **Event-driven read models** for aggregates (deal/payment events restate M2/M4/M6/M7/M8 projections) — simple materialized aggregates are fine at this scale; correctness (restatement on edit) matters more than sophistication.
- Monolith-first; background jobs for bulk recompute and import; audit log as append-only table. **Mobile-responsive web before any native app** (M5 fast-entry is the phone-critical path). Keep hosting/ops within micro-SaaS economics — one modest instance + managed Postgres should carry thousands of solo workspaces.
- Timezone: workspace-local "today" (Asia/Manila) for pace/idle computations; store UTC.

## 7. Consolidated Open Questions register

Items marked ⚠ are **blocking** for their module's full scope; everything else has a stated default that parity-follows the sheet. "Register #" refers to the workbook discrepancy register (`WORKBOOK_REFERENCE.md` §14).

| # | Module(s) | Question | Default until answered |
|---|---|---|---|
| Q1 ✅ | M1, M5 | **RESOLVED BY REMOVAL (product owner, 2026-07-17): the Inclusive/Exclusive option is deleted from the product.** All observed developers bill VAT-inclusive; the option was speculative future-proofing for a never-observed case, and its payment-side ambiguity had no answerable fixture. Taxable billed commission is always treated VAT-inclusive (M1 Rule D); the Exclusive-style edge case books via **Fixed basis on the VAT-inclusive total** (112,000 → GCI 100,000.00); `vat_basis` column reserved for a per-developer reintroduction if ever observed. M5's blocked-entry state is deleted. | — implemented in spec |
| Q2 ✅ | M0, M1, M5 | **RESOLVED (product owner, 2026-07-17): v1 supports BOTH VAT-registered and non-VAT-registered agents.** M0 TaxSettings gains a `vat_registered` flag (set in onboarding). VAT-registered → current engine (÷1.12 on receipted deals, VAT memos, EWT default 10%). Non-VAT → commission-VAT machinery off entirely (no ÷1.12, VAT memos = 0); **EWT still applies on taxable deals, default 5%** (sworn-declaration rate; editable — non-VAT without the declaration is withheld 10%). Property VAT (Net List ÷1.12) is the developer's VAT and applies regardless. See M0 §3.3, M1 Rules D/E/F/I + fixture N1, M5 Rule P5. | — implemented in spec |
| Q3 | M1 | VAT/EWT **memo base when a taxable deal carries a Referral Out** (register #7) — memo on GCI + taxable incentive (as specced) or net of referral out? No live fixture. | GCI + taxable incentive |
| Q4 | M0, M1, M5 | **Recompute policy on settings change** — historical payments keep stored splits; deals recompute behind confirmation; or effective-dating? | Snapshot payments + confirmed recompute of booked figures |
| Q5 | M4, M6 | **Chase list tiebreaker** (register #2) — prompt says idle time; sheet cache shows row-index epsilon. | balance DESC, months_idle DESC, deal_code |
| Q6 | M3 | **Rental volume in YTD Actual Sales** (register #3) — sheet includes annual-rent volume; prompt §3.7 says sales only. | Sheet behavior (include rentals) |
| Q7 | M3 | **Hidden scratch block** (register #5) — graduated agency-split table in the calculator sheet; personal side-calc? | Excluded from product |
| Q8 | M3, M6 | **Working-goal rounding** — hard ROUNDUP to nearest ₱10,000 (register #4); configurable? Dashboard override governance (note required?). | Sheet rule; dashboard-only override, one per year |
| Q9 | M3 | **Weekly denominator** — 48 working weeks (sheet) vs 52. | 48, assumption stated in UI |
| Q10 | M3 | **Per-year funnel conversion rates** vs one global set (sheet). | Global; schema ready for per-year |
| Q11 | M2 | **Planning basis window** — all-time (sheet) vs trailing-N-months once data accumulates. | All-time |
| Q12 | M2, M7 | **Cancelled deals in booked analytics** — sheet includes them in Yield Summary and Source Performance. Exclude, include, or badge? | Include (parity) + badge consideration in M7 |
| Q13 | M2 | **Referral segment yield semantics** — fee ÷ referred property's list price? | Yes; list_price on Referrer deals = referred property price |
| Q14 | M2 | **Aggregation precision policy** — sum persisted 2-dp values (ties to visible rows) vs full-precision engine outputs. | Sum persisted 2-dp; documented ₱0.01-class deltas |
| Q15 | M7 | **Collected NET per source** (register #10) — sheet derives Booked − Outstanding (mixes bases; D004: 800,000 vs actual cash 875,000); spec uses Σ actual collected. Confirm departure from parity. | Σ receivable.collected |
| Q16 | M7 | **% Collected denominator** — Booked NET GCI (can exceed 100%, honest) vs Total Collectible (capped, mixed lens). | Booked, with pass-through tooltip |
| Q17 | M7, M8 | **Paid-year lens per source** (M7) and **report-4 OR/invoice grouping for BIR filing** (M8). | Fast-follow; month totals only |
| Q18 | M8 | **Report 5 Outstanding** — split written-off (Cancelled) amounts out of Outstanding (recommended, matches M6 position block) or lump like the sheet? | Split, flagged as sheet departure |
| Q19 | M8 | **Fiscal-year support** — calendar-only (sheet) confirmed? | Calendar only, documented limitation |
| Q20 | M4 | **Confirmed Collectible lifecycle** — clearable (with audit + note)? Cancelled reason codes? Reopen limits? Negative balances display vs clamp? | Clearable w/ audit; free-text; unlimited reopen w/ audit; show negative |
| Q21 | M5 | **Clawbacks/negative payments**; **OR-number uniqueness**; **payment date before booking date** (live D021 fixture proves the sheet allows it). | Reject negatives v1; free-text OR; warn-only on pre-booking dates |
| Q22 | M9 | **Search scope** — archived records included? Unified "All" tab in v1? Extend text search to OR/invoice + Next Action notes? Export cap? | Include w/ badge; unified tab optional; client+property only; no cap |
| Q23 | M9 | **Collectibles sort mapping** — sheet ignores the sort selector for Collectibles (always balance desc). | Map Date-oldest → booking date as defined improvement |
| Q24 | M1 | **Client/Counterparty semantics** on developer deals — Start Here says "party you represent"; Deal Log header and live data say the unit buyer. | Buyer (header + data) |
| Q25 | M1 | **Per-developer default VAT Basis** (like comm_base) with per-deal override? | Per-developer default, per-deal override |
| Q26 | M1 | **Importer gap handling** — preserve gaps in workbook deal codes; continue after max. | Yes; no re-use of gaps |
| Q27 | M0 | **Per-deal EWT override** (corporate payors at other rates) vs workspace-global (sheet). | Global |
| Q28 | M0 | Lead-source soft cap at 50 (sheet limit) — keep as warning? | Soft warn only |
| Q29 | M10 | **Sample-deal mechanics** — typed-along (recommended) vs auto-created; reserved `SMPL-1` code vs consuming the real sequence. | Typed-along; reserved code pending M1 sign-off |
| Q30 | M10 | Checklist never gates features; popover tooling native vs library; Tagalog copy future. | Never gates; native; locale key reserved |
| Q31 | M0 | **v2 upgrade contract** — does a solo workspace convert to a team workspace (owner invites members into their book) or do members join a fresh team workspace (merge)? Validates the team-ready schema bet; doesn't block v1. | Convert-in-place assumed |
| Q32 | doc | Cosmetic workbook drift (register #1): Start Here says VAT threshold lives on Yield Summary; v30.20 keeps it on Settings. | Settings is the single home |

**Answer-first shortlist for the product owner (unblocks the most code):** Q4 (recompute policy), Q5 (chase tiebreaker), Q6 (rental in YTD), Q15 (source Collected). *(Q1 resolved by removal and Q2 resolved as dual-registration support, both 2026-07-17 — M1/M5 are now fully unblocked for build.)* *(Q2 resolved 2026-07-17 — both registrations supported; spec updated across M0/M1/M5. One successor question opened as M1 OQ7: how Inclusive developers state the commission to a non-VAT payee — confirm with the first real non-VAT SOA.)*

## 8. Suggested MVP cut

**Goal of v1: one real solo agent runs their daily collections on the product instead of the sheet.** The daily loop is *log deal → receivable appears → log releases → watch the dashboard/chase list*. Planning and analytics are consumed weekly/monthly and can follow.

**MVP (usable v1 for a solo agent) — ~55–80 ideal dev-days:**
- **M0** complete (M0.1–M0.4) — auth, personal workspace, settings, lists, audit, data ownership.
- **M1** complete (M1.1–M1.5) — engine, deal CRUD, entry UI, **importer**, recompute. The importer is in-scope for MVP because serious agents already have a workbook; adoption depends on it.
- **M4** complete — receivables, overrides + required notes, lifecycle, balances/variance.
- **M5** complete — payment fast-entry with tax splits, phone-first (no blocked states — Q1 resolved by removal).
- **M6 core** — sections 1 (position), 3 (cash & tax), 4 (aging), 8 (chase list) + data health; sections 2/6 (target pace, monthly vs target) ship with a **manual annual target** (M3 stub); section 5 (by developer) if timeline allows, else fast-follow.
- **M9 minimal** (optional in MVP): the deal/payment list filters in M1/M5 cover 80% of search needs.

**Fast-follow wave 1 (planning + channel insight, ~20–30 days):** **M2** (yield summary — also upgrades M6's manual target to live planning basis), **M3** (calculator + funnels; replaces the manual target stub), **M7** (source performance).

**Fast-follow wave 2 (~15–25 days):** **M8** (collection reports — until then the bookkeeper gets the payments-table export), **M9** full, **M10** full wizard (MVP ships with a minimal setup checklist + the legend + the corrections-doctrine popovers; the guided walkthrough and full help system complete here).

**v2 — Brokerage/Team edition (the defined next version, out of v1 scope everywhere):** multi-member workspaces, the four-role matrix (Owner/Rainmaker, Admin, Agent, Read-only) with server-side permission middleware, invitations, per-agent deal attribution, team dashboards and leaderboards, and the solo→team upgrade path (Q31). The v1 schema (membership table, `created_by` on financial rows, reserved role enum) exists so this lands as a feature release.

**Explicitly not in any near-term scope** (consolidated from module PRDs): buyer-payment-cycle forecasting; accounting GL / e-BIR filing; automated adjacent-property VAT aggregation; intra-team commission splits; listings management; multi-currency; native mobile apps.

## 9. Acceptance anchor for the whole package

The package is correct when: (1) the v30.20 workbook imports cleanly and the dashboard shows Total Collectible **₱6,763,497.25**, Collected **₱1,908,192.86**, Outstanding **₱4,855,304.39**, Net Cash **₱1,909,085.71**; (2) re-entering fixture D021 by hand reproduces NET GCI **₱354,591.84** (GCI ₱318,877.55 + incentive ₱35,714.29), VAT memo ₱42,551.02, EWT memo ₱35,459.18; (3) logging a ₱50,000 Inclusive incentive release splits to 44,642.86 / 5,357.14 / 4,464.29 / 45,535.71; (4) the calculator shows GCI goal ₱16,920,000, fees/deal ₱381,676.31, 44.33 deals; and (5) on a **non-VAT-registered** workspace (EWT 5%), D021's inputs reproduce fixture N1 — GCI = billed = **₱357,142.86**, NET GCI **₱397,142.86**, VAT memo ₱0, EWT memo **₱19,857.14** — all to the centavo, all from the server-side engine.
