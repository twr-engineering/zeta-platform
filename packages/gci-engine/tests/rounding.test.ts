import test from "node:test";
import assert from "node:assert/strict";

import { computeDeal } from "../src/engine/index.ts";
import type { DealComputeInput } from "../src/engine/index.ts";
import { roundCentavos, toMoney } from "../src/money/index.ts";
import { VAT_REGISTERED_SETTINGS } from "./fixtures.ts";

/**
 * M1.1 — the rounding tripwire (Master PRD §4.3, M1 PRD §8; see
 * src/lib/engine/ROUNDING.md).
 *
 * Proves that rounding intermediate values to centavos produces the WRONG
 * answer, so a regression that reintroduces mid-chain rounding fails loudly.
 */

const S = VAT_REGISTERED_SETTINGS;

/**
 * A taxable, VAT-inclusive deal with billed commission ₱100.00 and a taxable
 * incentive of ₱100.00. Each ÷1.12 half is 89.285714…, which rounds to 89.29;
 * the exact sum 178.571428… rounds to 178.57.
 */
const TRIPWIRE: DealComputeInput = {
  deal_type: "resale",
  transaction_type: "sale",
  representation: "double_ended",
  force_vat: false,
  property_vat_rule: "threshold",
  list_price: "1000000",
  commission: { basis: "fixed", amount: "100" },
  developer_comm_base: null,
  receipt_issued: true, // makes the resale taxable → VAT-inclusive
  incentive_billed: "100",
  incentive_taxable: "yes",
  referral_out_pct: "0",
  referral_out_fixed: "0",
};

test("NET GCI rounds once at the boundary: 178.57, not the 178.58 of per-step rounding", () => {
  const d = computeDeal(TRIPWIRE, S);

  // Each half rounds to 89.29 on its own.
  assert.equal(d.gci_net_of_vat, "89.29");
  assert.equal(d.incentive_net, "89.29");

  // The engine sums at full precision, then rounds once → 178.57 (correct).
  assert.equal(d.net_gci, "178.57");

  // The forbidden path — round each half first, then add — gives 178.58.
  const naive = roundCentavos(d.gci_net_of_vat).plus(roundCentavos(d.incentive_net));
  assert.equal(naive.toFixed(2), "178.58");

  // The two disagree by exactly one centavo. This is the drift the policy forbids.
  assert.equal(
    toMoney(naive).minus(toMoney(d.net_gci)).toFixed(2),
    "0.01"
  );
});

test("the memo base is the full-precision GCI + incentive, not the rounded outputs", () => {
  const d = computeDeal(TRIPWIRE, S);
  // Full-precision base = 178.571428… × 0.12 = 21.4285… → 21.43.
  // Rounded-outputs base = 178.58 × 0.12 = 21.4296 → 21.43 here they agree,
  // but the VAT memo is computed from the exact base regardless.
  assert.equal(d.vat_memo, "21.43");
  assert.equal(d.ewt_memo, "17.86"); // 178.571428… × 0.10
});
