"use server";

import type { PaymentSplit } from "@/lib/engine";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getReceivableByDealId } from "@/lib/receivables/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { manilaToday } from "@/lib/date/manila";
import { equalsToCentavo } from "@/lib/money";
import { derivePaymentSnapshot } from "./compute";
import { parsePayment, type RawPayment } from "./schema";
import { computePaymentWarnings, type PaymentWarning } from "./warnings";
import { findDuplicatePayments, resolvePaymentDeal } from "./queries";

/**
 * The live split preview (FR-M5-03, §6.1) and the same warnings the save returns.
 *
 * A SERVER ROUND-TRIP DELIBERATELY, exactly like M1.3's previewDeal (FR-M1-06):
 * the preview calls the SAME engine (computePaymentSplit), against the SAME deal
 * snapshot semantics and the SAME workspace tax settings the save uses — so what
 * the agent eyeballs against the payor's advice before saving is, to the centavo,
 * what create_payment will store (§3.2, "never a UI re-implementation"). The form
 * debounces this as the gross / deal / type change; latest-wins.
 *
 * Lenient about half-filled input: no deal picked yet, or no gross typed, returns
 * `{ ok: false, reason: "incomplete" }` and the panel shows placeholders instead
 * of a validation error for a field the agent has not reached.
 *
 * Warnings (§4) ride along so the amber banners appear the moment the input that
 * triggers them lands (a pre-booking date, a Closed receivable), before the save.
 */

export type PaymentPreviewResult =
  | {
      ok: true;
      split: PaymentSplit;
      /** True on the zero-tax rows (Rules P2/P3): net = gross, VAT = EWT = 0. */
      untaxed: boolean;
      warnings: PaymentWarning[];
    }
  | { ok: false; reason: "incomplete" | "error"; error: string };

export async function previewPayment(
  raw: RawPayment,
  excludeId?: string
): Promise<PaymentPreviewResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "error", error: "Supabase is not configured." };
  }

  const context = await getWorkspaceContext();
  if (!context?.taxSettings) {
    return {
      ok: false,
      reason: "error",
      error: "Set up your tax settings before logging a payment.",
    };
  }

  const parsed = parsePayment(raw);
  if (!parsed.ok) return { ok: false, reason: "incomplete", error: parsed.error };

  const deal = await resolvePaymentDeal(parsed.value.deal_id);
  if (!deal.ok) return { ok: false, reason: "error", error: deal.error };

  // The split — the one source of money truth, via M1's engine (§3.2).
  const snap = derivePaymentSnapshot(parsed.value, deal.deal, context.taxSettings);

  // The same warnings the save computes (§4). Best-effort on the reads: a warning
  // lookup failing must never break the preview the agent is watching.
  let warnings: PaymentWarning[] = [];
  try {
    const [receivable, duplicates] = await Promise.all([
      getReceivableByDealId(parsed.value.deal_id),
      findDuplicatePayments(
        parsed.value.deal_id,
        parsed.value.gross_amount,
        parsed.value.payment_date,
        excludeId
      ),
    ]);
    warnings = computePaymentWarnings({
      input: parsed.value,
      bookedDate: deal.deal.booked_date,
      today: manilaToday(),
      receivableStatus: receivable?.status ?? null,
      duplicates,
    });
  } catch {
    warnings = [];
  }

  const untaxed =
    equalsToCentavo(snap.split.vat, "0") && equalsToCentavo(snap.split.ewt, "0");

  return { ok: true, split: snap.split, untaxed, warnings };
}
