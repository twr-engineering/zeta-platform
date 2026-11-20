import type { YieldDeal } from "@/lib/yield";
// Extensionless on purpose: this is a non-test `.ts` file (Next type-checks it,
// unlike the `.test.ts` consumers), so a `.ts` value import would trip TS5097.
// The node --test alias hook resolves the extensionless path to fixtures.ts.
import { WORKBOOK_DEALS } from "@zeta/gci-engine/test-fixtures";

/**
 * The 21 workbook deals as M2 `YieldDeal` projections, derived from the SAME
 * engine fixtures the M1 suite proves to the centavo (WORKBOOK_DEALS). Reusing
 * them — rather than re-typing §9.0 by hand — makes M2.1's classifier fixtures
 * double as regression cover for M1's importer output (Milestones sequencing
 * note): if the engine's stored net_gci/incentive_net/referral_out ever drift,
 * these totals break too.
 *
 * All 21 are booked 2026 and non-archived, so the `All` and `2026` filters
 * coincide exactly, as the PRD fixtures assume (§3.3).
 */
export const YIELD_DEALS: YieldDeal[] = WORKBOOK_DEALS.map((f) => ({
  deal_code: f.id,
  transaction_type: f.input.transaction_type,
  deal_type: f.input.deal_type,
  representation: f.input.representation,
  // Volume uses the raw List Price (col M), not net_list_price (PRD §9.0 appendix).
  list_price: f.input.list_price,
  net_gci: f.expected.net_gci,
  incentive_net: f.expected.incentive_net,
  referral_out: f.expected.referral_out,
  booked_year: 2026,
  archived_at: null,
}));

/** Convenience: look one deal up by its code. */
export function deal(code: string): YieldDeal {
  const found = YIELD_DEALS.find((d) => d.deal_code === code);
  if (!found) throw new Error(`No workbook fixture ${code}`);
  return found;
}

/**
 * A synthetic Referrer deal (PRD Rule 2 / criterion 6): a Sale on a resale-type
 * property, list ₱5,000,000, untaxed fee ₱50,000 → net_gci 50,000. It must land
 * in Referral only and move NO sales number.
 */
export const REFERRER_DEAL: YieldDeal = {
  deal_code: "DR01",
  transaction_type: "sale",
  deal_type: "resale",
  representation: "referrer",
  list_price: "5000000.00",
  net_gci: "50000.00",
  incentive_net: "0.00",
  referral_out: "0.00",
  booked_year: 2026,
  archived_at: null,
};

/**
 * A synthetic legacy deal that broke M1's type coupling: Sale + deal_type N/A +
 * non-Referrer role. It classifies to none → the Rule 9 partition invariant fires.
 */
export const UNCLASSIFIED_DEAL: YieldDeal = {
  deal_code: "DX99",
  transaction_type: "sale",
  deal_type: "n/a",
  representation: "buyer",
  list_price: "1000000.00",
  net_gci: "50000.00",
  incentive_net: "0.00",
  referral_out: "0.00",
  booked_year: 2026,
  archived_at: null,
};
