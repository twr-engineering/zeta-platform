import { toMoney, type DecimalInput, type MoneyValue } from "@/lib/money";

/**
 * M3 economic-model primitives (PRD Rules P1–P4) — the SINGLE source of the
 * `net-income % → raw GCI target → working goal` derivation.
 *
 * M6 shipped before M3 and needed the same `ROUNDUP(NIT ÷ (1 − opex − cos), −4)`
 * formula for its Section-2 target line, so `deriveAnnualTarget` and `roundUp10k`
 * first landed in `@/lib/dashboard/target`. Now that the planning engine exists,
 * that formula is single-sourced HERE and `dashboard/target` re-exports it
 * (FR-M3-11: "exposed as an API so M6 never re-implements it"). The engine's
 * `computePlan` and M6's feed therefore compute the working goal through the exact
 * same code — they can never drift apart.
 *
 * MONEY DISCIPLINE. Every peso figure is a full-precision decimal carried until the
 * display boundary (Master PRD §4.3 / Rule P7). Only `roundUp10k` and the string
 * outputs round; the intermediate `netIncomePct`/`gciRawTarget` stay unrounded so
 * the working goal and downstream fees/deals chain at full precision.
 */

/** M3's documented defaults when the TargetTable leaves opex/cos blank (Rule P1). */
export const DEFAULT_OPEX_PCT = "0.22";
export const DEFAULT_COS_PCT = "0.10";

/** The per-year planning inputs M3's TargetTable row supplies to the M6 feed (Rule P1). */
export type TargetTableRow = {
  /** Net Income Target for the year (decimal string). */
  netIncomeTarget: string;
  /** Operating-expense fraction, e.g. "0.22"; blank/null defaults to 0.22 (Rule P1). */
  opexPct: string | null;
  /** Cost-of-sales fraction, e.g. "0.10"; blank/null defaults to 0.10 (Rule P1). */
  cosPct: string | null;
};

/**
 * ROUNDUP_10K(x) = ⌈x ÷ 10,000⌉ × 10,000 — always rounds UP to the next ₱10,000,
 * so an exact multiple is unchanged (16,920,000 → 16,920,000) but any remainder
 * rounds up (16,911,764.71 → 16,920,000, never 16,910,000). The workbook's
 * ROUNDUP(x, −4). Returns a centavo-exact decimal string (Rule P4).
 *
 * The ONE implementation of the ceil-to-₱10,000 rule across M3 (planning) and M6
 * (dashboard target — which re-exports this).
 */
export function roundUp10k(value: DecimalInput): string {
  return toMoney(value).dividedBy(10000).ceil().times(10000).toFixed(2);
}

/** Effective opex fraction: the row value if set, else the 0.22 default (Rule P1). */
export function effectiveOpex(opexPct: string | null): MoneyValue {
  return toMoney(opexPct ?? DEFAULT_OPEX_PCT);
}

/** Effective cos fraction: the row value if set, else the 0.10 default (Rule P1). */
export function effectiveCos(cosPct: string | null): MoneyValue {
  return toMoney(cosPct ?? DEFAULT_COS_PCT);
}

/**
 * Net Income % = 1 − opex_eff − cos_eff (Rule P2), full precision. Must be `> 0` to
 * be a valid year; the caller (computePlan / deriveAnnualTarget) guards that before
 * dividing by it — a non-positive value is a validation state, never a divide-by-zero.
 */
export function netIncomePct(opexEff: DecimalInput, cosEff: DecimalInput): MoneyValue {
  return toMoney("1").minus(toMoney(opexEff)).minus(toMoney(cosEff));
}

/**
 * The derived annual/working GCI goal from a TargetTable row (Rules P1–P4):
 *   ROUNDUP_10K( net_income_target ÷ (1 − opex_eff − cos_eff) ).
 * Returns null when there is no row (rule 9 — target "—", no division error) or the
 * net-income denominator is not positive (a degenerate row can't yield a target).
 * NOT override-aware — M6's getAnnualTarget layers the manual override on top.
 */
export function deriveAnnualTarget(row: TargetTableRow | null): string | null {
  if (row === null) return null;
  const pct = netIncomePct(effectiveOpex(row.opexPct), effectiveCos(row.cosPct));
  if (pct.lessThanOrEqualTo(0)) return null;
  return roundUp10k(toMoney(row.netIncomeTarget).dividedBy(pct));
}
