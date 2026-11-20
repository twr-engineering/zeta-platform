import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  computeDeal,
  computePaymentSplit,
} from "../../../src/lib/engine/index.ts";
import type {
  CommBase,
  DealComputeInput,
  EngineSettings,
  VatBasis,
} from "../../../src/lib/engine/index.ts";
import { Money, toMoney, withinTolerance } from "../../../src/lib/money/index.ts";
import { VAT_REGISTERED_SETTINGS } from "./fixtures.ts";

/**
 * M1.1 — property-based invariants (Milestones deliverable). Fixtures pin the
 * exact numbers; these assert the laws that must hold for ANY valid input, and
 * that no output ever carries a binary float (Master PRD §4.3).
 */

const S = VAT_REGISTERED_SETTINGS;
const MONEY_2DP = /^-?\d+\.\d{2}$/;
const RATE_6DP = /^-?\d+\.\d{6}$/;
const CENTAVO = "0.02"; // two independently-rounded halves ⇒ up to ~1.1 centavo slack

const listPriceArb = fc.integer({ min: 1, max: 200_000_000 }).map(String);
const rateArb = fc.constantFrom("0.02", "0.03", "0.05", "0.07", "0.10", "1/12");
const incentiveArb = fc.integer({ min: 0, max: 2_000_000 }).map(String);
const commBaseArb = fc.constantFrom<CommBase>("gross", "net");

/** A taxable, VAT-inclusive developer deal (arbitrary but always valid). */
const inclusiveDealArb: fc.Arbitrary<DealComputeInput> = fc.record({
  deal_type: fc.constant<DealComputeInput["deal_type"]>("developer"),
  transaction_type: fc.constant<DealComputeInput["transaction_type"]>("sale"),
  representation: fc.constant<DealComputeInput["representation"]>("double_ended"),
  force_vat: fc.boolean(),
  property_vat_rule: fc.constantFrom<DealComputeInput["property_vat_rule"]>(
    "threshold",
    "always_vat",
    "always_exempt"
  ),
  list_price: listPriceArb,
  commission: rateArb.map((rate) => ({ basis: "percent" as const, rate })),
  developer_comm_base: commBaseArb,
  receipt_issued: fc.constant(true),
  incentive_billed: incentiveArb,
  incentive_taxable: fc.constantFrom<DealComputeInput["incentive_taxable"]>("yes", "no", null),
  referral_out_pct: fc.constantFrom("0", "0.01", "0.02"),
  referral_out_fixed: fc.integer({ min: 0, max: 100_000 }).map(String),
});

test("Rule E invariant — GCI × (1+vat) reconstructs the billed commission", () => {
  fc.assert(
    fc.property(inclusiveDealArb, (input) => {
      const d = computeDeal(input, S);
      const reconstructed = toMoney(d.gci_net_of_vat).times("1.12");
      assert.ok(
        withinTolerance(reconstructed, d.billed_commission, CENTAVO),
        `${reconstructed.toFixed(2)} vs billed ${d.billed_commission}`
      );
    })
  );
});

test("Rule H invariant — NET GCI = GCI + incentive_net − referral_out", () => {
  fc.assert(
    fc.property(inclusiveDealArb, (input) => {
      const d = computeDeal(input, S);
      const rebuilt = toMoney(d.gci_net_of_vat)
        .plus(d.incentive_net)
        .minus(d.referral_out);
      assert.ok(withinTolerance(rebuilt, d.net_gci, CENTAVO));
    })
  );
});

test("invariant — GCI, incentive_net, memos and net list are never negative for non-negative inputs", () => {
  fc.assert(
    fc.property(inclusiveDealArb, (input) => {
      const d = computeDeal(input, S);
      for (const field of [
        d.gci_net_of_vat,
        d.incentive_net,
        d.vat_memo,
        d.ewt_memo,
        d.net_list_price,
      ]) {
        assert.ok(toMoney(field).greaterThanOrEqualTo(0), `${field} < 0`);
      }
    })
  );
});

test("invariant — every money output is a 2dp string and yield a 6dp string (no binary float)", () => {
  fc.assert(
    fc.property(inclusiveDealArb, (input) => {
      const d = computeDeal(input, S);
      for (const field of [
        d.net_list_price,
        d.billed_commission,
        d.gci_net_of_vat,
        d.incentive_net,
        d.referral_out,
        d.net_gci,
        d.vat_memo,
        d.ewt_memo,
      ]) {
        assert.match(field, MONEY_2DP);
      }
      assert.match(d.yield_on_list, RATE_6DP);
    })
  );
});

test("invariant — vat_basis is always inclusive or n/a, never anything else", () => {
  const anyDealArb = fc.record({
    deal_type: fc.constantFrom<DealComputeInput["deal_type"]>("developer", "resale", "n/a"),
    transaction_type: fc.constantFrom<DealComputeInput["transaction_type"]>("sale", "rental"),
    representation: fc.constant<DealComputeInput["representation"]>("double_ended"),
    force_vat: fc.boolean(),
    property_vat_rule: fc.constantFrom<DealComputeInput["property_vat_rule"]>(
      "threshold",
      "always_vat",
      "always_exempt"
    ),
    list_price: listPriceArb,
    commission: rateArb.map((rate) => ({ basis: "percent" as const, rate })),
    developer_comm_base: fc.constantFrom<CommBase | null>("gross", "net", null),
    receipt_issued: fc.boolean(),
    incentive_billed: incentiveArb,
    incentive_taxable: fc.constantFrom<DealComputeInput["incentive_taxable"]>("yes", "no", null),
    referral_out_pct: fc.constant("0"),
    referral_out_fixed: fc.constant("0"),
  });
  const registrationArb = fc.boolean();

  fc.assert(
    fc.property(anyDealArb, registrationArb, (input, vat_registered) => {
      const settings: EngineSettings = { ...S, vat_registered };
      const basis: VatBasis = computeDeal(input, settings).vat_basis;
      assert.ok(basis === "inclusive" || basis === "n/a");
    })
  );
});

test("payment-split invariant — K + L = gross, N = gross − M, all non-negative", () => {
  const splitArb = fc.record({
    gross: fc.integer({ min: 1, max: 50_000_000 }).map(String),
    vat_basis: fc.constantFrom<VatBasis>("inclusive", "n/a"),
    payment_type: fc.constantFrom<"commission" | "incentive">("commission", "incentive"),
    incentive_taxable: fc.constantFrom<DealComputeInput["incentive_taxable"]>("yes", "no", null),
    ewt_subject: fc.boolean(),
  });

  fc.assert(
    fc.property(splitArb, (input) => {
      const s = computePaymentSplit(input, S);
      // K + L = H
      assert.ok(
        withinTolerance(toMoney(s.net_of_vat).plus(s.vat), s.gross, "0.01"),
        `K+L ${toMoney(s.net_of_vat).plus(s.vat).toFixed(2)} vs ${s.gross}`
      );
      // N = H − M
      assert.ok(
        withinTolerance(toMoney(s.gross).minus(s.ewt), s.net_cash, "0.01")
      );
      for (const field of [s.net_of_vat, s.vat, s.ewt, s.net_cash, s.retained]) {
        assert.ok(toMoney(field).greaterThanOrEqualTo(0), `${field} < 0`);
        assert.match(field, MONEY_2DP);
      }
      // decimal.js is the only arithmetic in play — sanity that Money exists.
      assert.ok(new Money(s.gross).isFinite());
    })
  );
});
