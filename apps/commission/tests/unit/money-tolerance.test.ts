import test from "node:test";
import assert from "node:assert/strict";

import {
  withinTolerance,
  equalsToCentavo,
  TOLERANCE_PHP,
} from "@/lib/money";

/**
 * M5.4 (M5 PRD rule 13 / edge case 15; Master PRD §4.3) — the ₱0.50-tolerance
 * reconciliation helpers Data Health compares totals with. Float equality is
 * FORBIDDEN in money paths: the helpers take decimal STRINGS and compare exact
 * decimals, and these tests pin the ±₱0.50 boundary (inclusive) so a reconciliation
 * that should tie does, and one that should flag does.
 */

test("the module ships a ₱0.50 tolerance constant", () => {
  assert.equal(TOLERANCE_PHP, "0.50");
});

test("withinTolerance: exact agreement is within tolerance", () => {
  assert.equal(withinTolerance("4855304.39", "4855304.39"), true);
});

test("withinTolerance: the ±₱0.50 boundary is inclusive", () => {
  // Exactly 0.50 apart in either direction still ties (≤, not <).
  assert.equal(withinTolerance("100.00", "100.50"), true);
  assert.equal(withinTolerance("100.50", "100.00"), true);
});

test("withinTolerance: more than ₱0.50 apart does not tie", () => {
  assert.equal(withinTolerance("100.00", "100.51"), false);
  assert.equal(withinTolerance("100.51", "100.00"), false);
});

test("withinTolerance: a tighter tolerance can be supplied (e.g. ₱0.01 rows)", () => {
  assert.equal(withinTolerance("100.00", "100.01", "0.01"), true);
  assert.equal(withinTolerance("100.00", "100.02", "0.01"), false);
});

test("withinTolerance survives values a binary float would corrupt", () => {
  // 0.1 + 0.2 !== 0.3 in float; as exact decimals the difference is 0, well
  // within tolerance. Proves the comparison never routes through Number.
  assert.equal(withinTolerance("0.3", "0.30000000000000004"), true);
  // And a genuine 0.50 gap on the same messy inputs is still caught.
  assert.equal(withinTolerance("0.30000000000000004", "0.81"), false);
});

test("equalsToCentavo: exact-to-the-centavo, independent of trailing scale", () => {
  assert.equal(equalsToCentavo("354591.84", "354591.8400"), true);
  assert.equal(equalsToCentavo("354591.84", "354591.85"), false);
});
