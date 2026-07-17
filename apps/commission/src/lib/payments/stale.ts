import { toMoney } from "@/lib/money";
import type { DealVatBasis } from "@/types/entities";

/**
 * Stale-basis detection (FR-M5-12, §3.3 / §6.4).
 *
 * A payment's split is a SNAPSHOT captured at save time from the deal's then-current
 * `vat_basis` and the workspace's then-current `vat_rate`/`ewt_rate` (§3.3.1). Deal
 * edits and settings changes deliberately do NOT rewrite stored splits (§3.3.3–4).
 * A row is "stale-basis" when its stored `*_used` anchors no longer match what the
 * deal + settings would produce TODAY — a purely informational signal that the split
 * was captured under different conditions, surfaced with an OPT-IN, per-payment
 * recompute (never bulk, never silent — §3.3.3).
 *
 * The comparison spans all three anchors the engine keys off:
 *   - `vat_basis_used`  vs the deal's current `vat_basis` (a deal correction, e.g.
 *     a receipt flag or VAT-registration change flipped inclusive ↔ n/a);
 *   - `ewt_rate_used`   vs the workspace's current `ewt_rate` (a mid-year rate change
 *     — §3.3.4: the old split is CORRECT history, but the row is still flagged so the
 *     agent can choose to recompute it if the change was a correction, not a real
 *     rate move);
 *   - `vat_rate_used`   vs the workspace's current `vat_rate`.
 *
 * Rates are compared as exact decimals (never floats, never centavo-rounded — a rate
 * carries 4 dp). This is a pure read-time predicate: it writes nothing and triggers
 * no recompute on its own.
 */

export type CurrentBasis = {
  vat_basis: DealVatBasis;
  ewt_rate: string;
  vat_rate: string;
};

/** The subset of a payment row this predicate reads — its stored snapshot anchors. */
export type StaleBasisAnchors = {
  vat_basis_used: DealVatBasis;
  ewt_rate_used: string;
  vat_rate_used: string;
};

export type StaleBasisReason = "vat_basis" | "ewt_rate" | "vat_rate";

/**
 * The anchors that differ from today's deal + settings, in a stable order. Empty
 * ⇒ the stored split still matches what a recompute would produce (not stale).
 */
export function staleBasisReasons(
  payment: StaleBasisAnchors,
  current: CurrentBasis
): StaleBasisReason[] {
  const reasons: StaleBasisReason[] = [];
  if (payment.vat_basis_used !== current.vat_basis) reasons.push("vat_basis");
  if (!toMoney(payment.ewt_rate_used).equals(toMoney(current.ewt_rate)))
    reasons.push("ewt_rate");
  if (!toMoney(payment.vat_rate_used).equals(toMoney(current.vat_rate)))
    reasons.push("vat_rate");
  return reasons;
}

/** True when the stored split no longer matches the current deal + settings. */
export function isStaleBasis(
  payment: StaleBasisAnchors,
  current: CurrentBasis
): boolean {
  return staleBasisReasons(payment, current).length > 0;
}

const VAT_BASIS_LABEL: Record<DealVatBasis, string> = {
  inclusive: "inclusive",
  n_a: "n/a",
};

/**
 * A one-line, human explanation of why a row is stale — for the ⚠ tooltip (§6.4).
 * Returns null when the row is not stale.
 */
export function staleBasisExplanation(
  payment: StaleBasisAnchors,
  current: CurrentBasis
): string | null {
  const reasons = staleBasisReasons(payment, current);
  if (reasons.length === 0) return null;

  const parts: string[] = [];
  if (reasons.includes("vat_basis")) {
    parts.push(
      `VAT basis '${VAT_BASIS_LABEL[payment.vat_basis_used]}' → now '${VAT_BASIS_LABEL[current.vat_basis]}'`
    );
  }
  if (reasons.includes("ewt_rate")) {
    parts.push(`EWT ${pct(payment.ewt_rate_used)} → now ${pct(current.ewt_rate)}`);
  }
  if (reasons.includes("vat_rate")) {
    parts.push(`VAT ${pct(payment.vat_rate_used)} → now ${pct(current.vat_rate)}`);
  }
  return `Split captured under ${parts.join(", ")}. Recompute from the payment's edit screen.`;
}

/** A rate string ("0.1000") as a compact percent ("10%") for the tooltip copy. */
function pct(rate: string): string {
  const value = toMoney(rate).times(100);
  return `${value.toDecimalPlaces(2).toString()}%`;
}
