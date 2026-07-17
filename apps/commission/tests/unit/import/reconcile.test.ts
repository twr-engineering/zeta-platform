import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileDeal,
  reconcileOverlay,
  reconcilePayment,
} from "@/lib/import/reconcile";
import type {
  CachedDealFigures,
  ParsedOverlay,
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
