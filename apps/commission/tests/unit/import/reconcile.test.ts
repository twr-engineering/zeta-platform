import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileDeal,
  reconcileOverlay,
  reconcilePayment,
  reconcileTargets,
} from "@/lib/import/reconcile";
import type {
  CachedDealFigures,
  ParsedOverlay,
  ParsedTarget,
  PayloadDealDerived,
  PayloadPaymentSplit,
} from "@/lib/import/types";

const derived: PayloadDealDerived = {
  property_vat: "vat_able",
  net_list_price: "7142857.14",
  comm_base: "net",
  vat_basis: "inclusive",
  billed_commission: "357142.86",
  gci_net_of_vat: "318877.55",
  incentive_net: "35714.29",
  referral_out: "0.00",
  net_gci: "354591.84",
  default_total_collectible: "354591.84",
  vat_memo: "42551.02",
  ewt_memo: "35459.18",
  yield_on_list: "0.044324",
  taxable: true,
};

test("reconcileDeal: matching within ₱0.01 → no mismatch", () => {
  const cached: CachedDealFigures = {
    property_vat: "vat_able",
    net_list_price: "7142857.14",
    gci_net_of_vat: "318877.55",
    incentive_net: "35714.29",
    referral_out: "0",
    net_gci: "354591.8367346938", // full-precision workbook cache
    vat_memo: "42551.02040816326",
    ewt_memo: "35459.18367346939",
    yield_on_list: "0.04432397959183673",
  };
  assert.deepEqual(reconcileDeal("D021", derived, cached), []);
});

test("reconcileDeal: a tampered cell over ₱0.01 → reported with row/field/expected/actual", () => {
  const cached: CachedDealFigures = { gci_net_of_vat: "318900.00" };
  const out = reconcileDeal("D021", derived, cached);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    scope: "deal",
    code: "D021",
    field: "gci_net_of_vat",
    expected: "318877.55",
    actual: "318900.00",
  });
});

test("reconcileDeal: a missing cached cell (D001 lost-cache) is skipped, not a mismatch", () => {
  assert.deepEqual(reconcileDeal("D001", derived, {}), []);
});

test("reconcileDeal: a property-VAT enum disagreement is reported", () => {
  const out = reconcileDeal("D021", derived, { property_vat: "exempt" });
  assert.equal(out.length, 1);
  assert.equal(out[0].field, "property_vat");
});

test("reconcilePayment: split ties within ₱0.01, off-by-more reported", () => {
  const split: PayloadPaymentSplit = {
    net_of_vat: "44642.86",
    vat: "5357.14",
    ewt: "4464.29",
    net_cash: "45535.71",
    retained: "40178.57",
  };
  assert.deepEqual(
    reconcilePayment("D021", split, {
      net_of_vat: "44642.85714285714",
      vat: "5357.142857142856",
      ewt: "4464.285714285714",
      net_cash: "45535.71428571428",
    }),
    []
  );
  const bad = reconcilePayment("D021", split, { net_of_vat: "44000" });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].field, "net_of_vat");
});

test("reconcileOverlay: Total Collectible + Booked NET GCI vs the Collectibles cache", () => {
  const overlay: ParsedOverlay = {
    row: 9,
    deal_code: "D004",
    status: "closed",
    confirmed: null,
    note: null,
    cached_total_collectible: "875000",
    cached_booked_net_gci: "800000",
  };
  assert.deepEqual(reconcileOverlay(overlay, "875000.00", "800000.00"), []);

  const mismatch = reconcileOverlay(overlay, "999999.00", "800000.00");
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].field, "total_collectible");
});

// --- M3.2 targets leg: the plan year's derived working goal vs the F8 cache -------

const TARGETS_2026: ParsedTarget[] = [
  {
    year: 2026,
    net_income_target: "11500000",
    opex_pct: "0.22",
    cos_pct: "0.1",
    yield_override: null,
    avg_price_override: null,
  },
  // 2027 staged but not plannable (blank NIT, rule 9).
  {
    year: 2027,
    net_income_target: null,
    opex_pct: null,
    cos_pct: null,
    yield_override: null,
    avg_price_override: null,
  },
];

test("reconcileTargets: 2026 derived working goal ties to the F8 cache 16,920,000 → no mismatch", () => {
  assert.deepEqual(reconcileTargets(2026, TARGETS_2026, "16920000"), []);
});

test("reconcileTargets: a tampered F8 cache over ₱0.01 is reported (working_gci_goal)", () => {
  const out = reconcileTargets(2026, TARGETS_2026, "16930000");
  assert.equal(out.length, 1);
  assert.equal(out[0].scope, "target");
  assert.equal(out[0].field, "working_gci_goal");
  assert.equal(out[0].expected, "16920000.00");
  assert.equal(out[0].actual, "16930000");
});

test("reconcileTargets: a lost F8 cache (null) is skipped, not a mismatch", () => {
  assert.deepEqual(reconcileTargets(2026, TARGETS_2026, null), []);
});

test("reconcileTargets: a not-plannable plan year (null NIT) has no derived goal → skipped", () => {
  assert.deepEqual(reconcileTargets(2027, TARGETS_2026, "0"), []);
});

test("reconcileTargets: no plan year → skipped", () => {
  assert.deepEqual(reconcileTargets(null, TARGETS_2026, "16920000"), []);
});
