import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSearchText,
  escapeLikePattern,
} from "../../../src/lib/search/normalize.ts";

// PRD §3.3 / Rule 4 / M9 test plan #1 — normalization contract.

test("normalize — trailing/duplicate whitespace and case fold to one form", () => {
  // The live workbook carries trailing-space values (e.g. "Ventura Residences ").
  assert.equal(normalizeSearchText("Ventura Residences "), "ventura residences");
  assert.equal(normalizeSearchText("  ventura   residences   "), "ventura residences");
  assert.equal(
    normalizeSearchText("Ventura Residences "),
    normalizeSearchText("  ventura   residences   ")
  );
});

test("normalize — diacritics fold (Peñafrancia ↔ penafrancia)", () => {
  assert.equal(normalizeSearchText("Peñafrancia"), "penafrancia");
  assert.equal(normalizeSearchText("PEÑAFRANCIA"), normalizeSearchText("penafrancia"));
});

test("normalize — empty / whitespace-only becomes empty (no-filter sentinel)", () => {
  assert.equal(normalizeSearchText(""), "");
  assert.equal(normalizeSearchText("   \t \n "), "");
});

test("escapeLikePattern — %, _ and backslash become literals (Rule 12)", () => {
  assert.equal(escapeLikePattern("100%"), "100\\%");
  assert.equal(escapeLikePattern("unit_2"), "unit\\_2");
  assert.equal(escapeLikePattern("a\\b"), "a\\\\b");
  // Normalization still applies before escaping.
  assert.equal(escapeLikePattern("  50%  OFF "), "50\\% off");
});
