import { toMoney, unsafeFromNumber, ZERO, type MoneyValue } from "@/lib/money";
import type { CivilDate } from "@/lib/date/manila";

/**
 * M6 §2 target derivation + the day-accurate pace line — PURE, clock-injectable.
 *
 * Two independent pieces the Collected-vs-Target section (and Monthly's cumulative
 * target) are built on:
 *
 *   1. The ANNUAL GCI TARGET (§3.3 row 1 / rule 8):
 *        override.amount  if an AnnualTargetOverride exists for the year, else
 *        ROUNDUP_10K( net_income_target ÷ (1 − opex% − cos%) )  from M3's per-year
 *        TargetTable row, else  null  (→ "—", no error; rule 9).
 *
 *   2. The PACE to date (§3.3 row 4 / rule 10):
 *        MIN(1, MAX(0, (today − Jan 1 of the year + 1) ÷ days_in_year)) × target
 *      with a leap-year denominator (366) and an Asia/Manila civil "today".
 *
 * M3 SEQUENCING (Milestones "manual-override-only first"). M3's Targets module
 * lands AFTER M6 in the build order, so its TargetTable does not exist yet. The
 * derivation is written now as a pure function of a TargetTableRow SHAPE
 * (deriveAnnualTarget), and the M6 server layer feeds it `null` until M3.2 wires
 * the real per-year row in. See [[m6_1Handoff]]: the ONLY change M3.2 makes here is
 * supplying a non-null TargetTableRow to getAnnualTarget's loader — the math,
 * rounding, and pace are already correct and unit-pinned against the v30.20 goal.
 *
 * MONEY DISCIPLINE. Every peso figure is a decimal string carried at full
 * precision and rounded to centavos once at the boundary (Master PRD §4.3). Day
 * counts and years are exact integers (never money), so they use plain arithmetic.
 */

/** The per-year planning inputs M3's TargetTable row will supply (§3.3 rule 8). */
export type TargetTableRow = {
  /** Net Income Target for the year (decimal string). */
  netIncomeTarget: string;
  /** Operating-expense fraction, e.g. "0.22"; blank/null defaults to 0.22 (M3). */
  opexPct: string | null;
  /** Cost-of-sales fraction, e.g. "0.10"; blank/null defaults to 0.10 (M3). */
  cosPct: string | null;
};

/** M3's documented defaults when the TargetTable leaves opex/cos blank (rule 8). */
const DEFAULT_OPEX = "0.22";
const DEFAULT_COS = "0.10";

/**
 * ROUNDUP_10K(x) = ⌈x ÷ 10,000⌉ × 10,000 — always rounds UP to the next ₱10,000,
 * so an exact multiple is unchanged (16,920,000 → 16,920,000) but any remainder
 * rounds up (16,911,764.71 → 16,920,000, never 16,910,000). The workbook's
 * ROUNDUP(x, −4). Returns a centavo-exact decimal string.
 */
export function roundUp10k(value: string | MoneyValue): string {
  return toMoney(value).dividedBy(10000).ceil().times(10000).toFixed(2);
}

/**
 * The derived annual target from a TargetTable row:
 *   ROUNDUP_10K( net_income_target ÷ (1 − opex − cos) ).
 * Returns null when there is no row (rule 9 — target "—", no division error) or the
 * net-income denominator is not positive (a degenerate table row can't yield a
 * target). NOT override-aware — getAnnualTarget layers the override on top.
 */
export function deriveAnnualTarget(row: TargetTableRow | null): string | null {
  if (row === null) return null;
  const opex = toMoney(row.opexPct ?? DEFAULT_OPEX);
  const cos = toMoney(row.cosPct ?? DEFAULT_COS);
  const netIncomePct = toMoney("1").minus(opex).minus(cos);
  if (netIncomePct.lessThanOrEqualTo(0)) return null;
  const raw = toMoney(row.netIncomeTarget).dividedBy(netIncomePct);
  return roundUp10k(raw);
}

/**
 * The annual GCI target for the year: the override amount if one is set, else the
 * TargetTable derivation, else null ("—"). This is the single resolver every M6
 * section reads — Section 2's tile, its pace, and Monthly's cumulative target.
 */
export function getAnnualTarget(
  overrideAmount: string | null,
  tableRow: TargetTableRow | null
): string | null {
  if (overrideAmount !== null) return overrideAmount;
  return deriveAnnualTarget(tableRow);
}

// --- pace (day-accurate, Asia/Manila, leap-aware) ---------------------------

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 366 in a leap year, else 365 (rule 10). */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function splitCivil(value: CivilDate): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

/**
 * The 1-based ordinal day of `today` within `year`: Jan 1 → 1, Dec 31 → 365/366.
 * When `today` falls in a later calendar year the ordinal exceeds days_in_year
 * (the pace fraction then clamps to 1 — a fully past dashboard year); in an earlier
 * year it is ≤ 0 (clamps to 0 — a future year). Computed on UTC-midnight civil
 * dates, so it is an exact integer day count independent of any clock/zone (Manila
 * has no DST); `today` is already the Manila civil date the caller resolved.
 */
export function ordinalDayInYear(year: number, today: CivilDate): number {
  const [ty, tm, td] = splitCivil(today);
  const jan1 = Date.UTC(year, 0, 1);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((todayUtc - jan1) / 86_400_000) + 1;
}

/** The clamped [0,1] fraction of the year elapsed by `today` (pure, exact decimal). */
export function paceFraction(year: number, today: CivilDate): MoneyValue {
  const ordinal = ordinalDayInYear(year, today);
  // ordinal and days-in-year are exact integers (day counts, never money).
  const fraction = unsafeFromNumber(ordinal).dividedBy(daysInYear(year));
  if (fraction.lessThan(0)) return ZERO;
  if (fraction.greaterThan(1)) return toMoney("1");
  return fraction;
}

/**
 * Pace to date = clamp(0,1, (today − Jan 1 + 1) ÷ days_in_year) × target, a
 * centavo-exact decimal string. Returns null when the target is null (§ rule 9 —
 * the vs-pace line is suppressed, not zeroed).
 */
export function dayAccuratePace(
  target: string | null,
  year: number,
  today: CivilDate
): string | null {
  if (target === null) return null;
  return paceFraction(year, today).times(toMoney(target)).toFixed(2);
}
