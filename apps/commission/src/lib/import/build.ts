import {
  computeDeal,
  computePaymentSplit,
  type DealComputeInput,
  type DealDerived,
  type EngineSettings,
} from "@/lib/engine";
import { dealTypeToEngine, dealDerivedDbFields } from "@/lib/deals/map";
import { sum, toCentavoString } from "@/lib/money";
import type {
  ImportAnchors,
  ImportPayload,
  ImportPlan,
  ImportSummaryCounts,
  Mismatch,
  ParsedDeal,
  PayloadDeal,
  PayloadDealDerived,
  PayloadOverlay,
  PayloadPayment,
  PayloadTarget,
  RawWorkbook,
} from "./types";
import {
  reconcileDeal,
  reconcileOverlay,
  reconcilePayment,
  reconcileTargets,
} from "./reconcile";

/**
 * M1.4 — turn a parsed workbook into the engine-computed, reconciled ImportPlan.
 *
 * THE ENGINE IS THE SINGLE SOURCE OF MONEY TRUTH (FR-M1-05). Every figure the
 * importer writes is produced HERE by @/lib/engine — the same computeDeal /
 * computePaymentSplit the deal form and the payment write path use — never trusted
 * from the workbook's cache. The cache is used ONLY to reconcile (₱0.01/row); a
 * disagreement is reported, not imported (reconcile.ts).
 */

function toEngineSettings(tax: RawWorkbook["settings"]["tax"]): EngineSettings {
  return {
    vat_rate: tax.vat_rate,
    ewt_rate: tax.ewt_rate,
    property_vat_threshold: tax.property_vat_threshold,
    vat_registered: tax.vat_registered,
  };
}

function toComputeInput(d: ParsedDeal): DealComputeInput {
  return {
    deal_type: dealTypeToEngine(d.deal_type),
    transaction_type: d.transaction_type,
    representation: d.representation,
    force_vat: d.force_vat,
    property_vat_rule: d.property_vat_rule,
    list_price: d.list_price,
    commission:
      d.commission_basis === "percent"
        ? { basis: "percent", rate: d.rate_pct as string }
        : { basis: "fixed", amount: d.fixed_amount as string },
    developer_comm_base: d.developer_comm_base,
    receipt_issued: d.receipt_issued,
    incentive_billed: d.incentive_billed,
    incentive_taxable: d.incentive_taxable,
    referral_out_pct: d.referral_out_pct,
    referral_out_fixed: d.referral_out_fixed,
  };
}

function payloadDeal(d: ParsedDeal, derived: PayloadDealDerived): PayloadDeal {
  return {
    deal_code: d.deal_code,
    booked_date: d.booked_date,
    transaction_type: d.transaction_type,
    deal_type: d.deal_type,
    developer_name: d.developer_name,
    client_name: d.client_name,
    representation: d.representation,
    property_type_name: d.property_type_name,
    lead_source_name: d.lead_source_name,
    property_details: d.property_details,
    mode_of_payment: d.mode_of_payment,
    list_price: d.list_price,
    force_vat: d.force_vat,
    commission_basis: d.commission_basis,
    rate_pct: d.rate_pct,
    fixed_amount: d.fixed_amount,
    receipt_issued: d.receipt_issued,
    incentive_billed: d.incentive_billed,
    incentive_taxable: d.incentive_taxable,
    referral_out_pct: d.referral_out_pct,
    referral_out_fixed: d.referral_out_fixed,
    referral_paid: d.referral_paid,
    derived,
  };
}

type EngineDeal = {
  parsed: ParsedDeal;
  derived: DealDerived;
  payloadDerived: PayloadDealDerived;
};

export function buildImportPlan(
  workbook: RawWorkbook,
  fileHash: string,
  fileName: string | null
): ImportPlan {
  const settings = toEngineSettings(workbook.settings.tax);
  const mismatches: Mismatch[] = [];
  const notices: string[] = [];

  // --- Deals: run the engine, reconcile, keep the derived for the payments leg.
  const byCode = new Map<string, EngineDeal>();
  const payloadDeals: PayloadDeal[] = [];

  for (const parsed of workbook.deals) {
    const derived = computeDeal(toComputeInput(parsed), settings);
    // dealDerivedDbFields yields DB tokens + money strings + default_total_collectible
    // + taxable — exactly PayloadDealDerived.
    const payloadDerived = dealDerivedDbFields(derived) as PayloadDealDerived;
    byCode.set(parsed.deal_code, { parsed, derived, payloadDerived });
    payloadDeals.push(payloadDeal(parsed, payloadDerived));
    mismatches.push(...reconcileDeal(parsed.deal_code, payloadDerived, parsed.cached));
  }

  // --- Payments: split via the engine, reconcile, snapshot the *_used anchors.
  const payloadPayments: PayloadPayment[] = [];
  for (const p of workbook.payments) {
    const deal = byCode.get(p.deal_code);
    if (!deal) {
      mismatches.push({
        scope: "payment",
        code: p.deal_code,
        field: "deal_ref",
        expected: "an imported deal",
        actual: "no such deal in the Deal Log",
      });
      continue;
    }

    const split = computePaymentSplit(
      {
        gross: p.gross_amount,
        vat_basis: deal.derived.vat_basis,
        payment_type: p.payment_type,
        incentive_taxable: deal.parsed.incentive_taxable,
        ewt_subject: deal.derived.taxable,
      },
      settings
    );

    mismatches.push(...reconcilePayment(p.deal_code, split, p.cached));

    // Pre-booking release (D021's 07-09 < booking 07-10) is accepted silently
    // (OQ5) — surfaced as a notice, never a block.
    if (p.payment_date < deal.parsed.booked_date) {
      notices.push(
        `${p.deal_code}: payment dated ${p.payment_date} is before the deal's booking date ${deal.parsed.booked_date} — imported as-is.`
      );
    }

    payloadPayments.push({
      deal_code: p.deal_code,
      payment_date: p.payment_date,
      gross_amount: p.gross_amount,
      payment_type: p.payment_type,
      reference_note: p.reference_note,
      split: {
        net_of_vat: split.net_of_vat,
        vat: split.vat,
        ewt: split.ewt,
        net_cash: split.net_cash,
        retained: split.retained,
      },
      vat_basis_used: deal.payloadDerived.vat_basis,
      ewt_rate_used: workbook.settings.tax.ewt_rate,
      vat_rate_used: workbook.settings.tax.vat_rate,
    });
  }

  // --- Overlays: status/confirmed/note, reconciled against the Collectibles cache.
  const payloadOverlays: PayloadOverlay[] = [];
  let closedStatuses = 0;
  for (const overlay of workbook.overlays) {
    const deal = byCode.get(overlay.deal_code);
    if (!deal) continue;
    if (overlay.status === "closed") closedStatuses += 1;

    const bookedNetGci = deal.payloadDerived.net_gci;
    // Total Collectible = the confirmed override if set, else the engine's default.
    const expectedTotal = overlay.confirmed ?? deal.payloadDerived.default_total_collectible;
    mismatches.push(...reconcileOverlay(overlay, expectedTotal, bookedNetGci));

    payloadOverlays.push({
      deal_code: overlay.deal_code,
      status: overlay.status,
      confirmed: overlay.confirmed,
      note: overlay.note,
      // A legacy override with no Next Action note is FLAGGED, not rejected
      // (m4_1 handoff): import_receivable_overlay accepts it, set_confirmed_collectible
      // would not.
      legacy_note_missing: overlay.confirmed !== null && overlay.note === null,
    });
  }

  // --- Targets: the GCI Calculator TARGETS table → PlanYearTarget rows (M3.2).
  // Passed through verbatim (blank/0 already mapped to null at parse); the plan
  // year's derived working goal is reconciled against the sheet's F8 cache so a
  // planning drift is reported, not imported (2026 → 16,920,000).
  const payloadTargets: PayloadTarget[] = workbook.planning.targets;
  mismatches.push(
    ...reconcileTargets(
      workbook.planning.planYear,
      workbook.planning.targets,
      workbook.planning.workingGoalCache
    )
  );

  // --- Anchors (Master PRD §9), summed at full precision, rounded once.
  const totalCollectible = sum(
    payloadOverlays.map((o) => {
      const deal = byCode.get(o.deal_code);
      return o.confirmed ?? deal!.payloadDerived.default_total_collectible;
    })
  );
  const bookedNetGci = sum(payloadDeals.map((d) => d.derived.net_gci));
  const paymentNetCollected = sum(payloadPayments.map((p) => p.split.net_of_vat));
  const outstanding = totalCollectible.minus(paymentNetCollected);

  const anchors: ImportAnchors = {
    total_collectible: toCentavoString(totalCollectible),
    booked_net_gci: toCentavoString(bookedNetGci),
    payment_net_collected: toCentavoString(paymentNetCollected),
    outstanding_pending: toCentavoString(outstanding),
  };

  const maxSuffix = workbook.deals.reduce((max, d) => {
    const n = Number((d.deal_code.match(/\d+/) ?? ["0"])[0]);
    return n > max ? n : max;
  }, 0);

  const payload: ImportPayload = {
    file_hash: fileHash,
    file_name: fileName,
    tax: workbook.settings.tax,
    property_types: workbook.settings.property_types,
    developers: workbook.settings.developers,
    lead_sources: workbook.settings.lead_sources,
    deals: payloadDeals,
    overlays: payloadOverlays,
    payments: payloadPayments,
    targets: payloadTargets,
    anchors,
  };

  const counts: ImportSummaryCounts = {
    deals: payloadDeals.length,
    payments: payloadPayments.length,
    overlays: payloadOverlays.length,
    property_types: workbook.settings.property_types.length,
    developers: workbook.settings.developers.length,
    lead_sources: workbook.settings.lead_sources.length,
    closed_statuses: closedStatuses,
    next_deal_code: `D${String(maxSuffix + 1).padStart(3, "0")}`,
    targets: payloadTargets.length,
  };

  return { payload, counts, anchors, mismatches, headerChecks: workbook.headerChecks, notices };
}
