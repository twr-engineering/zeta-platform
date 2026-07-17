# Brand Guidelines — ZETA GCI + Collections

The handoff package contains **no brand mandate** (no colors, typography, or logo). Use the template's default Tailwind v4 + Shadcn UI styling with these product-driven conventions from the source PRDs:

- **Input-vs-computed affordance is mandatory product-wide** (Master PRD §4.4): editable inputs get a distinct "blue input" treatment; computed values are visibly locked with formula tooltips. This is the workbook's Blue = input / Black = formula / Green = linked legend translated to the web (legend component specced in M0/M10 — see `discovery/source/M0_PRD.md` and `M10_PRD.md`).
- **Currency:** `₱ #,##0.00` everywhere; percentages to 2 dp (4 dp for yields).
- **Mobile-first surfaces:** M5 payment fast-entry and M6 chase list must be excellent at 360 px.
