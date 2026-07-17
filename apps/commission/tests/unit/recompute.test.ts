import test from "node:test";
import assert from "node:assert/strict";

import { taxRestatingCount } from "../../src/lib/settings/recompute.ts";
import type { TaxField } from "../../src/lib/settings/tax.ts";

/**
 * M1.5 — the tax confirmation's affected-deal count selection.
 *
 * The server computes two counts (rate = every taxable deal; threshold =
 * threshold-rule developer deals); this pure helper picks the honest one for the
 * fields actually being changed. The invariant worth pinning: threshold-rule
 * developer deals are a SUBSET of the taxable deals, so a combined change is the
 * rate count, never a sum — a sum would double-count and lie.
 */

const counts = { rate: 12, threshold: 3 };

test("a vat_rate change shows the taxable count", () => {
  assert.equal(taxRestatingCount(["vat_rate"], counts), 12);
});

test("an ewt_rate change shows the taxable count", () => {
  assert.equal(taxRestatingCount(["ewt_rate"], counts), 12);
});

test("a vat_registered change shows the taxable count", () => {
  assert.equal(taxRestatingCount(["vat_registered"], counts), 12);
});

test("a threshold-only change shows the threshold count", () => {
  assert.equal(taxRestatingCount(["property_vat_threshold"], counts), 3);
});

test("a combined rate + threshold change is the rate count, not the sum", () => {
  // threshold deals ⊆ taxable deals, so the union is exactly `rate`.
  const fields: TaxField[] = ["ewt_rate", "property_vat_threshold"];
  assert.equal(taxRestatingCount(fields, counts), 12);
  assert.notEqual(taxRestatingCount(fields, counts), counts.rate + counts.threshold);
});

test("no restating field means nothing is restated", () => {
  assert.equal(taxRestatingCount([], counts), 0);
});
