# Brand Guidelines — ZETA GCI + Collections

**Deep green + gold — a premium money instrument for Philippine real-estate agents.**
The design pass (2026-07-19) replaced the stock Shadcn look with an intentional
identity: a dark-emerald primary, warm-gold emphasis, warm-paper neutrals, and a
serif/gothic type pairing that gives money the gravity of a prestige ledger. The
system is token-driven — almost the whole app re-skins through the CSS custom
properties in `src/app/globals.css` — so honour the tokens before reaching for a
one-off colour.

> The app renders **light mode only** (no theme toggle ships). `.dark` tokens are
> kept brand-cohesive in case a toggle is ever mounted, but light is the target;
> style it well.

## Typography

Self-hosted via `next/font/google` (zero layout shift, no runtime request). The
`--font-sans` / `--font-heading` / `--font-mono` variables are mapped into the
Tailwind theme in `globals.css`; feed them in `src/app/layout.tsx`.

| Role | Face | Where | Why |
|---|---|---|---|
| **Display** | **Fraunces** (optical serif) | `h1–h3`, card/section titles (`font-heading`), hero money figures (`.font-numeric`) | Passbooks, land titles and notarized documents — the Filipino register of *money that is real* — are set in serif. It carries gravity a UI sans can't. The one deliberate risk of the system. |
| **Body / UI** | **Libre Franklin** (grotesque) | everything else (`--font-sans`, applied on `html`) | A Franklin-Gothic revival: institutional, superbly legible at 360 px, and its **tabular figures** are what let ₱ columns align digit-to-digit. |
| **Mono** | **Geist Mono** | `--font-mono` (IDs, code) | Unchanged; low-prominence. |

**Tabular numerals are mandatory on every ₱ / number column.** The affordance
primitives (`InputField align="end"`, `LockedValue`, `StatTile`) and every money
table already carry `tabular-nums`; the `.font-numeric` helper adds lining +
tabular figures for large serif money (hero totals) so they still column-align.

Headings use a gentle `-0.011em` tracking (a serif wants less negative tracking
than the old sans did). Never set gold as heading colour on a light surface (see
below).

## Colour — semantic roles

Tokens are OKLCH in `globals.css`. Neutrals carry a faint green cast (chroma
~0.006–0.02 at hue ~155) so the surface reads as one warm ledger, not grey chrome
beside green buttons. **All pairings below pass WCAG AA** — verify any re-tune with
`node scripts/check-contrast.mjs`.

| Role | Token | Value (light) | Use |
|---|---|---|---|
| **Primary** | `--primary` | `oklch(0.37 0.072 162)` dark emerald | Buttons, active nav, the wordmark, links (`text-primary`), sidebar-primary. The money/prosperity brand colour. |
| Primary fg | `--primary-foreground` | warm cream | Text/icons on primary. |
| **Gold (accent)** | `--gold` | `oklch(0.79 0.125 89)` | **Brand emphasis only, never a state** — see "Gold vs amber". |
| Gold muted / border | `--gold-muted` / `--gold-border` | pale gold / hairline | Gold fills (with `--gold-foreground` deep-green text) and rules. |
| **Positive** | emerald utilities (`text-emerald-700`) | — | Gains, "on pace", collected. Related to the brand green by design. |
| **Warning** | amber utilities (`amber-*`) | hue ~65 | Stale basis, chase flags, caution banners. |
| **Destructive** | `--destructive` | red (hue ~27) | Delete, write-off, errors. |
| Surface: background | `--background` | warm paper `oklch(0.985 0.006 145)` | The page ground. |
| Surface: card / popover | `--card` | white | Cards lift above the paper ground. |
| Muted / secondary / accent | `--muted` / `--secondary` / `--accent` | green-grey tints | Quiet fills, hovers, menu washes. `--accent` is the neutral hover wash — **not** the gold accent. |
| Ring | `--ring` | emerald | Focus rings (visibility preserved from M10.5). |
| Charts | `--chart-1…5` | emerald / gold / teal / deep-green / warm-neutral | Data visuals stay in the family. |

### Gold vs amber — the deliberate distinction

Gold and warning-amber are both warm, so they are separated **by hue and by job**:

- **Gold** sits at **hue ~89** (yellow-warm, slightly desaturated — a metal). It is
  a **brand accent, never a state**: the wordmark mark, the active-nav bar, the
  dashboard section-number badges (where a real 1→8 sequence lives). It carries no
  meaning about good/bad — it just says "this is ours."
- **Amber** sits at **hue ~65** (more orange, higher chroma) and **always means
  caution** — stale basis, chase flags, warning banners. It is applied via Tailwind
  `amber-*` utilities at the component level and was left untouched by the pass.

Because the hues are ~24° apart and their jobs never overlap, a gold badge and an
amber warning never read as the same thing.

### Gold on light is decorative-only

Gold text on a light surface is ~1.9:1 — **fails AA, so never do it.** Gold-as-text
is legible only on the emerald primary (5.2:1 ✓). On light surfaces gold appears as
a **fill** (with deep-green `--gold-foreground`, 7.1:1 ✓) or as a **graphic element**
(hairline, ring, the section-badge with an emerald numeral on pale-gold, 8.7:1 ✓) —
never as running text. `scripts/check-contrast.mjs` encodes this rule.

## Input-vs-computed affordance (product law — Master PRD §4.4, unchanged)

The workbook's legend — **"Blue = input, Black = formula, Green = linked"** — is
mandatory product-wide and **survives the green/gold theme intact**:

- **Blue = input** (`InputField` / `SelectField affordance="input"`, `--affordance-input*`):
  editable cells keep a **refined azure** treatment (hue ~248) — tuned to sit against
  the emerald theme but kept unmistakably **blue**, so the legend's "Blue = input"
  stays literally true. Blue is still the only saturated blue on a money surface.
- **Black = formula** (`LockedValue variant="locked"`): computed, read-only, lock
  icon, formula-on-hover. Neutral green-grey fill.
- **Green = linked** (`LockedValue variant="linked"`): a value from another module;
  link glyph, navigates to source. A clear medium green, kept distinct from the
  darker brand emerald so "linked" still reads as its own affordance.

The affordance is always carried by **icon/shape, not colour alone** (lock / link
glyph), and money is right-aligned `tabular-nums`. See `docs/LEGEND-SPEC.md`.

## Signature & polish

- **The wordmark** — a Fraunces "Z" monogram on emerald with a gold hairline ring.
- **Active-nav gold bar** — a thin gold rule marks the current section ("you are
  here"), the accent used once per screen.
- **Dashboard section badges** — the workbook's own 1→8 numbers as small gold-ringed
  badges with emerald numerals: the brand accent placed exactly where a real
  sequence lives (structure encoding information, not decoration).
- **Money as protagonist** — hero figures and section totals in the Fraunces serif;
  dense tables stay in the Libre Franklin body sans for perfect column alignment.

Cards keep a soft ring + white surface above the warm ground; focus states use the
emerald ring; 360 px stays first-class everywhere.

## Currency & precision (unchanged)

- **Currency:** `₱ #,##0.00` everywhere; percentages to 2 dp (4 dp for yields).
- **Mobile-first surfaces:** M5 payment fast-entry and M6 chase list must be
  excellent at 360 px.
