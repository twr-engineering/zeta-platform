import { Money, withinTolerance } from "@/lib/money";
import type {
  CachedDealFigures,
  Mismatch,
  ParsedOverlay,
  PayloadDealDerived,
  PayloadPaymentSplit,
  CachedPaymentSplit,
} from "./types";

/**
 * M1.4 — the reconciliation comparator (FR-M1-10). Every recomputed figure is
 * checked against the workbook's cached value to the centavo (₱0.01 tolerance,
 * never float equality). A row that disagrees is REPORTED, not imported silently.
 *
 * THE D001 EXCEPTION (WORKBOOK §3 note). D001's row hosts the ARRAYFORMULA anchor
 * and lost every computed cache cell in the export. A missing cached figure is not
 * a mismatch — there is nothing to disagree with — so it is skipped; the engine
 * recomputes it (GCI = NET GCI = 436,050) and the Payments Log confirms it.
 */

/** ₱0.01 per-row money tolerance. */
const CENTAVO_TOLERANCE = "0.01";

function moneyMismatch(
  scope: Mismatch["scope"],
  code: string,
  field: string,
  expected: string,
  cached: string | undefined
): Mismatch | null {
  if (cached === undefined) return null; // cache lost (D001) — nothing to check
  if (withinTolerance(expected, cached, CENTAVO_TOLERANCE)) return null;
  return { scope, code, field, expected, actual: cached };
}

/** Deal derived figures vs the Deal Log's cached computed cells. */
export function reconcileDeal(
  code: string,
  derived: PayloadDealDerived,
  cached: CachedDealFigures
): Mismatch[] {
  const out: Mismatch[] = [];
  const push = (field: string, expected: string, actual: string | undefined) => {
    const m = moneyMismatch("deal", code, field, expected, actual);
    if (m) out.push(m);
  };

  push("net_list_price", derived.net_list_price, cached.net_list_price);
  push("gci_net_of_vat", derived.gci_net_of_vat, cached.gci_net_of_vat);
  push("incentive_net", derived.incentive_net, cached.incentive_net);
  push("referral_out", derived.referral_out, cached.referral_out);
  push("net_gci", derived.net_gci, cached.net_gci);
  push("vat_memo", derived.vat_memo, cached.vat_memo);
  push("ewt_memo", derived.ewt_memo, cached.ewt_memo);

  // Property VAT is an enum, not money: compared by token when the cache exists.
  if (cached.property_vat !== undefined && cached.property_vat !== derived.property_vat) {
    out.push({
      scope: "deal",
      code,
      field: "property_vat",
      expected: derived.property_vat,
      actual: cached.property_vat,
    });
  }

  // Yield is a rate (not money): compared at the 4-decimal display precision.
  if (cached.yield_on_list !== undefined) {
    const e = new Money(derived.yield_on_list).toDecimalPlaces(4);
    const a = new Money(cached.yield_on_list).toDecimalPlaces(4);
    if (!e.equals(a)) {
      out.push({
        scope: "deal",
        code,
        field: "yield_on_list",
        expected: e.toFixed(4),
        actual: a.toFixed(4),
      });
    }
  }

  return out;
}

/** Payment split vs the Payments Log's cached K/L/M/N. */
export function reconcilePayment(
  code: string,
  split: PayloadPaymentSplit,
  cached: CachedPaymentSplit
): Mismatch[] {
  const out: Mismatch[] = [];
  const push = (field: string, expected: string, actual: string | undefined) => {
    const m = moneyMismatch("payment", code, field, expected, actual);
    if (m) out.push(m);
  };
  push("net_of_vat", split.net_of_vat, cached.net_of_vat);
  push("vat", split.vat, cached.vat);
  push("ewt", split.ewt, cached.ewt);
  push("net_cash", split.net_cash, cached.net_cash);
  return out;
}

/**
 * Overlay figures vs the Collectibles cache: Total Collectible (the confirmed
 * override if set, else the engine default) and Booked NET GCI.
 */
export function reconcileOverlay(
  overlay: ParsedOverlay,
  expectedTotalCollectible: string,
  bookedNetGci: string
): Mismatch[] {
  const out: Mismatch[] = [];
  const totalMismatch = moneyMismatch(
    "overlay",
    overlay.deal_code,
    "total_collectible",
    expectedTotalCollectible,
    overlay.cached_total_collectible
  );
  if (totalMismatch) out.push(totalMismatch);

  const bookedMismatch = moneyMismatch(
    "overlay",
    overlay.deal_code,
    "booked_net_gci",
    bookedNetGci,
    overlay.cached_booked_net_gci
  );
  if (bookedMismatch) out.push(bookedMismatch);

  return out;
}
