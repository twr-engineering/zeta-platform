# Input-vs-Computed Legend — Canonical Spec (M10.1)

> **Owner:** M10 (content + consistency). **Component:** M0 (`src/components/affordance/*`).
> **Source of truth:** M10 PRD §6.2, Master PRD §4.4. This document is the canonical
> spec the M1–M9 design review checks against (FR-M10-10, rule 14).

The workbook's *Start Here* legend, verbatim:

> **Only blue cells editable. Blue = input, Black = formula, Green = linked from another tab.**

Every money surface in the SaaS carries that meaning through **three affordances**. The
legend never relies on colour alone — a lock icon and a link glyph carry the meaning for
colour-blind and screen-reader users (Master PRD accessibility; M10 PRD §8).

## The three affordances

| Sheet | Product | Component | Behaviour |
|---|---|---|---|
| Blue = input | **Input** | `<InputField>` / `<SelectField affordance="input">` (`src/components/affordance/input-field.tsx`, `select-field.tsx`) | Editable by the account owner — the only way money *enters* the system. Blue tint + focus ring. |
| Black = formula | **Computed** | `<LockedValue variant="locked">` (`src/components/affordance/locked-value.tsx`) | Never directly editable. Read-only, lock icon, and the formula named on hover/focus (e.g. `GCI = billed ÷ 1.12`). |
| Green = linked | **Linked** | `<LockedValue variant="linked">` | A value sourced from another module. Link glyph; clicking navigates to the source. |

## The "?" explainer

Every table/form header carries a **legend "?"** that opens the explainer popover:
`<LegendExplainer>` (`src/components/help/legend-explainer.tsx`), which renders the
`legend` help article (verbatim legend line + the three affordances). The content is a
single seeded article (`legend.explainer` placement), so the explainer copy is identical
on every surface. Keyboard-accessible and screen-reader labeled (Base UI popover + an
`aria-label` on the trigger).

- M10.1 wires the explainer onto its **reference surface** (the Deals list header).
- **M10.4** sweeps it onto every remaining M1–M9 table/form header and runs the
  consistency audit below.

## Cross-module consistency checklist (rule 14 — M1–M9 design review)

For every module surface that shows money or rates, a reviewer confirms:

- [ ] Editable money/rate fields use `<InputField>` / `<SelectField affordance="input">` — never a bare `<input>`/`<select>` on a money surface.
- [ ] Computed figures use `<LockedValue variant="locked">` with a `formula` tooltip — never plain text and never an editable control.
- [ ] Cross-module values use `<LockedValue variant="linked">` and navigate to their source on click.
- [ ] The affordance is carried by icon/shape, not colour alone (lock / link glyph present).
- [ ] Every table/form header exposes the legend `<LegendExplainer>` "?".
- [ ] Right-aligned, `tabular-nums` money so decimals line up.

Deviations are logged in the M10.4 legend-consistency audit and either fixed or ticketed;
the M10.4 Definition of Done requires **zero unresolved deviations**.

## M10.4 legend-consistency audit — outcome (2026-07-19)

Walked every M1–M9 money surface against the checklist above. Result: **zero
unresolved deviations.**

| Checklist item | Finding |
|---|---|
| Editable money/rate fields use `<InputField>` / `<SelectField>` | ✅ No bare `<input>`/`<select>` on any money surface (only `type="hidden"` payload mirrors on the deal form). |
| Computed figures use `<LockedValue variant="locked">` + formula tooltip | ✅ Deal computed-panel, receivable detail, dashboard tiles, yield/source tables all locked with formulas. |
| Cross-module values use `<LockedValue variant="linked">` and navigate to source | ✅ M3 planning basis links back to M2 (`planning-basis-card.tsx`); M5 deal fields shown on payment rows. |
| Affordance carried by icon/shape, not colour alone | ✅ Lock/link glyphs on `LockedValue`; blue-input tint paired with focus ring + border. |
| Every table/form header exposes the legend `<LegendExplainer>` "?" | ⚠️→✅ **Deviation found and FIXED.** M10.1 wired the explainer only on Deals (M1) + Glossary. M10.4 swept it onto Yield (M2), Calculator (M3), Collectibles (M4), Payments (M5), Dashboard (M6), Source Performance (M7), Reports (M8, per-tab header), and Search (M9). |
| Right-aligned, `tabular-nums` money | ✅ `InputField`/`LockedValue`/`StatTile` and every money table (`receivables-ledger`, `payments-list`, `search-results`, `source-performance-table`, `segment-table`) use `tabular-nums`. |

**One deviation total** (the missing legend "?" on M2–M9 headers), fixed in this
milestone by the cross-module sweep. No deviations ticketed / carried forward.
