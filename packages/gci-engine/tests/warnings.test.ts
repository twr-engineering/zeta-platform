import test from "node:test";
import assert from "node:assert/strict";

import { isSplitAtSourceRisk } from "../src/engine/index.ts";
import type { DealComputeInput } from "../src/engine/index.ts";

/**
 * M1.1 — soft-warning predicates (edge case 16, §3.3 What-to-Book doctrine).
 * The engine never blocks; it exposes the condition the UI renders (FR-M1-11).
 */

function resale(over: Partial<DealComputeInput>): DealComputeInput {
  return {
    deal_type: "resale",
    transaction_type: "sale",
    representation: "seller",
    force_vat: false,
    property_vat_rule: "threshold",
    list_price: "5000000",
    commission: { basis: "percent", rate: "0.05" },
    developer_comm_base: null,
    receipt_issued: false,
    incentive_billed: "0",
    incentive_taxable: null,
    referral_out_pct: "0",
    referral_out_fixed: "0",
    ...over,
  };
}

test("one-sided resale (Seller) with a % referral out → risk (edge case 16)", () => {
  assert.equal(isSplitAtSourceRisk(resale({ referral_out_pct: "0.02" })), true);
});

test("one-sided resale (Buyer) with a fixed referral out → risk", () => {
  assert.equal(
    isSplitAtSourceRisk(resale({ representation: "buyer", referral_out_fixed: "10000" })),
    true
  );
});

test("Double Ended resale is not one-sided → no risk", () => {
  assert.equal(
    isSplitAtSourceRisk(resale({ representation: "double_ended", referral_out_fixed: "10000" })),
    false
  );
});

test("a developer deal is never a split-at-source risk (pre-selling tags one agent)", () => {
  assert.equal(
    isSplitAtSourceRisk(
      resale({ deal_type: "developer", representation: "seller", referral_out_pct: "0.02" })
    ),
    false
  );
});

test("a one-sided resale with no referral out → no risk", () => {
  assert.equal(isSplitAtSourceRisk(resale({ representation: "seller" })), false);
});
