import "server-only";

import { listPayments, getWorkspaceRates, type PaymentRow } from "./queries";
import { isStaleBasis } from "./stale";

// The pure counter lives in the pure stale-basis module (unit-tested there); it is
// re-exported here so M6 has one import for the whole payment Data Health surface.
export { countStaleBasisPayments } from "./stale";

/**
 * M5.4 — the payment-side Data Health feed for M6 (§7; M5 PRD §6/§7, FR-M5-12).
 *
 * The receivable side lives in src/lib/receivables/health.ts (checks b/c/d). This
 * is M5's contribution: the STALE-BASIS count — payments whose stored `*_used`
 * snapshot no longer matches the deal's current `vat_basis` + the workspace's
 * current `ewt_rate`/`vat_rate` (§3.3.3–4). Read-only, RLS-scoped, exposed for
 * M6.1 to assemble; nothing here renders UI.
 *
 * WHY IT IS A HEALTH SIGNAL, NOT AN ERROR. A stale-basis row is NOT wrong — a
 * payment split is a tax fact captured when the money moved, and a mid-year rate
 * change leaves old splits correct (§3.3.4). The count answers "how many rows were
 * captured under conditions that no longer hold, so the agent may want to review
 * (and opt into a per-payment recompute)?" — the dashboard surfaces the number and
 * links to the filtered list; it never triggers a recompute (that is always the
 * agent's explicit, per-payment choice on the edit screen — §3.3.3).
 *
 * WHY THE CURRENT RATES ARE READ UNCACHED. getWorkspaceRates() is a direct
 * RLS-scoped select (queries.ts), deliberately not the `unstable_cache` snapshot
 * the engine reads: a correctness signal must reflect the LIVE settings, or a
 * cached rate could report a wrong stale state for the life of the cache (m5_3).
 */

export type PaymentDataHealth = {
  /** The active payments whose stored basis no longer matches the deal + settings. */
  staleBasisPayments: PaymentRow[];
  counts: {
    staleBasis: number;
  };
};

/**
 * The stale-basis rows (active payments only) + their count, for M6's Data Health
 * section. Reads the payments list and the CURRENT (uncached) workspace rates the
 * same way /payments does, then applies the pure predicate — one code path with
 * the list's own ⚠ badge, so the dashboard count and the on-screen flags can never
 * disagree (m5_3 handoff: "the stale-basis count is exposed via isStaleBasis over
 * listPayments + getWorkspaceRates").
 */
export async function getPaymentDataHealth(): Promise<PaymentDataHealth> {
  const [payments, currentRates] = await Promise.all([
    listPayments(),
    getWorkspaceRates(),
  ]);

  const staleBasisPayments = payments.filter(
    (payment) =>
      payment.deal !== null &&
      isStaleBasis(payment, {
        vat_basis: payment.deal.vat_basis,
        ewt_rate: currentRates.ewt_rate,
        vat_rate: currentRates.vat_rate,
      })
  );

  return {
    staleBasisPayments,
    counts: { staleBasis: staleBasisPayments.length },
  };
}
