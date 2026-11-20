import { toCentavoString } from "@/lib/money";
import type { DealDerived } from "./types";

/**
 * M4 Rule K — the two money anchors of a receivable, co-located with the deal
 * engine so the whole product has ONE source of money truth (FR-M1-05, M4
 * Milestones M4.1).
 *
 *   K.1  booked_net_gci            = deal.net_gci          (earned, after referral-outs)
 *   K.2  default_total_collectible = gci_net_of_vat + incentive_net
 *                                    (= net_gci + referral_out; the payor sends the
 *                                     full commission in, referrers are paid separately)
 *        total_collectible         = confirmed_collectible  if the agent set one
 *                                  = default_total_collectible  otherwise
 *
 * `default_total_collectible` itself is produced by `computeDeal` (that is the only
 * place the un-rounded gci/incentive live — rounding the summed 2-dp displays would
 * drift a centavo on D013). These helpers are the thin, exact remainder of Rule K:
 * the mirror (K.1) and the override precedence (K.2). They operate on already-exact
 * centavo strings, so no further rounding is introduced — `total_collectible` is a
 * choice between two stored figures, never new arithmetic. The database stores it as
 * a generated column with the identical CASE; this is the reference implementation
 * for any read-model that computes it in TypeScript.
 */

/** Rule K.1 — the booked (earned) anchor is exactly the deal's NET GCI. */
export function bookedNetGci(derived: Pick<DealDerived, "net_gci">): string {
  return derived.net_gci;
}

/** Rule K.2 default anchor, straight off the engine output (already exact). */
export function defaultTotalCollectible(
  derived: Pick<DealDerived, "default_total_collectible">
): string {
  return derived.default_total_collectible;
}

/**
 * Rule K.2 precedence — the confirmed override wins when set, otherwise the
 * default. `confirmedCollectible` is null when the agent has entered no override.
 * Values are normalised to the canonical 2-dp string so "875000" and "875000.00"
 * are the same figure (no arithmetic, just a scale normalise).
 */
export function totalCollectible(
  confirmedCollectible: string | null,
  defaultCollectible: string
): string {
  return toCentavoString(confirmedCollectible ?? defaultCollectible);
}
