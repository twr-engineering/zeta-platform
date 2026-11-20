# Engine rounding policy

> Source of truth: Master PRD §4.3 + M1 PRD §8. This document is enforced by the
> engine (`src/lib/engine/`) and proven by the fixture suite
> (`tests/unit/engine/`). If you change how the engine rounds, change this file
> and the tripwire test together.

## The one rule

**Full precision through every intermediate step; round half-up to centavos
(2 dp) ONLY at the output boundary.**

- Money enters the engine as exact decimal **strings** (the DB returns `numeric`
  as a string) and is constructed with `decimal.js` — never a binary float, ever
  (`number`/`parseFloat` are forbidden in money paths, Master PRD §4.3).
- All arithmetic — `÷(1+vat)`, `× rate`, the NET GCI sum, the memo bases — runs
  at 28 significant digits and is **never** rounded mid-chain.
- The only rounding is the final `toCentavoString()` on each output field, which
  is `ROUND_HALF_UP` to 2 dp. Rates (`yield_on_list`) round to 6 dp — the
  precision the 4-decimal percentage display needs — at the same boundary.

## Why mid-chain rounding is forbidden

Rounding an intermediate figure to centavos and then continuing introduces
centavo drift on `÷1.12` chains, because two independently-rounded halves can
each round the same direction while their exact sum rounds the other way.

### The tripwire (proven in `tests/unit/engine/rounding.test.ts`)

A taxable, VAT-inclusive deal with **billed commission ₱100.00** and a
**taxable incentive of ₱100.00**:

| quantity | exact value | centavo output |
|---|---|---|
| GCI = 100 ÷ 1.12 | 89.285714285… | **89.29** |
| Incentive (net) = 100 ÷ 1.12 | 89.285714285… | **89.29** |
| NET GCI = GCI + incentive (exact sum) | 178.571428571… | **178.57** ✅ |

- **Correct** (round once, at the boundary): `178.571428… → 178.57`.
- **Wrong** (round each half first, then add): `89.29 + 89.29 = 178.58`.

The engine returns **178.57**. A naive per-step implementation returns **178.58**
— a visible one-centavo error. The fixture asserts the engine's answer *and*
demonstrates the forbidden path produces the wrong one, so a regression that
reintroduces intermediate rounding fails loudly.

## Consequences elsewhere

- **NET GCI** (Rule H) sums full-precision GCI, incentive-net and referral-out,
  then rounds once. The referral-out *output* field is rounded, but the value
  subtracted inside NET GCI is the full-precision one.
- **Tax memos** (Rule I) multiply the full-precision `GCI + taxable incentive`
  by the rate, then round — this is why D021's VAT memo is `354,591.8367… × 0.12
  = 42,551.02`, not `354,591.84 × 0.12`.
- **Yield** (Rule J) divides full-precision NET GCI by list price and rounds the
  rate to 6 dp.
- **Payment split** (WORKBOOK §4) keeps `K`, `L`, `M`, `N`, `Retained` at full
  precision and rounds each once: `N = H − M` uses the full-precision `M`.

## Tolerances (comparisons, not computation)

- **Reconciliation** against the workbook's cached values ties to **₱0.01**
  (`equalsToCentavo`) — the importer reports any row that disagrees rather than
  importing it (FR-M1-10).
- **Data Health** comparisons (M6) use the **₱0.50** tolerance
  (`withinTolerance`), never float equality.

Both helpers live in `@/lib/money`; the engine itself performs no tolerant
comparisons — it only produces exact centavo strings.
