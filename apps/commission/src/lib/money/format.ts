import {
  CENTAVO_DP,
  rateToPercent,
  roundCentavos,
  toMoney,
  type DecimalInput,
} from "./decimal";

/**
 * Display formatting. `₱ #,##0.00` everywhere; percentages to 2dp, 4dp for
 * yields (Master PRD §4.2, design/brand-guidelines.md).
 *
 * Formatting is grouping-only — the value is rounded by decimal.js first, so
 * Intl never sees a binary float carrying a money amount.
 */

const GROUPER = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: CENTAVO_DP,
  maximumFractionDigits: CENTAVO_DP,
  useGrouping: true,
});

export const PESO_SIGN = "₱";

/** `₱ 3,600,000.00` — the product-wide money format. */
export function formatPHP(value: DecimalInput): string {
  return `${PESO_SIGN} ${formatAmount(value)}`;
}

/** `3,600,000.00` — grouped digits with no currency sign, for table columns. */
export function formatAmount(value: DecimalInput): string {
  const rounded = roundCentavos(value);
  const [whole, fraction] = rounded.abs().toFixed(CENTAVO_DP).split(".");
  const grouped = GROUPER.format(BigInt(whole)).split(".")[0];
  const sign = rounded.isNegative() ? "-" : "";
  return `${sign}${grouped}.${fraction}`;
}

/**
 * A stored rate (0.1200) as a percentage string (`12.00%`). `dp` is 2 by
 * default; yields render at 4 (Master PRD §4.2).
 */
export function formatRateAsPercent(rate: DecimalInput, dp: number = 2): string {
  return formatPercent(rateToPercent(rate), dp);
}

/** A percentage value (12) as `12.00%`. Pass `dp: 4` for yields. */
export function formatPercent(percent: DecimalInput, dp: number = 2): string {
  return `${toMoney(percent).toFixed(dp)}%`;
}

/** Yield convenience wrapper — 4dp, per the workbook's finer yield columns. */
export function formatYield(rate: DecimalInput): string {
  return formatRateAsPercent(rate, 4);
}
