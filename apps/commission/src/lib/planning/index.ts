/**
 * M3 — GCI Calculator & Goal Planning — the pure planning engine (M3.1).
 *
 * `computePlan` implements Rules P1–P13: a net-income target → economic model →
 * goal rows → seller/buyer funnels → sales pace. No persistence, no UI, no clock;
 * decimal end-to-end (never a binary float), full precision to the display boundary
 * (Rule 7), impossible inputs returned as typed issues (Rule 1) — never thrown.
 *
 * The `net-income % → raw target → working goal` derivation and `roundUp10k` are
 * single-sourced in ./economics; `@/lib/dashboard/target` re-exports them so M6's
 * Section-2 target feed (FR-M3-11) shares the exact same math.
 */
export {
  computePlan,
  DEFAULT_FUNNEL_RATES,
  MONTHS_PER_YEAR,
  WEEKS_PER_YEAR,
  type Assumptions,
  type EconomicModel,
  type Funnel,
  type FunnelRates,
  type FunnelStage,
  type GoalRow,
  type Pace,
  type Plan,
  type PlanIssue,
  type PlanIssueCode,
  type PlanResult,
  type PlanYearTargetInput,
  type PlanYtdAggregate,
} from "./engine";
export {
  deriveAnnualTarget,
  DEFAULT_COS_PCT,
  DEFAULT_OPEX_PCT,
  effectiveCos,
  effectiveOpex,
  netIncomePct,
  roundUp10k,
  type TargetTableRow,
} from "./economics";
export {
  planYearTargetToInput,
  planYearTargetToTargetTableRow,
} from "./map";
export {
  assumptionSourceLabel,
  funnelRatePercentLabel,
  ratePercentInputValue,
} from "./display";
export {
  planToRows,
  CALCULATOR_PLAN_COLUMNS,
  type PlanExportRow,
} from "./export-rows";
