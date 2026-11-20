# M10 — Onboarding & In-App Guidance — PRD

**Product:** ZETA GCI + Collections · **Module:** M10 of M0–M10 · **Source of truth:** v30.20 workbook — *Start Here* sheet (doctrines, legend, flow map) · **Audience:** developers with zero real-estate and zero PH-tax knowledge. M10 turns the workbook's static instruction tab into living product surface: a first-run wizard, contextual help carrying the Start Here doctrines verbatim, the input-vs-computed legend, empty states, a getting-started checklist, and an in-app glossary. **M10 owns no financial logic** — every peso figure it ever shows comes from M1's engine.

---

## 1. Module overview

M10 is the product's teaching layer. It orchestrates existing capabilities (M0 settings/lists, M1 deal entry + importer, M4/M5 for sample-data cleanup) into a guided first-run experience, and distributes the *Start Here* sheet's business doctrines to the exact screens where the agent needs them.

**Spreadsheet behavior it replaces.** The workbook's *Start Here* tab is a wall of text a new user must read before touching anything: the flow map (Deal Log → Yield Summary → GCI Calculator; Collectibles → Payments Log → Dashboard; Source Performance; Collection Reports), the cell-color legend (Blue = input, Black = formula, Green = linked from another tab), the philosophy statement, the Property-VAT and Force-VAT rules, the Inclusive/Exclusive "quick test", the Agent Representation and Client/Counterparty definitions, the Collectible Corrections and What-to-Book doctrines, the Closed-vs-Cancelled explainer, and the Mode-of-Payment collection-timing note. Nobody reads it at the moment they need it; the knowledge lives one tab away from the field it governs.

**What improves in SaaS form.**

1. **Doctrine at the point of use.** Each Start Here rule becomes a help popover attached to the field or dialog it governs (e.g., Closed-vs-Cancelled sits *in* the status-change dialog; the What-to-Book doctrine sits *on* the referral-out fields).
2. **Guided setup instead of a blank file.** A resumable first-run wizard walks the agent through settings review, seed lists, the import-vs-fresh fork, and a typed-along first deal — completable in under 10 minutes including a workbook import.
3. **The legend becomes an enforced component.** Blue-input / locked-computed / linked-value affordances (established visually in M0/M1) get a canonical spec, a "?" explainer, and a consistency requirement across all modules.
4. **Empty states teach the flow.** Every module's empty screen states what fills it and links to the action, instead of showing a blank grid.
5. **Content updates without deploys.** Doctrine copy is a versioned content bundle, editable without shipping application code.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent, onboarding themselves.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Set up their workspace end-to-end via the wizard; choose import vs fresh start; learn the deal-entry flow on a clearly-marked sample deal via field-level help and the representation/VAT-basis explainers; use contextual help while doing daily entry; consult the Corrections-doctrine mini-flow when a developer's figure disagrees with the books; understand what dashboard/report figures mean via the balance-basis and tax notes; use the glossary; re-run the setup assistant later from Settings. |
| *(v2, out of scope)* | Invited team members (Admin/ISA, Agents, Read-only) and their lightweight first-login orientation — arrives with the brokerage/team edition. |

## 3. Data model

M10's entities are UI/content state — no money fields anywhere. All rows carry `workspace_id` (except product-level content), audit fields per M0 conventions.

### 3.1 OnboardingState (one per workspace)
| Field | Type | Req | Editable | Validation / Default | Notes |
|---|---|---|---|---|---|
| workspace_id | fk | ✔ | computed | unique | Created with the workspace (M0 FR-M0-02). |
| status | enum | ✔ | computed | `not_started` → `in_progress` → `completed` \| `dismissed` | Dismissed ≠ blocked: app is always fully usable. |
| current_step | enum | ✔ | computed | `basics` \| `tax_review` \| `seed_lists` \| `migration_fork` \| `first_deal` | Persisted after every step → resumable (rule 2). |
| step_data | jsonb | | computed | | Per-step scratch (e.g., chosen fork, seed selections) — never financial values. |
| import_job_id | fk→M1 import | | computed | nullable | Links the wizard to the M1.4 importer run it launched. |
| sample_deal_id | fk→M1 deal | | computed | nullable | Set when the walkthrough sample deal exists; cleared on cleanup. |
| completed_at / dismissed_at | timestamp | | computed | | |

### 3.2 ChecklistState (one per workspace)
| Field | Type | Req | Editable | Derivation |
|---|---|---|---|---|
| settings_reviewed_at | timestamp | | computed | Set when wizard step `tax_review` completes OR tax settings are saved in M0. |
| first_deal_at | timestamp | | computed | First `deal.created` event where `is_sample = false`. |
| first_payment_at | timestamp | | computed | First payment created (M5) against a non-sample deal. |
| importer_run_at | timestamp | | computed | First successful M1.4 import completion. |
| dismissed_at | timestamp | | user (owner) | Hides the checklist card everywhere; reversible from Settings. |

Items are **event-driven, never manually checkable** — the checklist reports reality, it doesn't collect claims. It **never gates any feature** (rule 9).

### 3.3 HelpArticle (product-level content, not per-workspace)
| Field | Type | Req | Notes |
|---|---|---|---|
| key | slug | ✔ | e.g., `vat-basis-quick-test`, `corrections-doctrine`. Stable — placements reference it. |
| title, body_md | string / markdown | ✔ | Final copy; doctrine articles carry the verbatim Start Here text (§6.3). Glossary terms in `body_md` auto-link (§6.5). |
| placements | slug[] | ✔ | Placement keys where the article surfaces (e.g., `deal-form.vat-basis`). |
| content_version | semver | ✔ | Bundle-level version; history retained (rule 11). |

Content ships as a **versioned bundle** (JSON/Markdown files in a content store or a product-admin table) loaded and cached at runtime — publishable **without an application deploy** (NFR 2). A missing article renders a graceful fallback (glossary link), never a broken popover.

### 3.4 GlossaryEntry (product-level content)
`key (slug), term, definition_md, related_keys[]` — same bundle and versioning as HelpArticle. Seed set in §6.5.

### 3.5 Sample-data marker (field owned by M1, specified here)
`deal.is_sample: bool, default false`. The walkthrough's sample deal is created through the **standard M1 create API** with `is_sample = true`; its M4 receivable and any M5 payments logged against it inherit the flag. Cleanup semantics in rules 4–6.

## 4. Business rules & edge cases

1. **The wizard never blocks.** Every step is skippable; the whole wizard is dismissible at any point; all app features work regardless of wizard state. Onboarding is an accelerant, not a gate.
2. **Abandonment is resumable** (edge case: wizard abandoned mid-way). State persists after each completed step. Next login to a workspace with `status = in_progress` shows a non-modal "Continue setup (step 4 of 5)" prompt. Nothing is lost, nothing is forced.
3. **Importer failure mid-wizard is recoverable.** Step 4 embeds the M1.4 importer (dry-run → commit, transactional, idempotent by file hash). A failed or mismatch-heavy run leaves the wizard on step 4 with the per-row error report visible; the user can fix-and-retry, switch to "Start fresh", or exit — wizard state and all prior steps survive. A partial import cannot exist (M1.4 is all-or-nothing).
4. **Sample data is loudly marked.** The sample deal, its receivable, and its payments render with a "SAMPLE" badge in every table, and a persistent workspace banner ("Sample data is on your books — Remove sample data") shows on M1/M4/M5/M6 surfaces while `sample_deal_id` is set. Sample rows are included in on-screen figures (so the walkthrough's numbers appear everywhere, matching what the user just learned) — the banner exists precisely because they are included.
5. **Sample cleanup is a one-click cascade with no orphans** (edge case: cleanup must not leave orphan receivable/payments). One transaction deletes sample payments (M5) → sample receivable (M4) → sample deal (M1), in that order, as a specified exception to M1's delete protection (permitted only where `is_sample = true`); audit-logged. Post-cleanup, all dashboards/analytics return to their pre-sample values exactly.
6. **Sample deal and the ID sequence.** Whatever Open Question 5 decides, M1 rule 1 stands: deal codes are never reused. If the sample consumes the sequence, a fresh workspace's first real deal becomes D002 after cleanup; the recommended alternative is a reserved out-of-sequence code (e.g., `SMPL-1`).
7. **Re-running the wizard** (edge case: settings-page entry). Settings → "Setup assistant" re-opens the wizard against current state: steps display existing values; the seed-lists step offers only items not already present (no duplicates — M0's case-insensitive uniqueness backstops this); the import step shows prior import history and remains idempotent.
8. **One user, one wizard (v1).** The wizard belongs to the account owner — v1's only user (it mutates settings). *(v2: invited team members will get a one-time lightweight orientation on first login — legend explainer, flow map, glossary entry point — instead of the settings-mutating wizard.)*
9. **The checklist never gates features.** No button, module, or export is ever disabled pending a checklist item (recommendation locked as a rule; also logged as Open Question 4 for ratification).
10. **Checklist truthfulness:** items complete only via the §3.2 events; the sample deal/payment never satisfies `first_deal` / `first_payment` (`is_sample` excluded).
11. **Help content is versioned** (edge case: help content versioning). Bundles are immutable once published; the app pins the latest published version and can render article history; a doctrine change is a content release with its own version and changelog, independent of app deploys.
12. **Doctrine copy is verbatim, not paraphrased.** The §6.3 texts are business policy (they encode which tool to use when money disagrees). Engineering/design may adjust surrounding chrome, never the doctrine sentences. PH-English throughout; ₱ `#,##0.00` in every example.
13. **Mobile wizard** (edge case): at 360 px each step becomes a full-screen page; the typed-along walkthrough reuses M1's mobile stepped deal form; all popovers become bottom sheets.
14. **Legend consistency is a cross-module requirement.** Every module's forms and tables MUST use the three §6.2 affordances for input / computed / linked values. M10 owns the canonical spec and the explainer content; the component itself is built in M0 (see Interactions + sequencing note).
15. **Tax-settings step is a review, not re-entry.** M0 already created defaults (VAT 12%, EWT 10%, threshold ₱3,600,000, chase idle 3). Step 2 presents them with explainers — above all the EWT 5% sworn-declaration option (P11), rendered as a first-class callout, never fine print: solo agents grossing ≤₱3M with a sworn declaration are exactly this product's early adopters (M0 §3.3), and step 2 is where they discover the two-click rate change. Edits flow through M0's APIs with M0's audit trail.
16. **Wizard shows the philosophy before the fork.** Before step 4 the user sees the product's operating philosophy (verbatim, §6.3 P0) so the import-vs-fresh choice is made understanding what the tool does and deliberately does not do (no payment-cycle forecasting).

## 5. Functional requirements

- **FR-M10-01** On first login to a newly created workspace, the Owner is offered the first-run wizard (auto-opened once; re-openable from Settings → Setup assistant). Dismissal is one click and non-destructive.
- **FR-M10-02** Wizard step 1 — *Workspace basics*: confirm/edit workspace name (M0 API); shows the flow map (Deals → Receivables → Payments → Dashboard; Deals → Yield → Calculator).
- **FR-M10-03** Wizard step 2 — *Tax settings review*: presents the four M0 defaults with plain-language explainers (12% Output VAT; EWT 10% with the 5%-sworn-declaration explainer given first-class prominence per rule 15; ₱3,600,000 RR 1-2024 threshold; chase idle 3 months); inline edit via M0 with audit.
- **FR-M10-04** Wizard step 3 — *Seed lists offer*: presents the three seed sets (Property Types with VAT rules; Developers with Comm Base; Lead Sources) with per-item accept/edit/skip, created via M0 APIs only. Seeds are offered, never silently installed (M0 rule 11).
- **FR-M10-05** Wizard step 4 — *Migration fork*: "Import your v30.x workbook" (embeds M1.4: upload → dry-run report → commit; failure handling per rule 3) OR "Start fresh". Import completion marks `importer_run` on the checklist and offers to skip step 5.
- **FR-M10-06** *(Removed in the v1 solo repositioning — the team-invites wizard step is deferred to v2 along with invitations themselves; number retained so FR references stay stable.)*
- **FR-M10-07** Wizard step 5 — *First-deal walkthrough*: guided, **typed-along** entry of a sample deal in the real M1 form (`is_sample = true`), offering fixture D021's inputs as the suggested values; coach-marks explain each computed-panel figure as it appears (Net List, billed, GCI, incentive net, NET GCI, VAT/EWT memos, yield). Optional extension: log a sample release of Gross ₱50,000 (Type = Incentive) via M5 and see the tax split and the receivable balance move. All figures computed by M1/M5 — M10 renders responses only.
- **FR-M10-08** Wizard state machine: persisted per §3.1; resumable (rule 2); skippable per step; Owner-only (rule 8); re-runnable (rule 7).
- **FR-M10-09** Sample-data lifecycle: badge + banner while sample exists (rule 4); "Remove sample data" executes the rule-5 cascade with a confirmation listing exactly what will be deleted; post-cleanup verification that no sample-flagged row remains.
- **FR-M10-10** Legend component: canonical spec for the three value affordances (§6.2) plus a "?" legend explainer popover available from every table/form header; consistency requirement (rule 14) documented as a design-review checklist item for M1–M9.
- **FR-M10-11** Help framework: a placement registry mapping `placement_key → HelpArticle`; popovers open on the field-level "?" trigger; every popover footer links "Open glossary".
- **FR-M10-12** Doctrine placements: all §6.3 articles wired to their exact placements, copy rendered verbatim (rule 12).
- **FR-M10-13** Corrections-doctrine interactive mini-flow on the M4 receivable view ("A number changed — which case am I in?"): two yes/no questions route the user to case 1 (edit the deal), case 2 (Confirmed Collectible + required note), or case 3 (close short, let Variance tell the story), each with the verbatim doctrine text and a deep link to the right action.
- **FR-M10-14** Empty-state registry covering every module surface per §6.4, each with its filling action; M3's explains that the planning basis needs deals OR manual yield/price entry.
- **FR-M10-15** Getting-started checklist card (4 items per §3.2) shown on the dashboard/home until dismissed; event-driven completion; never gates (rule 9).
- **FR-M10-16** In-app glossary: searchable panel seeded per §6.5; any glossary term appearing in help copy auto-links; deep-linkable (`/glossary#gci`).
- **FR-M10-17** Content system: load/cache the published content bundle at runtime; publish flow requires no app deploy; version pinning + fallback per rule 11.
- **FR-M10-18** Instrumentation: events for step completed/skipped, wizard completed/dismissed, help popover opened (by placement), checklist item completed/dismissed, sample created/cleaned — to measure the <10-minute NFR and doctrine reach. No financial values in events.

## 6. UI/UX requirements

### 6.1 Wizard
Five steps with progress indicator, Back/Skip/Continue, dismiss ("Set up later"). Step 4 fork renders as two cards: *Import your v30.x workbook* (recommended when the user has one — "your deals, payments, statuses and notes come across; every recomputed figure is reconciled to your sheet within ₱0.01") vs *Start fresh*. Completion screen shows the checklist and the three next actions (log a deal / log a payment / open the dashboard).

### 6.2 Input-vs-computed legend (canonical spec)
The sheet's legend, verbatim:

> Only blue cells editable. Blue = input, Black = formula, Green = linked from another tab.

SaaS mapping (component built in M0; content and explainer owned here):
| Sheet affordance | Product affordance | Behavior |
|---|---|---|
| Blue = input | **Input** style: editable field styling on forms; editable-cell tint in tables | Editable by the account owner; the only way money *enters* the system |
| Black = formula | **Computed** style: read-only + lock icon + formula tooltip (e.g., "GCI = billed ÷ 1.12 (Inclusive)") | Never directly editable (cross-cutting rule); tooltip names the rule |
| Green = linked | **Linked** style: chip/underline marking a value sourced from another module (e.g., M3's planning basis from M2; deal fields shown on M5 payment rows) | Click navigates to the source |

A "?" trigger on every table/form header opens the legend explainer popover containing the verbatim legend plus the three product affordances.

### 6.3 Contextual help placements — seed content catalog (copy is final; render verbatim)

**P0 · Philosophy** — wizard (before the fork) + M6 dashboard header "?":
> Track total commission owed per deal vs cash actually collected = balance left. No forecasting of buyer-to-developer payment cycles. Reactive logging. Only blue cells editable.

**P1 · Property VAT & Force VAT** — M1 deal form, Property VAT badge + Force VAT toggle:
> Property VAT auto-computes per BIR RR 1-2024 (developer sales only). Threshold-rule types are exempt at or below ₱3,600,000 List Price; Lot / Commercial / Parking are always VAT-able. Force VAT? = Yes for the adjacent-property trap: 2+ adjacent units, same developer, same buyer, within 12 months, aggregating over the threshold — one deliberate toggle, no automation.

**P2 · VAT-inclusive billing + the Fixed-basis escape hatch** — M1 deal form, commission section *(replaces the workbook's Inclusive/Exclusive quick test — the VAT-basis option was removed 2026-07-17, M1 Rule D)*:
> On a VAT-registered account, the commission a developer bills already has the 12% VAT inside it — the engine divides by 1.12 to get your income. Megaworld example: 3% × TCP = 322,369.80 billed; ÷1.12 = 287,830.18 income. Rare case: if a payor ever bills your commission *plus* VAT as separate lines, enter **Basis = Fixed** with the VAT-inclusive total (commission 100,000 + VAT 12,000 → Fixed 112,000) — the engine books ₱100,000 income correctly.

**P3 · Agent Representation** — M1 deal form, representation picker (per-option help):
> Double Ended = you represent BOTH sides — full commission. Seller / Buyer = one side only (e.g., co-broke). Lessor / Lessee = rental sides. Referrer = you represent NEITHER side — you introduced the parties and earn a referral fee; reported on its own Yield-Summary line.

**P4 · Client/Counterparty & Rate %** — M1 deal form, client + rate fields:
> Client / Counterparty = the party you represent; Double Ended → the primary contact (the seller, or the actual unit buyer on a developer sale); Referrer → the party introduced. Rate % = the rate you actually earn, net of any co-broke split.

**P5 · What-to-Book doctrine** — M1 deal form, Referral Out section (paired with the edge-case-16 warning):
> Book only money that passes through your hands. **Splits at source** (the payer splits the commission before it reaches you — co-broke disbursed by the listing side, bank-accredited splits, escrow): enter Rate % as your net share only; do NOT use Referral Out — that money never touched your account. **Referral Out = outflows you disburse yourself** (referrer endorsements, balato, tip fees): you collect the full commission, THEN pay it out. Split-at-source does not occur in pre-selling (developers tag one agent per deal); it is a resale pattern.

**P6 · Collectible Corrections doctrine** — M4 receivable view, "?" + the FR-M10-13 mini-flow:
> Which tool to use when a deal's number changes: **1. Economics truly changed** (price amended, rate renegotiated before release, wrong base and the contract backs the developer) → edit the deal itself. Earned GCI, yield, and planning all reflect the new reality. **2. Earnings stand, expected cash differs and you accept it** (recomputed base you'll tolerate, part collected elsewhere, netting arrangement) → use Confirmed Collectible, ALWAYS with a Next Action note (e.g., "CLI advice 7/20: base excl. promo disc — confirmed 303,806"). The override is one opaque number; the note is its audit trail. **3. You're eating a shortfall you do NOT agree is correct** → touch nothing. Close the deal short and let Variance tell the story — this keeps short-paying developers visible in the %-collected stats instead of hiding the gap.

**P7 · Booked vs Collectible** — M4 receivable header:
> Booked NET GCI = earned after referral-outs; Total Collectible = full cash you expect in (you pay referrers separately — tracked on the Dashboard).

**P8 · Closed vs Cancelled** — M4 status-change dialog:
> Closed = the payor finished paying; the balance shuts and **Variance** shows short/over vs. collectible. Cancelled = the deal died; the uncollected balance is **written off**; cash already collected is kept.

**P9 · Balance basis & taxes** — M6 dashboard, Position + Cash & Tax sections:
> Balance is tracked on the Net-of-VAT basis (the same basis as booked GCI); Net Cash is shown separately to tie to the bank. Net Cash = Gross − EWT (bank). Retained = also net of the VAT you owe. EWT comes back as an income-tax credit (Form 2307).

**P10 · Mode of Payment** — M1 deal form, mode-of-payment field:
> For the collection-timing view: pre-selling Cash = current, under 1 year; Bank / Pagibig / Deferred Cash = long-term; resale and rental are all current.

**P11 · EWT 5% option** — wizard step 2 + M0 tax settings:
> EWT is creditable withholding (BIR Form 2307): the payor withholds it, you claim it back against income tax. Default 10% for individual brokers; 5% applies if gross receipts are ≤₱3M with a sworn declaration filed with the payor — change the rate here if that is you.

### 6.4 Empty states (registry; each names the filler action)
| Surface | Copy (essence) | Action |
|---|---|---|
| M1 Deals | "No deals yet — log your first closed deal, or import your v30.x workbook." | New deal · Import |
| M4 Receivables | "Receivables create themselves — one per deal, automatically. Log a deal and it appears here." | New deal |
| M5 Payments | No deals: "Payments attach to deals — log a deal first." Deals exist: "Log your first commission release; VAT and EWT split automatically." | New deal / New payment |
| M6 Dashboard | "Your position appears after your first deal; pace after your first payment." | New deal · Checklist card |
| M2 Yield | "Segments, blended yield and average price appear after your first Sale deal." | New deal |
| M3 Calculator | "Planning basis = your all-time realized yield and average price. Until you have deals, enter a manual Yield and Avg Price in the targets table — the calculator runs either way." | Open targets table · New deal |
| M7 Sources | "Deals carry a lead source; the scorecard builds from them. Add sources in Settings, then log deals." | Settings → Lead Sources · New deal |
| M8 Reports | "Reports aggregate payments. Log your first release and the periods fill in." | New payment |
| M9 Search | Fresh: "Nothing to search yet." Filtered-empty (verbatim from the sheet): "No matching records — adjust your filters above." | Clear filters |

### 6.5 In-app glossary (seed set; definitions final)
| Term | Definition |
|---|---|
| GCI | Gross Commission Income. Booked GCI is always stated **Net of VAT** — the 12% output VAT is stripped out because it is remitted to the BIR, not earned. |
| TCP / List Price | Total Contract Price of the property. Basis for volume and yield. |
| NET GCI | GCI + incentive (net) − referral out: what you actually earn. |
| Output VAT | 12% value-added tax on the commission, remitted to the BIR. |
| EWT | Expanded Withholding Tax, creditable — the payor withholds it; claimed back as an income-tax credit via BIR Form 2307. 10% default; 5% with sworn declaration (≤₱3M). |
| Form 2307 | BIR Certificate of Creditable Tax Withheld — the proof used to claim EWT back. |
| RR 1-2024 | BIR regulation setting the ₱3,600,000 dwelling VAT threshold used in property-VAT determination. |
| VAT-inclusive billing | On VAT-registered accounts, a taxable billed commission always carries the 12% VAT inside it; income = billed ÷ 1.12. Separate concept from property VAT. (The workbook's Inclusive/Exclusive option was removed from the product 2026-07-17.) |
| Comm Base | Per-developer setting: rate applies to Gross TCP or the Net (÷1.12) list price. Default Net. |
| Referrer vs Referral Out | Opposite directions: a **Referrer deal** is a fee you *receive* for introducing parties (own analytics line); **Referral Out** is a fee you *pay* someone else out of a commission you collected. |
| Confirmed Collectible | Per-receivable override of expected cash when it legitimately differs from booked GCI; requires a Next Action note (its audit trail). |
| Variance | On a Closed receivable: collected − collectible. Where accepted shortfalls/overpayments stay visible. |
| Chase flag | "⚠ chase" when a receivable has been idle ≥ the chase threshold (default 3 months). |
| Net Cash / Retained | Net Cash = Gross − EWT (what hits the bank). Retained = Gross − VAT − EWT (also net of the VAT owed). |
| Double Ended | Representing both sides of the transaction — full commission. |
| Adjacent-property rule | BIR rule behind Force VAT: adjacent units, same developer/buyer, 12 months, aggregating over the threshold → VAT-able even if each unit is under it. |

### 6.6 General
Wizard and all guidance usable at 360 px (rule 13). All copy PH-English; ₱ `#,##0.00`. Checklist card collapsible and dismissible; "SAMPLE" badge amber, banner persistent until cleanup.

## 7. Interactions with other modules

| Direction | Module | Mapping |
|---|---|---|
| orchestrates → | M0 | Step 1 workspace name; step 2 tax settings (read + edit via M0 APIs, M0 audit); step 3 seed lists via M0 create APIs. *(v2: team-invite orchestration returns here with M0 invitations.)* |
| orchestrates → | M1 | Step 4 embeds the FR-M1-10 importer (dry-run/commit/report); step 5 creates the sample deal via the standard deal API with `is_sample = true`; requires M1 to carry the `is_sample` field and the rule-5 delete exception. |
| orchestrates → | M4/M5 | Optional sample payment via M5 API; cleanup cascade deletes sample payments → receivable → deal (rule 5); FR-M10-13 mini-flow deep-links to M4's Confirmed Collectible + status actions. |
| provides → | M1–M9 | Legend spec + explainer, help-placement framework, empty-state registry content, glossary links. Modules own their surfaces; M10 owns the content and consistency requirement. |
| reads ← | M0/M1/M4/M5 events | `deal.created`, payment created, import completed → checklist derivation (§3.2). |
| reads | — nothing else | M10 performs **no financial reads or computations**; every figure shown in the walkthrough is an M1/M5 API response rendered as-is. |

## 8. Non-functional requirements

- **Wizard completable in < 10 minutes including a workbook import** (importer budget: 1,000-deal file < 2 min per M1 NFR); measured via FR-M10-18 events.
- **Help content maintainable without deploys:** content-bundle publish is independent of application releases; propagation to running clients < 5 min (cache TTL); rollback = republish prior version.
- Popover open < 100 ms (bundle cached client-side); wizard step transitions < 1 s.
- All copy PH-English; doctrine text verbatim (rule 12); no financial values stored in M10 entities or events.
- Wizard state is per-workspace (one user in v1), tenant-isolated per M0; v2's member orientation adds per-user state on the same foundation.
- Accessibility: popovers and coach-marks keyboard-navigable and screen-reader labeled; the legend never relies on color alone (lock icon / chip shapes carry the meaning).

## 9. Acceptance criteria (Given/When/Then)

1. **Full new-user script (import path).** **Given** a new user with the v30.20 workbook **When** they sign up → create workspace "Zeta Group" → wizard: confirm basics → review tax defaults (12% / 10% / ₱3,600,000 / 3 shown with P11 explainer) → accept the seed Property Types, skip seed Developers ("the importer will bring mine") → choose *Import your v30.x workbook* → dry-run shows 21 deals / 8 payments / 0 mismatches → commit → wizard offers to skip the walkthrough (data exists) → finish **Then** they land on the M6 dashboard matching the sheet: Total Collectible ₱6,763,497.25, Collected Net ₱1,908,192.86, Balance Outstanding ₱4,855,304.39, D021 showing Collected ₱44,642.86 / Balance ₱309,948.98 — and the checklist shows settings ✓ and importer ✓, with first deal / first payment ✓ (imported real records count). Elapsed time < 10 min.
2. **Fresh-start script (sample walkthrough).** **Given** a new workspace **When** the user picks *Start fresh* and does the typed-along walkthrough entering D021's inputs (Developer, Abrown Inc. = Net, House & Lot, List ₱8,000,000, 5% Inclusive, incentive ₱40,000 taxable) **Then** the computed panel — with coach-marks — shows NET GCI **₱354,591.84** (GCI ₱318,877.55 + incentive ₱35,714.29), VAT memo ₱42,551.02, EWT memo ₱35,459.18; **When** they log the optional sample release Gross ₱50,000 (Incentive) **Then** the split shows ₱44,642.86 / ₱5,357.14 / ₱4,464.29 / Net Cash ₱45,535.71 and the sample receivable shows Balance ₱309,948.98; **When** they click *Remove sample data* **Then** payment, receivable, and deal are gone in one transaction, no sample-flagged row remains anywhere, and dashboards read zero.
3. **Given** a wizard abandoned at step 3 **When** the owner logs in next day **Then** a non-modal "Continue setup (step 3 of 5)" prompt appears, prior selections intact, and the app was fully usable in between.
4. **Given** an importer failure at step 4 (corrupt file) **Then** the wizard stays on step 4 with the error report; retry with a good file succeeds; switching to "Start fresh" also works; steps 1–3 state untouched.
5. **Given** the checklist with 0 items done **When** any feature is used directly (deal form, exports, settings) **Then** nothing is gated; **and** logging the sample deal does NOT tick "first deal" (rule 10).
6. **Given** the commission section's "?" **When** opened **Then** the P2 VAT-inclusive-billing + escape-hatch text renders verbatim, with glossary links resolving.
7. **Given** the M4 mini-flow **When** the user answers "Did the contract/economics actually change? → No" and "Do you accept the different expected cash? → Yes" **Then** case 2 renders verbatim and deep-links to Confirmed Collectible, whose note field is required (M4 rule).
8. **Given** a status change to Cancelled on a partially-collected receivable **Then** the dialog shows P8 verbatim and states the write-off amount before confirm.
9. **Given** a content-bundle republish correcting a typo **Then** clients render the new copy within 5 min with no app deploy; version history shows both bundles.
10. **Given** each of M1–M9 with an empty workspace **Then** every §6.4 registry surface renders its empty state with a working action link (automated coverage test over the registry).
11. **Given** the wizard re-run from Settings after setup **Then** seed items already present are not re-offered, import history is shown, and no duplicate list items can result.
12. **Given** a 360 px viewport **Then** the full wizard including the typed-along walkthrough is completable (steps render as pages; popovers as bottom sheets).

## 10. Out of scope / future

- Video tutorials and third-party product-tour tooling (native coach-marks/popovers only in v1 — see Open Question 2); Tagalog/Taglish localization (Open Question 3); AI assistant/chat support; email onboarding drip campaigns; demo workspaces with full fake books (one sample deal only); per-field inline validation copy beyond what M1–M9 own; in-product changelog/release notes; workspace templates.
- M10 never computes, caches, or stores money figures; it never writes financial records except through M0/M1/M5's own APIs during the wizard/walkthrough.

## 11. Open questions

1. **Sample deal: auto-created or typed-along?** Recommendation (specced above): **typed-along guided entry** in the real form — the user learns the form, not a magic trick; auto-create remains a fallback ("Do it for me") for users who skip typing. Confirm with product owner.
2. **Native popovers/coach-marks vs a tour library** (e.g., driver.js-style): native keeps the content system unified and dependency-free; a library speeds up step-sequencing. Recommendation: native, since doctrine popovers must outlive any tour.
3. **Localized Tagalog/Taglish copy** — future? Content-bundle structure should reserve a locale key now even if v1 ships PH-English only.
4. **Should the checklist gate anything?** Recommendation: **never gates** (encoded as rule 9); ratify so no future feature ties itself to checklist state.
5. **Sample deal vs the permanent ID sequence:** consume the real sequence (first real deal becomes D002 after cleanup — harmless but asks a support question) or use a reserved out-of-sequence code (`SMPL-1`; keeps D001 for the first real deal but adds a code-format exception to M1 rule 1). Recommendation: reserved code; needs M1 sign-off.
6. **Member orientation — v2-deferred (no longer a v1 question).** Invited members do not exist in v1: there are no invitations and no non-owner logins (M0 §3.2). What orientation invited Agents/Admins should get — lightweight legend+glossary vs a read-only replay of the walkthrough — moves to the v2 brokerage/team edition; the help-open instrumentation built in v1 (FR-M10-18) will supply the data to decide it then. Number retained so the register's numbering stays stable.
