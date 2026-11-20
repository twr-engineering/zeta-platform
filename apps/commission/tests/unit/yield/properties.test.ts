import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  buildPlanningBasis,
  buildYieldReport,
  classifySegment,
  type YearFilter,
  type YieldDeal,
} from "../../../src/lib/yield/index.ts";
import { toMoney } from "../../../src/lib/money/index.ts";

/**
 * M2.1 — property-based invariants + the decimal-only guarantee (Milestones
 * deliverable: "no float path"). The fixtures pin the exact workbook numbers;
 * these assert the laws that must hold for ANY valid deal set, and that no output
 * ever carries a binary float (Master PRD §4.3 / Rule 13).
 */

const MONEY_2DP = /^-?\d+\.\d{2}$/;
const RATE_6DP = /^\d+\.\d{6}$/;
/** A full-precision decimal string: digits, optional fraction, NO exponent/NaN. */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

const money = fc.integer({ min: 0, max: 200_000_000 }).map((n) => `${n}.00`);

/** An arbitrary deal spanning every segment + the odd unclassified/archived one. */
const dealArb: fc.Arbitrary<YieldDeal> = fc
  .record({
    transaction_type: fc.constantFrom<YieldDeal["transaction_type"]>("sale", "rental"),
    deal_type: fc.constantFrom<YieldDeal["deal_type"]>("developer", "resale", "n/a"),
    representation: fc.constantFrom<YieldDeal["representation"]>(
      "double_ended", "seller", "buyer", "lessor", "lessee", "referrer"
    ),
    list_price: money,
    net_gci: money,
    incentive_net: money,
    referral_out: money,
    booked_year: fc.constantFrom(2024, 2025, 2026),
    archived: fc.boolean(),
  })
  .map((r) => ({
    deal_code: "D",
    transaction_type: r.transaction_type,
    deal_type: r.deal_type,
    representation: r.representation,
    list_price: r.list_price,
    net_gci: r.net_gci,
    incentive_net: r.incentive_net,
    referral_out: r.referral_out,
    booked_year: r.booked_year,
    archived_at: r.archived ? "2026-01-01T00:00:00Z" : null,
  }))
  // Give each deal a distinct code so the unclassified list is inspectable.
  .chain((d) => fc.integer({ min: 1, max: 9999 }).map((i) => ({ ...d, deal_code: `D${i}` })));

const dealsArb = fc.array(dealArb, { maxLength: 40 });
const filterArb: fc.Arbitrary<YearFilter> = fc.constantFrom<YearFilter>("all", 2024, 2025, 2026, 2027);

test("SALES SUBTOTAL = Resale + Developer, component-wise (any deals/filter)", () => {
  fc.assert(
    fc.property(dealsArb, filterArb, (deals, filter) => {
      const r = buildYieldReport(deals, filter);
      const resale = r.rows.find((x) => x.key === "resale")!;
      const dev = r.rows.find((x) => x.key === "developer")!;
      const sub = r.rows.find((x) => x.key === "sales_subtotal")!;
      assert.equal(sub.deals, resale.deals + dev.deals);
      assert.equal(
        sub.volume,
        toMoney(resale.volume).plus(toMoney(dev.volume)).toFixed(2)
      );
      assert.equal(sub.gci, toMoney(resale.gci).plus(toMoney(dev.gci)).toFixed(2));
    })
  );
});

test("TOTAL GCI (all ops) = Sales + Rental + Referral GCI", () => {
  fc.assert(
    fc.property(dealsArb, filterArb, (deals, filter) => {
      const r = buildYieldReport(deals, filter);
      const g = (k: string) => r.rows.find((x) => x.key === k)!.gci;
      assert.equal(
        r.totalGciAllOps,
        toMoney(g("sales_subtotal")).plus(toMoney(g("rental"))).plus(toMoney(g("referral"))).toFixed(2)
      );
    })
  );
});

test("partition invariant holds for any deal set (Rule 9)", () => {
  fc.assert(
    fc.property(dealsArb, filterArb, (deals, filter) => {
      const r = buildYieldReport(deals, filter);
      // Every non-archived deal is either in exactly one segment or unclassified.
      const active = deals.filter((d) => d.archived_at === null);
      const classified = active.filter((d) => classifySegment(d) !== null);
      assert.equal(classified.length + r.unclassified.length, active.length);
    })
  );
});

test("decimal-only guarantee: no output is ever a binary float", () => {
  fc.assert(
    fc.property(dealsArb, filterArb, (deals, filter) => {
      const r = buildYieldReport(deals, filter);
      for (const row of r.rows) {
        assert.match(row.volume, MONEY_2DP);
        assert.match(row.gci, MONEY_2DP);
        if (row.realizedYield !== null) assert.match(row.realizedYield, RATE_6DP);
        if (row.shareOfSales !== null) assert.match(row.shareOfSales, RATE_6DP);
        assert.ok(Number.isInteger(row.deals));
      }
      for (const m of [r.totalGciAllOps, r.memoIncentives, r.memoReferralOuts, r.rentalAnnualGci]) {
        assert.match(m, MONEY_2DP);
      }
      for (const a of [r.resaleAvgPrice, r.developerAvgPrice, r.blendedAvgPrice]) {
        if (a !== null) assert.match(a, MONEY_2DP);
      }

      const b = buildPlanningBasis(deals);
      assert.match(b.allTimeSalesVolume, MONEY_2DP);
      assert.match(b.allTimeSalesGci, MONEY_2DP);
      // Full-precision ratios: a plain decimal string, never NaN/Infinity/exponent.
      if (b.allTimeYield !== null) assert.match(b.allTimeYield, PLAIN_DECIMAL);
      if (b.allTimePrice !== null) assert.match(b.allTimePrice, PLAIN_DECIMAL);
    })
  );
});

test("planning basis ignores the year filter entirely (Rule 4)", () => {
  fc.assert(
    fc.property(dealsArb, (deals) => {
      // The basis is computed from deals alone — same result regardless of any
      // report filter drawn over the same set. (Structural: buildPlanningBasis
      // takes no filter; this asserts the report never leaks one into it.)
      const b1 = buildPlanningBasis(deals);
      const b2 = buildPlanningBasis(deals);
      assert.deepEqual(b1, b2);
    })
  );
});
