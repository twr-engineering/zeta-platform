import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parsePayment, type RawPayment } from "@/lib/payments/schema";

/**
 * M5.1 — payment input validation (§4 rules 4, 14), the boundary half of the
 * rules the DB CHECKs mirror. gross > 0, blank type ≡ Commission, note length.
 */

function raw(over: RawPayment = {}): RawPayment {
  return {
    dealId: "11111111-1111-1111-1111-111111111111",
    paymentDate: "2026-07-09",
    grossAmount: "50000",
    paymentType: "incentive",
    referenceNote: "OR-12345",
    ...over,
  };
}

test("a valid payment parses, money normalised to 2dp", () => {
  const r = parsePayment(raw());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.gross_amount, "50000.00");
    assert.equal(r.value.payment_type, "incentive");
    assert.equal(r.value.reference_note, "OR-12345");
  }
});

test("rule 4 — gross of 0 is rejected", () => {
  const r = parsePayment(raw({ grossAmount: "0" }));
  assert.equal(r.ok, false);
});

test("rule 4 — a negative gross is rejected (refunds are OQ2, not representable)", () => {
  const r = parsePayment(raw({ grossAmount: "-5000" }));
  assert.equal(r.ok, false);
});

test("rule 14 — blank type ≡ Commission", () => {
  const r = parsePayment(raw({ paymentType: "" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.payment_type, "commission");
});

test('rule 14 — explicit "Commission" also maps to commission', () => {
  const r = parsePayment(raw({ paymentType: "commission" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.payment_type, "commission");
});

test("a bogus type is rejected", () => {
  const r = parsePayment(raw({ paymentType: "bonus" }));
  assert.equal(r.ok, false);
});

test("a blank reference note becomes null", () => {
  const r = parsePayment(raw({ referenceNote: "" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.reference_note, null);
});

test("a missing deal reference is rejected", () => {
  const r = parsePayment(raw({ dealId: "" }));
  assert.equal(r.ok, false);
});

test("a malformed date is rejected", () => {
  const r = parsePayment(raw({ paymentDate: "07/09/2026" }));
  assert.equal(r.ok, false);
});

test("an over-long note is rejected", () => {
  const r = parsePayment(raw({ referenceNote: "x".repeat(241) }));
  assert.equal(r.ok, false);
});
