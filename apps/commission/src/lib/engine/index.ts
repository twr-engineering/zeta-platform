/**
 * M1.1 — Calculation engine library.
 *
 * The single source of money truth for the whole product (FR-M1-05): deals
 * (Rules A–J), payment splits (WORKBOOK §4, reused by M5), and the pure
 * soft-warning predicates. Everything downstream — M4 receivables, M5 payments,
 * M6 dashboards, M2/M3/M7/M8 analytics — reads these outputs and never
 * re-implements the arithmetic.
 *
 * Rounding policy: full precision through every intermediate step; round
 * half-up to centavos ONLY at the output boundary. See ./ROUNDING.md.
 */
export { computeDeal } from "./deal";
export { computePaymentSplit } from "./payment-split";
export { isSplitAtSourceRisk } from "./warnings";
export {
  bookedNetGci,
  defaultTotalCollectible,
  totalCollectible,
} from "./receivable";
export type {
  CommBase,
  CommBaseDisplay,
  CommissionInput,
  DealComputeInput,
  DealDerived,
  DealType,
  EngineSettings,
  IncentiveTaxable,
  PaymentSplit,
  PaymentSplitInput,
  PaymentType,
  PropertyVat,
  PropertyVatRule,
  Representation,
  TransactionType,
  VatBasis,
} from "./types";
