import { TAX_FIELD_LABELS, type TaxField } from "./tax";

/**
 * A bulk recompute's progress (FR-M1-07), the shape the runner returns and the
 * banner renders. Pure so both a server action and a client component can share
 * it without dragging server-only code into the browser bundle.
 */
export type RecomputeStatus = "pending" | "running" | "completed" | "failed";

export type RecomputeProgress = {
  jobId: string;
  status: RecomputeStatus;
  total: number;
  processed: number;
  restated: number;
  done: boolean;
};

/**
 * The honest affected-deal count for a set of tax fields being changed, given
 * the two server-computed counts.
 *
 *   - a vat_rate / ewt_rate / vat_registered change restates every taxable deal
 *     (`rate`);
 *   - a property_vat_threshold change restates threshold-rule developer deals
 *     (`threshold`), which are a SUBSET of the taxable deals — a developer deal
 *     is always taxable — so when both change the rate count already covers the
 *     union, and there is no double-count to add.
 */
export function taxRestatingCount(
  restating: readonly TaxField[],
  counts: { rate: number; threshold: number }
): number {
  if (
    restating.some(
      (field) => field === "vat_rate" || field === "ewt_rate" || field === "vat_registered"
    )
  ) {
    return counts.rate;
  }
  if (restating.includes("property_vat_threshold")) return counts.threshold;
  return 0;
}

/**
 * The recompute-confirmation contract (M0 rule 3) — M0.2's half.
 *
 * Pure: this module states the contract and writes the copy. The reads live in
 * `./recompute-queries` (server-only) so the confirmation modal — a client
 * component — can import the copy without dragging `next/headers` into the
 * browser bundle.
 *
 * THE PROBLEM RULE 3 DESCRIBES
 *
 * Booked figures on existing deals were computed with the rates in force when
 * they were booked. Change a rate and those figures are now stale, and the
 * spreadsheet's answer — recompute everything, live, silently — is exactly what
 * the SaaS must not do. So a rate change:
 *
 *   1. states its consequence and waits for an explicit confirmation (rule 9),
 *   2. writes an audit entry (rule 12),
 *   3. recomputes the *derived* fields on existing deals — and M1 owns that.
 *
 * Historical payment rows are NOT recomputed (rule 3): a payment row states what
 * was actually withheld on a given date. Only a deliberate per-payment edit
 * touches it. M5 owns that distinction.
 *
 * WHY THIS IS A QUEUE AND NOT A FUNCTION CALL
 *
 * M1 does not exist yet, and a settings change today must not be lost because
 * of that. `settings_change_event` is a durable backlog: the row is written in
 * the SAME TRANSACTION as the settings update (see `update_tax_settings`), so a
 * confirmed change either lands with its event or does not land at all. A
 * cancelled confirmation writes neither (AC10). When M1 arrives it drains
 * pending events and stamps consumed_at/consumed_by — nothing here has to
 * change for that to work, which is the point of writing it down now rather
 * than leaving a TODO.
 *
 * WHAT M1 INHERITS
 *
 *   - `pendingRecomputeEvents()` in ./recompute-queries: the backlog, oldest first.
 *   - Each event's `field_changes` carries the money-restating fields only,
 *     old→new, as exact decimal strings — enough to replay without re-reading
 *     the settings row, which by then may have moved again.
 *   - `audit_entry_id` links the event to its human-readable trail entry.
 *   - Consumption is one-way and trigger-enforced, so a double-drain cannot
 *     double-restate.
 *   - `MONEY_RESTATING_FIELDS` in ./tax is the authoritative list of what
 *     triggers all this; `update_tax_settings` mirrors it in SQL.
 */

/**
 * The confirmation's consequence line (M0 §6 specifies the shape:
 * "This will recompute N deals — booked GCI figures will change. Continue?").
 *
 * With no deals, the PRD's sentence would be a lie dressed as a warning, and a
 * warning the agent learns is empty is worse than no warning at all. So the zero
 * case says what is actually true: nothing is restated now, and the new rate
 * governs from here on. Both sentences are the truth about the same change.
 */
export function recomputeConsequence(
  fields: readonly TaxField[],
  affectedDeals: number
): string {
  const names = fields.map((field) => TAX_FIELD_LABELS[field]);
  const list =
    names.length <= 1
      ? (names[0] ?? "these settings")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  if (affectedDeals === 0) {
    return `Changing ${list} restates money. You have no deals yet, so nothing is recomputed now — this applies to every deal you enter from here on.`;
  }

  return `This will recompute ${affectedDeals} ${
    affectedDeals === 1 ? "deal" : "deals"
  } — booked GCI figures will change. Your logged payments keep the splits they were recorded with.`;
}
