import test from "node:test";
import assert from "node:assert/strict";

import {
  headerMatches,
  toDealType,
  toIncentiveTaxable,
  toModeOfPayment,
  toPaymentType,
  toPropertyVatRule,
  toReceivableStatus,
  toYesBool,
} from "@/lib/import/mapping";
import { serialToISO } from "@/lib/import/xlsx";

test("token maps: workbook text → DB enum tokens", () => {
  assert.equal(toDealType("Developer"), "developer");
  assert.equal(toDealType("Resale"), "resale");
  assert.equal(toDealType("N/A"), "n_a");
  assert.equal(toModeOfPayment("Deferred Cash"), "deferred_cash");
  assert.equal(toPropertyVatRule("Always VAT"), "always_vat");
  assert.equal(toReceivableStatus("Closed"), "closed");
});

test("payment type: blank ≡ Commission (WORKBOOK register item 9)", () => {
  assert.equal(toPaymentType(""), "commission");
  assert.equal(toPaymentType("Commission"), "commission");
  assert.equal(toPaymentType("Incentive"), "incentive");
});

test("incentive taxable: blank → null (engine treats blank as Yes)", () => {
  assert.equal(toIncentiveTaxable(""), null);
  assert.equal(toIncentiveTaxable("Yes"), "yes");
  assert.equal(toIncentiveTaxable("No"), "no");
});

test("Yes/blank booleans", () => {
  assert.equal(toYesBool("Yes"), true);
  assert.equal(toYesBool("No"), false);
  assert.equal(toYesBool(""), false);
});

test("unrecognised values throw a clear error", () => {
  assert.throws(() => toDealType("Wholesale"), /Deal Type/);
});

test("header validation matches on a prefix (units/suffixes tolerated)", () => {
  assert.ok(headerMatches("List Price", "List Price (₱)"));
  assert.ok(headerMatches("Rate", "Rate %"));
  assert.ok(!headerMatches("List Price", "Net List Price"));
});

test("Excel serial → ISO calendar date (UTC, no timezone shift)", () => {
  assert.equal(serialToISO(46023), "2026-01-01"); // D001 booking
  assert.equal(serialToISO(46213), "2026-07-10"); // D021 booking
  assert.equal(serialToISO(46212), "2026-07-09"); // D021 pre-booking payment
  assert.equal(serialToISO(46035), "2026-01-13"); // D001 payment
});
