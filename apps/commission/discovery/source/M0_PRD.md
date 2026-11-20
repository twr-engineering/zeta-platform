# M0 — Account Foundation & Settings — PRD

**Product:** ZETA GCI + Collections (working name) · **Module:** M0 of M0–M10 · **Source of truth:** ZETA_GCI_Calculator__Collections_v30.20.xlsx, *Settings* sheet · **Audience:** developers with no real-estate or PH-tax background — every rule is spelled out; nothing is "see the spreadsheet."

> **v1 positioning (product decision, 2026-07-17):** this is a micro SaaS for **individual Philippine real estate agents who self-log their own commissions**. One workspace = one agent. There are no teams, roles, invitations, or shared access in v1 — the brokerage/team edition is the next version. The data model is deliberately **team-ready** (a membership table exists with exactly one owner row) so the v2 upgrade is a feature release, not a migration.

---

## 1. Module overview

M0 is the foundation every other module stands on: authentication, the agent's personal workspace, and the four configuration lists that drive every dropdown and every tax computation in the product — Tax Settings, Property Types (with VAT rules), Developers (with commission base), and Lead Sources.

**Spreadsheet behavior it replaces.** In the workbook, the *Settings* tab holds four editable blocks: tax settings (VAT rate 12%, EWT rate 10%, VAT threshold ₱3,600,000, chase idle threshold 3 months), a Property Types table (type → VAT Rule), a Developers table (developer → Comm Base), and a Lead Sources list (up to 50 rows, blanks ignored). The Deal Log, Payments Log, VAT engine, and every dropdown read these values live via named ranges (`VATRate`, `EWTRate`, `PropertyTypeList`, `DeveloperList`, `ChaseIdleMonths`). One file = one user's book of business.

**What improves in SaaS form.**

1. One personal workspace per agent (multi-tenant: many agents, each fully isolated), instead of a copied file per agent with drifting versions.
2. Settings become versioned, validated records with referential integrity — deleting a Property Type that deals reference is impossible in the sheet without silently breaking VAT computation (the sheet falls back to Always-VAT and flags it in Data Health); in the SaaS it is prevented outright via soft-delete/deactivation.
3. Changes to tax settings are auditable (when the agent switched EWT from 10% to 5%, and what recomputed).
4. The account works on any device — the sheet's protection model ("only blue cells editable") becomes a real input-vs-computed contract.

## 2. Users & jobs-to-be-done

v1 has **one human user per workspace**: the individual agent. They wear every hat the workbook's team divided up.

| User | Jobs in this module |
|---|---|
| **Agent (account owner)** | Sign up; set tax rates matching their BIR registration (VAT-registered or not; 10% vs 5% EWT with sworn declaration); onboard the developers they sell for with the correct Comm Base; maintain their own Lead Sources and Property Types; import their existing v30.x workbook. |
| *(v2, out of scope)* | Brokerage/team roles — Owner/Rainmaker, Admin, Agent, Read-only — invitations, shared dashboards. Architecture notes below keep the door open. |

## 3. Data model

All monetary/percentage values stored as exact decimals (never floats). All entities carry `workspace_id`, `created_at`, `updated_at` (plus `created_by`/`updated_by`, which in v1 always resolve to the owner — kept for v2 compatibility and audit uniformity). Soft delete via `archived_at`.

### 3.1 Workspace (the tenant = one agent's book of business)
| Field | Type | Req | Editable | Validation / Default | Notes |
|---|---|---|---|---|---|
| id | uuid | ✔ | computed | | Tenant key on every table. |
| name | string(120) | ✔ | owner | non-empty; default = agent's display name | e.g., "JD's Book" — shown in the app header. |
| currency | enum | ✔ | no (v1) | fixed `PHP` | ₱ formatting everywhere; field exists for future. |
| deal_id_sequence | integer | ✔ | computed | starts 0 | Backs permanent deal IDs (M1); increments only, never reused. |

### 3.2 User & Membership (team-ready, single-row in v1)
| Field | Type | Req | Editable | Validation / Default |
|---|---|---|---|---|
| user.id, email, name, password/auth identity | | ✔ | self | standard auth (email+password with verification; Google OAuth recommended — agents live in Gmail) |
| membership.workspace_id + user_id | fk pair | ✔ | computed | unique together; **v1 invariant: exactly one membership per workspace, role `owner`** |
| membership.role | enum | ✔ | computed (v1) | fixed `owner` in v1; enum reserved for v2 (`owner`/`admin`/`agent`/`readonly`) |

**v1 permission model:** the owner can do everything in their workspace; there is nothing to gate between humans. What replaces role-gating is **friction-gating**: destructive or money-restating actions (editing a deal that has payments, closing/cancelling a receivable, changing tax rates, deleting anything) require explicit typed/checked confirmations and always write audit entries. Every module's "requires Owner/Admin" language from the team workbook maps to "requires confirmation" in v1.

**v2 door-openers (build now, cheap):** membership as a table (not a column on user); `created_by` on financial rows; role enum reserved. Do **not** build invitation flows, role UIs, or permission middleware in v1.

### 3.3 TaxSettings (exactly one active row per workspace)
| Field | Type | Req | Editable | Validation | Default | Sheet source |
|---|---|---|---|---|---|---|
| vat_rate | decimal(6,4) | ✔ | owner | 0 < r < 1 | 0.1200 | Settings C6 "Output VAT on commission (BIR standard 12%)" |
| vat_registered | boolean | ✔ | owner | — | asked at onboarding (no silent default) | **NEW (product decision 2026-07-17, resolves OQ2):** drives the engine mode. `true` → commission-VAT machinery active (÷1.12 on receipted deals, VAT memos; EWT defaults 0.10). `false` → commission-VAT off entirely (no ÷1.12, VAT memos = 0); EWT still applies on taxable deals and defaults 0.05 (sworn-declaration rate). Changing the flag = a rule-3 recompute event. (The Inclusive/Exclusive VAT-basis option itself was removed product-wide 2026-07-17 — see M1 Rule D.) |
| ewt_rate | decimal(6,4) | ✔ | owner | 0 ≤ r < 1 | 0.1000 if vat_registered else 0.0500 | Settings C7 "10% individual broker; 5% if ≤₱3M sworn declaration." The flag sets the DEFAULT only — the rate stays editable (a non-VAT agent without the sworn declaration is withheld 10%). |
| property_vat_threshold | decimal(14,2) | ✔ | owner | > 0 | 3,600,000.00 | Settings C8 "BIR RR 1-2024 dwelling threshold" |
| chase_idle_months | integer | ✔ | owner | ≥ 1 | 3 | Settings C9; drives "⚠ chase" flag (M6) |

The 5% EWT option matters disproportionately here: **solo agents grossing ≤₱3M/year with a sworn declaration are exactly this product's early users** — the onboarding copy (M10) must surface it, and the M10 tax step asks the `vat_registered` question in plain language ("Are you VAT-registered with the BIR?" with a one-line explainer of what changes). Note the legal coupling for the copy: VAT registration is mandatory above ₱3M gross/year, which is also the sworn-declaration boundary — so the flag and the EWT default move together in practice.

Derivations that consume these (owned by M1/M5, listed for traceability): `Net List Price = List Price ÷ (1 + vat_rate)` when Property VAT = VAT-able; `GCI = billed ÷ (1 + vat_rate)` for Inclusive; `EWT = Net × ewt_rate`. Worked ₱ example at defaults: List ₱8,000,000 → Net List = 8,000,000 ÷ 1.12 = **₱7,142,857.14** (fixture D021).

### 3.4 PropertyType
| Field | Type | Req | Editable | Validation | Notes |
|---|---|---|---|---|---|
| name | string(80) | ✔ | owner | unique per workspace (case-insensitive) | |
| vat_rule | enum | ✔ | owner | `threshold` \| `always_vat` \| `always_exempt` | Sheet: "Threshold = exempt if List price ≤ VAT threshold, else VAT-able. Always VAT / Always Exempt ignore price." |
| archived_at | timestamp | | owner | | Archived types leave dropdowns, keep history. |

Seed set offered at onboarding and used by the importer (user-editable, NOT hard-coded): House & Lot=threshold, Condo=threshold, Townhouse=threshold, Condotel=threshold, Lot=always_vat, Commercial=always_vat, Parking=always_vat ("parking is treated as commercial").

### 3.5 Developer
| Field | Type | Req | Editable | Validation | Notes |
|---|---|---|---|---|---|
| name | string(120) | ✔ | owner | unique per workspace (case-insensitive) | |
| comm_base | enum | ✔ | owner | `gross` \| `net` | Default `net`. Sheet: "Gross (rate applies to gross TCP, e.g. Megaworld) or Net (net-of-VAT price). Default Net." |
| archived_at | timestamp | | owner | | |

Workbook seed examples (importer/demo data only — never product defaults): Megaworld GERI=gross; CLI, Abrown Inc., Pueblo de Oro, Weecomm=net.

### 3.6 LeadSource
| Field | Type | Req | Editable | Validation |
|---|---|---|---|---|
| name | string(80) | ✔ | owner | unique per workspace (case-insensitive) |
| archived_at | timestamp | | owner | |
| sort_order | integer | | owner | manual ordering of dropdown |

Workbook seed examples (13): Referral, Repeat Client, Sphere / Personal Network, Open House, Sign Call / Walk-in, Facebook Organic, Facebook Ads, TikTok, YouTube, Instagram, LinkedIn, Website, Lamudi. The sheet caps at 50 sources; the SaaS needs no hard cap but M7's report should stay legible — soft-warn beyond 50.

### 3.7 AuditLogEntry (cross-cutting, defined here)
`id, workspace_id, actor_user_id, entity_type, entity_id, action (create|update|archive|restore|delete_blocked), field_changes (jsonb: old→new), occurred_at`. Written for every change to TaxSettings, PropertyType, Developer, LeadSource — and consumed by M1/M4/M5 for financial edits. In v1 the actor is always the owner; the log's value is *what changed when* (self-audit, support, and BIR-defensibility), and it becomes the multi-user trail in v2 for free.

## 4. Business rules & edge cases

1. **Tenant isolation is absolute.** Every query is scoped by `workspace_id`; no cross-workspace reads. One user account = one workspace in v1 (creation flow makes exactly one; a second workspace is a v2/edge concern — blocked with a friendly message).
2. **Rates are workspace settings, not constants** (prompt edge case 14). EWT 5% (sworn-declaration) must be a two-click change. Changing a rate affects computations per rule 3.
3. **Setting changes and recomputation.** Booked figures on existing deals were computed with the rates in force; a settings change triggers recomputation of *derived* fields on deals (M1 owns mechanics) **behind an explicit confirmation** that states how many deals will change, and writes an audit entry. Historical *payment* rows keep their stored splits (statements of what was actually withheld); only a deliberate per-payment edit recomputes them. (Sheet behavior: everything recomputes live, silently — the SaaS makes it deliberate.)
4. **VAT threshold boundary:** strictly "above threshold ⇒ VAT-able." List Price = ₱3,600,000.00 exactly ⇒ **exempt** (prompt edge case 1; M1 enforces, M0 stores the threshold).
5. **Archive, don't delete, referenced list items.** A PropertyType/Developer/LeadSource referenced by ≥1 deal can only be archived; hard delete only when reference count = 0. The sheet's silent fallbacks (missing property type → Always-VAT; missing developer → Comm Base Net, surfaced in Dashboard Data Health) are replaced by prevention and must **never** be reproduced silently.
6. **Rename propagates.** Renaming a list item updates every referencing deal's display (store FK ids, not strings). Covers prompt edge case 18: a renamed/archived Lead Source must never orphan deals in Source Performance — archived sources appear as "(inactive)" buckets in M7.
7. **Uniqueness is case-insensitive, trimmed.** "megaworld geri " duplicates "Megaworld GERI".
8. **Comm Base changes on a Developer** recompute that developer's deals (with rule-3 confirmation), mirroring the sheet's live lookup.
9. **Friction-gating replaces role-gating (v1).** Every action the team workbook implicitly reserved for the principal — rate changes, deal edits after payments, close/cancel, deletes — carries an explicit confirmation and audit entry. No permission middleware in v1.
10. **Chase idle threshold ≥ 1 month**, integer; drives M6's chase flag: `⚠ chase when months idle ≥ chase_idle_months`.
11. **Workspace creation seeds nothing silently.** The first-run wizard (M10) *offers* the seed lists; the agent can accept, edit, or skip. Importer (M1) creates list items found in the workbook.
12. **All settings edits are audit-logged** with old→new values.
13. **`vat_registered` drives engine mode product-wide** (decision 2026-07-17): M1 Rules D/E/F/I branch on it; M5 payment splits branch on it (Rule P5); M8's Output-VAT columns are structurally zero on non-VAT workspaces (the reports still render — EWT and net-cash columns carry the story). Flipping the flag is a rule-3 confirmed-recompute event and is expected to be rare (an agent crossing ₱3M and registering).
14. **₱3M watchline (future/M6 candidate):** when a non-VAT workspace's rolling-12-month gross commission approaches ₱3,000,000, surface a data-health notice ("you may be required to register for VAT; your EWT rate will change") — listed in §10 as a fast-follow, not v1.

## 5. Functional requirements

- **FR-M0-01** Users can sign up (email+password with verification; Google OAuth recommended), sign in, reset password; sessions expire; server enforces auth on every API route.
- **FR-M0-02** Sign-up creates the user's personal workspace automatically (name defaulted, editable); `deal_id_sequence` initialized to 0; membership row created with role `owner`.
- **FR-M0-03** Owner can view and edit the four tax settings with validation (ranges in §3.3); every change writes an audit entry and, where derived values change, triggers the rule-3 confirmation + recompute flow.
- **FR-M0-04** Owner can CRUD Property Types with a `vat_rule` per row; archive when referenced; hard delete only when unreferenced.
- **FR-M0-05** Owner can CRUD Developers with `comm_base` per row; same archive semantics; changing `comm_base` triggers rule-8 recompute confirmation.
- **FR-M0-06** Owner can CRUD Lead Sources incl. manual sort order; same archive semantics.
- **FR-M0-07** All four lists expose a read API used by M1's deal form dropdowns (active items only) and by M7 (active + archived).
- **FR-M0-08** Every settings/list mutation appears in a per-workspace audit log view (filter by entity, date).
- **FR-M0-09** Each list table supports CSV/XLSX export.
- **FR-M0-10** Account deletion: full workspace export offered first; deletion is a hard, typed-confirmation action (solo users own their data outright).
- *(Deferred to v2 — explicitly NOT built now: invitations, member management, role matrix middleware, workspace switching.)*

## 6. UI/UX requirements

- **Settings area** with left-nav sections: General (workspace name, account), Tax Settings, Property Types, Developers, Lead Sources, Audit Log.
- **Tax Settings screen:** four labeled inputs with the sheet's explanatory captions preserved (EWT: "10% individual broker; 5% option if ≤₱3M gross with sworn declaration" — with a plain-language explainer aimed at solo agents); rates entered as percentages (12%) but stored as decimals; ₱ #,##0.00 formatting; Save disabled until valid; confirmation modal when a change affects existing deals ("This will recompute N deals — booked GCI figures will change. Continue?").
- **List screens (3):** table with inline add row (mirrors "add a row to onboard a developer"), inline rename, archive toggle, reference count column ("used by 12 deals"), archived items collapsed under a toggle, drag sort for Lead Sources. Empty states explain what the list drives ("Lead Sources feed the Source dropdown on every deal and the Source Performance report").
- **Input-vs-computed convention (product-wide, established here):** editable fields use the "blue" input affordance; computed/locked values render read-only with a subtle lock icon and tooltip naming the formula — the SaaS equivalent of the sheet's Blue = input / Black = formula / Green = linked legend (M10 documents the legend).
- **Mobile:** all settings screens usable at 360 px; tables collapse to cards. Solo agents run this product from their phone — mobile is not a nice-to-have anywhere in the package.
- **₱ formatting** everywhere: `₱ 3,600,000.00`.

## 7. Interactions with other modules

| Direction | Module | Fields |
|---|---|---|
| provides → | M1 | vat_rate, ewt_rate, property_vat_threshold; PropertyType.vat_rule; Developer.comm_base; LeadSource list; deal_id_sequence |
| provides → | M4/M6 | chase_idle_months; Developer list (receivables grouping) |
| provides → | M5 | vat_rate, ewt_rate (payment splits) |
| provides → | M7 | LeadSource list incl. archived ("(inactive)" bucket) |
| provides → | all | auth/session, audit log, workspace scoping, ₱ formatting locale, friction-gate confirmation pattern |
| receives ← | M1 importer | list items discovered in a v30.x workbook (created via M0 APIs) |
| receives ← | M10 | first-run wizard writes initial settings/lists via M0 APIs |

## 8. Non-functional requirements

- Settings reads are hot-path (every deal computation) — serve from cache ≤ 5 ms in-region; invalidate on write.
- Workspaces with ≥1,000 deals and ≥1,000 payments: settings/list screens interactive < 1 s; list mutations < 300 ms server time.
- Audit log entries immutable (append-only), retained for the life of the workspace.
- All money/percentage persistence in exact decimal types (prompt edge case 15 groundwork).
- Auth hardening appropriate for financial data (rate limiting, session invalidation on password change).

## 9. Acceptance criteria (Given/When/Then)

1. **Given** a new sign-up **When** the account is created **Then** a personal workspace exists with tax defaults VAT 12%, EWT 10%, threshold ₱3,600,000.00, chase idle 3 months; a single `owner` membership row; and empty lists until seeded/imported.
2. **Given** default settings **When** M1 computes fixture D021 (Abrown Inc. `net` base, House & Lot `threshold`, List ₱8,000,000) **Then** Net List = ₱7,142,857.14 and NET GCI = **₱354,591.84** — proving M0 supplies rates/rules correctly (full derivation in M1 §9).
3. **Given** EWT changed to 5% **When** a new payment of Gross ₱50,000 (Inclusive) is logged in M5 **Then** EWT = 44,642.86 × 0.05 = **₱2,232.14** (not ₱4,464.29), and an audit entry `ewt_rate 0.10→0.05` exists.
4. **Given** Property Type "Condo" is referenced by deals **When** delete is attempted **Then** it is blocked with the reference count and Archive is offered; **When** archived **Then** it disappears from the M1 dropdown but existing deals still display and compute as Condo/threshold.
5. **Given** Developer "Megaworld GERI" comm_base `gross` **When** changed to `net` **Then** a confirmation lists affected deals; on confirm, D009-equivalent deals recompute and audit entries are written per deal.
6. **Given** a Lead Source rename "YouTube" → "YouTube Organic" **When** saved **Then** all deals show the new name and M7 aggregates them under one row (no orphan bucket).
7. **Given** threshold = ₱3,600,000 **When** a `threshold`-rule deal is entered at exactly ₱3,600,000 **Then** M1 computes Property VAT = Exempt (edge case 1).
8. **Given** any list table **When** the user clicks Export **Then** a CSV/XLSX downloads matching the on-screen rows.
9. **Given** two separate agent accounts **When** either queries any API **Then** no data from the other workspace is ever returned (isolation integration test).
10. **Given** a tax-rate change confirmation **When** the user cancels **Then** nothing recomputes and no audit entry is written.

## 10. Out of scope / future

- **v2 — Brokerage/Team edition (the defined next version, not speculative):** multi-member workspaces; Owner/Rainmaker, Admin, Agent, Read-only roles with server-side permission middleware; invitations; per-agent deal attribution and team dashboards; workspace switching. The v1 schema decisions in §3.2 exist to make this a feature release.
- Billing/subscription management; SSO/SAML; custom roles; localization beyond PHP/₱; API keys for third parties; automated BIR e-filing; per-deal EWT overrides (see Open Questions).
- No automation of the adjacent-property VAT aggregation (Force VAT stays a per-deal toggle in M1).

## 11. Open questions

1. **Recompute policy on rate change** (rule 3): confirm historical payments keep stored splits while booked deal figures recompute on confirmation — or should rate changes be effective-dated (apply only to deals booked after the change)? Sheet recomputes everything live, which is almost certainly *not* wanted once multi-year data exists.
2. **Non-VAT-registered agents — ✅ RESOLVED (product owner, 2026-07-17): v1 supports both.** Implemented as the `vat_registered` TaxSettings flag (§3.3) + rules 13–14; engine branches in M1 Rules D/E/F/I (fixture N1) and M5 Rule P5. EWT default follows the flag (10% / 5%), rate stays editable. Percentage-tax computation/filing for non-VAT agents remains out of scope (§10) — the product tracks commission economics, not tax returns.
3. Should EWT support per-deal override (e.g., one corporate payor withholding at a different rate) or stay workspace-global as in the sheet? Sheet: global only.
4. Lead-source soft cap at 50 (sheet limit) — keep as a warning only?
5. Sheet discrepancy (cosmetic): Start Here claims the VAT threshold lives on Yield Summary; v30.20 keeps it on Settings. Confirm Settings is the single home (assumed yes).
6. **v2 upgrade contract:** when teams arrive, does an existing solo workspace convert into a team workspace (owner invites members into their book) or join a new team workspace (data merge)? Doesn't block v1 code, but the answer validates the §3.2 schema bet.
