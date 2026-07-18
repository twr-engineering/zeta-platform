/**
 * M2 — Yield Summary & Realized Analytics — the pure aggregation core (M2.1).
 *
 * A read model over M1 deals: one segment classifier (the single source of
 * membership truth), the five-segment report, and the all-time planning basis
 * that feeds the M3 GCI Calculator. No persistence, no UI — those are M2.2/M2.4.
 * Decimal end-to-end (never a binary float); full precision to M3, display
 * precision on screen ratios (see aggregate.ts money discipline).
 */
export {
  classifySegment,
  isSalesSegment,
  unclassifiedDealCodes,
  type ClassifiableDeal,
  type Segment,
  type YieldDeal,
} from "./segments";
export {
  buildPlanningBasis,
  buildYieldReport,
  type PlanningBasis,
  type ReportRowKey,
  type SegmentRow,
  type YearFilter,
  type YieldSummaryReport,
} from "./aggregate";
