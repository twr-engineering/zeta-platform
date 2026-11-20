import Decimal from "decimal.js";

/**
 * Exact-decimal arithmetic for every money path (Master PRD §4.3).
 *
 * Rules this module enforces:
 *  - Binary floats are forbidden in money paths. Construct from strings; the DB
 *    returns `numeric` as a string and it must stay one until it reaches here.
 *  - Full precision is carried through intermediate steps; rounding to centavos
 *    happens only at persistence/display boundaries.
 *  - Comparisons the workbook makes with tolerance use ₱0.50, never float
 *    equality.
 *
 * A private constructor clone keeps this configuration from leaking into any
 * other Decimal user in the process.
 */
export const Money = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type MoneyValue = InstanceType<typeof Money>;

/** Accepted inputs. `number` is deliberately excluded — see `unsafeFromNumber`. */
export type DecimalInput = string | MoneyValue;

/** Centavo scale: all persisted money rounds to 2dp. */
export const CENTAVO_DP = 2;

/**
 * Data Health tolerance (Master PRD §4.3). The workbook compares certain totals
 * with slack; reproduce that with ₱0.50, never `===`.
 */
export const TOLERANCE_PHP = "0.50";

export function toMoney(value: DecimalInput): MoneyValue {
  return new Money(value);
}

/**
 * Escape hatch for values that provably originate as integers (counts, years,
 * sequence numbers). Never route a currency amount through this.
 */
export function unsafeFromNumber(value: number): MoneyValue {
  if (!Number.isInteger(value)) {
    throw new Error(
      `unsafeFromNumber rejects non-integers (got ${value}). Money must be constructed from a string.`
    );
  }
  return new Money(value);
}

export const ZERO: MoneyValue = new Money(0);

/** Round half-up to centavos. Call at persistence/display boundaries only. */
export function roundCentavos(value: DecimalInput): MoneyValue {
  return toMoney(value).toDecimalPlaces(CENTAVO_DP, Decimal.ROUND_HALF_UP);
}

/** Canonical DB representation: a fixed 2dp string for a `numeric(14,2)` column. */
export function toCentavoString(value: DecimalInput): string {
  return roundCentavos(value).toFixed(CENTAVO_DP);
}

export function sum(values: readonly DecimalInput[]): MoneyValue {
  return values.reduce<MoneyValue>((acc, v) => acc.plus(toMoney(v)), ZERO);
}

/** `true` when two amounts agree within ₱0.50 (Data Health comparisons). */
export function withinTolerance(
  a: DecimalInput,
  b: DecimalInput,
  tolerance: DecimalInput = TOLERANCE_PHP
): boolean {
  return toMoney(a).minus(toMoney(b)).abs().lessThanOrEqualTo(toMoney(tolerance));
}

/** Exact equality at centavo scale — for reconciliation that must tie to ₱0.01. */
export function equalsToCentavo(a: DecimalInput, b: DecimalInput): boolean {
  return roundCentavos(a).equals(roundCentavos(b));
}

/**
 * Parses user keyboard input ("1,234.56", "₱1,234.56", " 8000000 ") into a
 * Decimal. Returns null when the text is not a valid amount, so callers render a
 * validation state rather than a NaN.
 */
export function parseAmountInput(input: string): MoneyValue | null {
  const cleaned = input.replace(/[₱,\s]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  try {
    const value = new Money(cleaned);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

/**
 * Percent entry → decimal storage. The Tax Settings screen takes "12" and the
 * column holds 0.1200 (M0 §6).
 */
export function percentToRate(percent: DecimalInput): MoneyValue {
  return toMoney(percent).dividedBy(100);
}

/** Decimal storage → percent for display. 0.1200 → 12. */
export function rateToPercent(rate: DecimalInput): MoneyValue {
  return toMoney(rate).times(100);
}
