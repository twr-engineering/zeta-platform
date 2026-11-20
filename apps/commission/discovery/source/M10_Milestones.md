# M10 — Onboarding & In-App Guidance — Milestone Document

Baseline: solo full-stack dev, ideal dev-days. M10 owns **no financial logic** — every milestone consumes M0/M1/M4/M5 APIs and renders their responses; nothing here computes money.

## Sequencing note

Overall order: **M0 → M1 → M4+M5 → M6 → M2 → M3 → M7 → M8 → M9 → M10; M2/M3 parallel M6; M7 depends on M1, M4, M5.** M10 is deliberately **last** — it touches every surface (wizard, help placements, empty states across M1–M9), so those surfaces must exist first. **One exception, called out explicitly: the input-vs-computed legend component must NOT wait for M10.** Build the component early in M0 (M0.1 app shell established the blue-input/locked-computed affordances; M1.3 added formula tooltips) and adopt it in every module from M0/M1 onward; M10 owns the canonical spec, the "?" explainer content, and the cross-module consistency audit — not the component's first implementation. Within M10: content system first (everything else renders its articles), then the wizard, then the walkthrough/sample lifecycle, then the cross-module placement sweep, then hardening.

---

## Milestone M10.1 — Help-content system, legend spec & glossary (3–4 days)

**Objective:** the versioned content bundle, popover framework, glossary, and the canonical legend spec — the plumbing every other M10 feature renders through.

**Deliverables checklist**
- [ ] Content bundle format (HelpArticle + GlossaryEntry, semver, placements[]) + publish flow independent of app deploys; client cache + <5-min propagation; fallback rendering for missing articles
- [ ] Popover framework: "?" trigger, placement registry, glossary auto-linking, bottom-sheet mode at 360 px
- [ ] Glossary panel (search, deep links `/glossary#gci`) seeded with the §6.5 set
- [ ] Legend canonical spec doc + "?" legend explainer popover (verbatim sheet legend + three product affordances); consistency checklist item added to M1–M9 design review
- [ ] Seed bundle authored: P0–P11 doctrine articles, copy verbatim from PRD §6.3

**Tasks (≤1 day each):** bundle schema + loader/cache · publish/rollback flow · popover component + registry · glossary panel + auto-linking · legend explainer + spec doc · author + proof the P0–P11/glossary bundle.

**Definition of done:** republishing a bundle changes live copy with no deploy (AC 9); missing-article fallback proven; every P0–P11 article byte-matches PRD §6.3 (verbatim test); glossary links resolve from inside popovers.

**Demo script:** open the VAT Basis "?" (stub placement) → quick-test text renders verbatim with "Inclusive" glossary-linked; republish the bundle with a one-word edit → copy updates within 5 min, no deploy.

**Dependencies:** M0.1 (app shell, affordances). Content authoring can start any time.

## Milestone M10.2 — First-run wizard core, steps 1–4 (2–3 days)

**Objective:** resumable, never-blocking wizard: basics → tax review → seed lists → migration fork (embedded importer).

**Deliverables checklist**
- [ ] OnboardingState machine (persist per step, resume prompt, skip/dismiss, Owner-only, Settings → Setup assistant re-entry with no-duplicate seed offers)
- [ ] Step 1 basics + flow map; Step 2 tax review rendering M0 defaults with P11 explainer, edits via M0 APIs/audit
- [ ] Step 3 seed-lists offer (accept/edit/skip per item, via M0 create APIs only)
- [ ] Step 4 fork: embedded M1.4 importer (upload → dry-run report → commit) with failure recovery that preserves step state; "Start fresh" path
- [ ] Philosophy interstitial (P0 verbatim) before the fork; instrumentation events (step completed/skipped, wizard completed/dismissed)

**Tasks:** state machine + resume/dismiss · steps 1–2 UI · step 3 seed offer + dedupe on re-run · step 4 importer embed + error recovery · events + Settings re-entry.

**Definition of done:** AC 3 (abandon/resume), AC 4 (importer failure recovery), AC 11 (re-run, no duplicates) pass; a dismissed wizard leaves the app fully functional; import path completes on the real v30.20 file (21 deals / 8 payments / 0 mismatches).

**Demo script:** create a workspace → wizard opens → review tax defaults → accept seed property types → upload v30.20 → dry-run 21/8/0 → commit → finish → dashboard shows Collected Net ₱1,908,192.86. Then: new workspace, abandon at step 3, re-login → "Continue setup (step 3 of 5)".

**Dependencies:** M10.1; M0 complete; M1.4 importer (full run needs M4/M5 legs).

## Milestone M10.3 — First-deal walkthrough, sample lifecycle & checklist (3–4 days)

**Objective:** typed-along step 5 on the real M1 form with D021 as the offered sample, badged sample data with one-click no-orphan cleanup, and the event-driven getting-started checklist.

**Deliverables checklist**
- [ ] `is_sample` flag plumbed with M1 (field + rule-5 delete exception — coordinate the small M1 change); receivable/payments inherit the flag
- [ ] Typed-along walkthrough: coach-marks over the real M1 form explaining each computed-panel figure; D021 inputs offered; "Do it for me" fallback (pending OQ1 ratification)
- [ ] Optional sample payment leg (Gross ₱50,000 Incentive via M5) + receivable-balance coach-mark
- [ ] SAMPLE badges + persistent banner on M1/M4/M5/M6; one-transaction cleanup cascade (payments → receivable → deal), audit-logged, post-cleanup zero-sample verification
- [ ] ChecklistState: 4 event-driven items (sample-flagged records excluded), dismissible card, never gates

**Tasks:** M1 flag + delete-exception coordination · walkthrough coach-mark sequence · sample payment leg · badges/banner + cleanup cascade + verification · checklist events + card UI.

**Definition of done:** AC 2 end-to-end (₱354,591.84 panel; split ₱44,642.86/₱5,357.14/₱4,464.29/₱45,535.71; balance ₱309,948.98; cleanup leaves zero sample rows and zeroed dashboards); AC 5 (no gating; sample never ticks first-deal); integration test proves the cascade is one transaction (kill mid-way → nothing deleted).

**Demo script:** fresh workspace → walkthrough → type D021's inputs → panel shows **₱354,591.84** with coach-marks → log the ₱50,000 sample release → receivable balance ₱309,948.98 → *Remove sample data* → dashboard zeros; checklist still shows first deal unticked.

**Dependencies:** M10.2; M1.3 (form), M4/M5 shipped.

## Milestone M10.4 — Contextual help placements & empty states across modules (3–4 days)

**Objective:** every P0–P11 doctrine wired to its exact surface, the M4 corrections mini-flow, and the full empty-state registry.

**Deliverables checklist**
- [ ] Placements wired: P1/P2/P3/P4/P5/P10 on the M1 deal form; P6/P7 on M4; P8 in the status-change dialog; P9 on M6; P0 on M6 header; P11 on M0 tax settings
- [ ] Corrections mini-flow ("which case am I in?"): two-question router → verbatim case text → deep links (edit deal / Confirmed Collectible with required note / close short)
- [ ] Empty-state registry implemented for M1, M4, M5, M6, M2, M3 (planning-basis-or-manual-entry copy), M7, M8, M9 (incl. the sheet-verbatim "No matching records — adjust your filters above.")
- [ ] Legend consistency audit across M1–M9 against the M10.1 spec (log + fix or ticket deviations)
- [ ] help-opened instrumentation per placement

**Tasks:** deal-form placements · M4/M6/M0 placements + status dialog · mini-flow router + deep links · empty-state registry + per-module wiring · consistency audit · events.

**Definition of done:** AC 6, 7, 8, 10 pass; automated registry-coverage test fails the build if a module surface lacks its empty state; audit report shows zero unresolved legend deviations.

**Demo script:** open the VAT Basis "?" on the real deal form → P2 verbatim; on a receivable click "A number changed" → answer No/Yes → case 2 → deep link lands on Confirmed Collectible with the note required; open M3 empty → planning-basis explanation with manual-entry link.

**Dependencies:** M10.1; all of M1–M9 shipped (surfaces must exist).

## Milestone M10.5 — Mobile, end-to-end scripts & hardening (2–3 days)

**Objective:** 360-px wizard/walkthrough, the two scripted E2E journeys automated, timing NFR proven.

**Deliverables checklist**
- [ ] Mobile pass: wizard steps as pages, popovers as bottom sheets, walkthrough on M1's mobile stepped form
- [ ] Automated E2E: AC 1 (import journey, dashboard ties: ₱6,763,497.25 / ₱1,908,192.86 / ₱4,855,304.39) and AC 2 (fresh-start journey) in CI
- [ ] Timing instrumentation report proving the <10-min wizard NFR on the v30.20 file; accessibility pass (keyboard/screen-reader on popovers + coach-marks) *(member orientation for invited users is v2 — no invited members exist in v1)*

**Tasks:** mobile layouts · E2E import journey · E2E fresh-start journey · timing + a11y passes.

**Definition of done:** AC 1, 2, 12 green in CI; wizard-with-import measured < 10 min; a11y checks pass on all M10 components.

**Demo script:** on a 360-px viewport, run the full fresh-start journey to ₱354,591.84 and cleanup; show the CI run with both journeys green and the timing report.

**Dependencies:** M10.2–M10.4.

---

## Estimate summary

| Milestone | Ideal dev-days |
|---|---|
| M10.1 Content system, legend spec & glossary | 3–4 |
| M10.2 Wizard core (steps 1–4) | 2–3 |
| M10.3 Walkthrough, sample lifecycle & checklist | 3–4 |
| M10.4 Help placements & empty states | 3–4 |
| M10.5 Mobile, E2E & hardening | 2–3 |
| **Total** | **13–18** |

Assumptions: M0–M9 shipped (M10.1 can start once M0.1 exists; content authoring is deploy-independent); popovers/coach-marks native (OQ2), no tour library; content store = DB table or object storage already in the stack; the `is_sample` M1 change is small and coordinated, not a schema rework.

## Test plan

M10 computes no money, so its tests verify **orchestration, content fidelity, and lifecycle integrity** — with M1/M5's verified numbers used as end-to-end assertions:

1. **Content fidelity:** byte-exact match of P0–P11 rendered copy vs PRD §6.3 (doctrine-verbatim rule 12); glossary auto-link resolution; missing-article fallback; bundle republish visible < 5 min without deploy; rollback restores prior copy.
2. **Wizard state machine:** unit tests for every transition (skip, dismiss, resume, re-run); resume restores step + step_data; state is per-workspace and always the owner's (v1 has no other users); seed re-offer dedupe against existing M0 lists.
3. **Importer embedding:** failure at upload/dry-run/commit leaves wizard state intact (AC 4); success path asserts 21 deals / 8 payments / 0 mismatches on the v30.20 fixture and dashboard ties (Collected Net ₱1,908,192.86; D021 balance ₱309,948.98).
4. **Walkthrough fixtures (rendered, not computed):** panel shows NET GCI ₱354,591.84 (GCI ₱318,877.55 + ₱35,714.29), memos ₱42,551.02 / ₱35,459.18; sample payment split ₱44,642.86 / ₱5,357.14 / ₱4,464.29 / ₱45,535.71 — asserting M10 renders M1/M5 responses unaltered.
5. **Sample lifecycle:** cascade is one transaction (mid-failure deletes nothing); post-cleanup zero rows with `is_sample = true` in deals/receivables/payments; dashboards return exactly to pre-sample values; audit entry written; badges/banner appear iff sample exists.
6. **Checklist:** each of the 4 events ticks exactly its item; sample-flagged records never tick first_deal/first_payment; dismissal hides everywhere and is reversible; property test: no API in the product returns 403/disabled due to checklist state (never-gates invariant, rule 9).
7. **Empty-state registry:** coverage test enumerating every §6.4 surface — build fails on a missing key; each action link navigates correctly; M9's filtered-empty copy verbatim.
8. **Mini-flow routing:** 2×2 answer matrix → correct case text + deep link; case-2 link lands with the Next Action note required (M4 integration).
9. **Legend consistency:** snapshot audit across M1–M9 for the three affordances (input/computed/linked) + "?" explainer present on every table/form header.
10. **E2E journeys in CI:** AC 1 (sign up → wizard → import → dashboard ₱6,763,497.25 / ₱1,908,192.86 / ₱4,855,304.39, < 10 min) and AC 2 (fresh start → ₱354,591.84 → cleanup → zeros); mobile variant of AC 2 at 360 px.
