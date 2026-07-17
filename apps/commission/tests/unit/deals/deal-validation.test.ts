import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseDeal, type RawDeal } from "@/lib/deals/schema";

/**
 * M1 §4 conditional validation (rules 7, 12, 17), the boundary half of the
 * rules the DB CHECKs mirror. A failure here means the form would offer a Save
 * the database refuses (or the reverse) — the exact drift this file guards.
 */

/** A complete, valid developer deal (D021's inputs) to mutate per-case. */
function d021(overrides: RawDeal = {}): RawDeal {
  return {
    bookedDate: "2026-07-10",
    transactionType: "sale",
    dealType: "developer",
    developerId: "11111111-1111-1111-1111-111111111111",
    clientName: "Daria & John Salon",
    representation: "double_ended",
    propertyTypeId: "22222222-2222-2222-2222-222222222222",
    leadSourceId: "33333333-3333-3333-3333-333333333333",
    propertyDetails: "House & Lot",
    modeOfPayment: "bank",
    listPrice: "8000000",
    commissionBasis: "percent",
    rate: "5",
    incentiveBilled: "40000",
    incentiveTaxable: "yes",
    ...overrides,
  };
}

function expectError(raw: RawDeal): string {
  const result = parseDeal(raw);
  assert.equal(result.ok, false, "expected validation to fail");
  return (result as { ok: false; error: string }).error;
}

test("a complete developer deal validates and normalises", () => {
  const result = parseDeal(d021());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const v = result.value;
  assert.equal(v.deal_type, "developer");
  assert.equal(v.developer_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(v.list_price, "8000000.00");
  // 5% entered → the engine's decimal form, trailing-zero-free.
  assert.equal(v.rate_pct, "0.05");
  assert.equal(v.fixed_amount, null);
  // Developer deals are always receipted/taxable (§3.1 field 20).
  assert.equal(v.receipt_issued, true);
  // Defaults filled.
  assert.equal(v.referral_out_pct, "0");
  assert.equal(v.referral_out_fixed, "0");
});

test("rule 12: a rental must be deal_type N/A", () => {
  const error = expectError(
    d021({ transactionType: "rental", dealType: "resale", developerId: "" })
  );
  assert.match(error, /rental/i);
});

test("rule 12: a sale cannot be N/A", () => {
  assert.match(expectError(d021({ dealType: "n_a", developerId: "" })), /N\/A/);
});

test("rule 12: a developer deal requires a developer", () => {
  assert.match(expectError(d021({ developerId: "" })), /developer/i);
});

test("rule 12: a resale must NOT carry a developer", () => {
  const error = expectError(d021({ dealType: "resale" })); // developerId still set
  assert.match(error, /Only developer deals/i);
});

test("a valid rental (N/A, lessor, 1/12) validates and keeps the exact fraction", () => {
  const result = parseDeal(
    d021({
      transactionType: "rental",
      dealType: "n_a",
      developerId: "",
      representation: "lessor",
      rate: "1/12",
      listPrice: "270000",
      incentiveBilled: "",
      incentiveTaxable: "",
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // §4 rule 17 — the exact fraction is preserved, not truncated to 0.0833.
  assert.equal(result.value.rate_pct, "1/12");
  assert.equal(result.value.receipt_issued, false);
  assert.equal(result.value.incentive_taxable, null); // blank = Yes
});

test("basis pairing: percent needs a rate, fixed needs an amount", () => {
  assert.match(expectError(d021({ commissionBasis: "percent", rate: "" })), /rate/i);
  const fixedMissing = expectError(
    d021({ commissionBasis: "fixed", rate: "", fixedAmount: "" })
  );
  assert.match(fixedMissing, /fixed/i);
});

test("a fixed-basis developer deal drops the rate", () => {
  const result = parseDeal(
    d021({ commissionBasis: "fixed", rate: "", fixedAmount: "174500" })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.rate_pct, null);
  assert.equal(result.value.fixed_amount, "174500.00");
});

test("rate range: over 100% is refused; a fraction over 1 is refused", () => {
  assert.match(expectError(d021({ rate: "150" })), /at most 100/i);
  assert.match(expectError(d021({ rate: "13/12" })), /at most 100/i);
});

test("list price must be greater than zero", () => {
  assert.match(expectError(d021({ listPrice: "0" })), /greater than zero/i);
  assert.match(expectError(d021({ listPrice: "" })), /valid list price/i);
});

test("money and rate inputs stay exact strings, never floats", () => {
  const result = parseDeal(d021({ listPrice: "8,000,000", incentiveBilled: "40,000" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Grouped input parsed exactly; no binary-float artefacts.
  assert.equal(result.value.list_price, "8000000.00");
  assert.equal(result.value.incentive_billed, "40000.00");
});
