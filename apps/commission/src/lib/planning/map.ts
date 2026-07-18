import type { PlanYearTarget } from "@/types/entities";
import type { PlanYearTargetInput } from "./engine";
import type { TargetTableRow } from "./economics";

/**
 * M3.2 — PURE mappers from the stored `plan_year_target` row to the two shapes its
 * consumers need. No I/O; unit-tested. Money/rate columns arrive as exact decimal
 * strings (PLAN_YEAR_TARGET_SELECT casts `::text`), so they pass straight through to
 * the engine — never a float, never re-parsed (Rule 7).
 */

/**
 * The full engine input for `computePlan` (M3.3/M3.4). Every field maps 1:1;
 * nulls carry the "use default / use all-time / not-plannable" state the engine
 * already understands (Rules P1/P5, rule 9).
 */
export function planYearTargetToInput(row: PlanYearTarget): PlanYearTargetInput {
  return {
    year: row.year,
    netIncomeTarget: row.net_income_target,
    opexPct: row.opex_pct,
    cosPct: row.cos_pct,
    yieldOverride: row.yield_override,
    avgPriceOverride: row.avg_price_override,
  };
}

/**
 * The M6 Section-2 feed row (FR-M3-11): just the three fields the derived working
 * GCI goal needs — NIT + opex/cos. Returns null when the year has no Net Income
 * Target (rule 9 — not plannable): the M6 target for that year is absent (shows "—"
 * unless a manual override is set), which is exactly what deriveAnnualTarget(null)
 * produces. A null opex/cos stays null → deriveAnnualTarget applies the 0.22/0.10
 * defaults (Rule P1), identical to the engine and the calculator.
 */
export function planYearTargetToTargetTableRow(
  row: PlanYearTarget
): TargetTableRow | null {
  if (row.net_income_target === null) return null;
  return {
    netIncomeTarget: row.net_income_target,
    opexPct: row.opex_pct,
    cosPct: row.cos_pct,
  };
}
