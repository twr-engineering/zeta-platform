import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySegment,
  isSalesSegment,
  unclassifiedDealCodes,
  type Segment,
} from "../../../src/lib/yield/index.ts";
import {
  REFERRER_DEAL,
  UNCLASSIFIED_DEAL,
  YIELD_DEALS,
} from "./fixtures.ts";

/**
 * M2.1 classifier — the single source of segment membership (PRD §3.2 / FR-M2-02).
 * Proven against the 21 workbook deals (PRD §9.0 appendix) plus the synthetic
 * Referrer and type-coupling-violation cases. 100% branch coverage on the guards.
 */

const EXPECTED_SEGMENT: Record<string, Segment> = {
  D001: "resale", D002: "resale", D003: "resale", D004: "resale",
  D005: "resale", D006: "resale", D007: "resale",
  D008: "developer", D009: "developer", D010: "developer", D011: "developer",
  D012: "developer", D013: "developer", D014: "developer", D015: "developer",
  D016: "developer", D021: "developer",
  D017: "rental", D018: "rental", D019: "rental", D020: "rental",
};

test("every workbook deal lands in its PRD §9.0 segment (7/10/4/0)", () => {
  const counts: Record<Segment, number> = {
    resale: 0, developer: 0, rental: 0, referral: 0,
  };
  for (const d of YIELD_DEALS) {
    const seg = classifySegment(d);
    assert.equal(seg, EXPECTED_SEGMENT[d.deal_code], `deal ${d.deal_code}`);
    if (seg) counts[seg] += 1;
  }
  assert.deepEqual(counts, { resale: 7, developer: 10, rental: 4, referral: 0 });
});

test("a Referrer deal is Referral regardless of transaction type", () => {
  assert.equal(classifySegment(REFERRER_DEAL), "referral");
  // Referrer wins over a Rental transaction too (any transaction type).
  assert.equal(
    classifySegment({
      transaction_type: "rental",
      deal_type: "n/a",
      representation: "referrer",
    }),
    "referral"
  );
});

test("Sale + deal_type N/A + non-Referrer is unclassified (Rule 9)", () => {
  assert.equal(classifySegment(UNCLASSIFIED_DEAL), null);
});

test("isSalesSegment is true only for Resale/Developer", () => {
  assert.equal(isSalesSegment("resale"), true);
  assert.equal(isSalesSegment("developer"), true);
  assert.equal(isSalesSegment("rental"), false);
  assert.equal(isSalesSegment("referral"), false);
  assert.equal(isSalesSegment(null), false);
});

test("partition invariant: clean workbook has zero unclassified", () => {
  assert.deepEqual(unclassifiedDealCodes(YIELD_DEALS), []);
  // count(segments) == count(non-archived) — the Rule 9 identity.
  const classified = YIELD_DEALS.filter((d) => classifySegment(d) !== null);
  assert.equal(classified.length, YIELD_DEALS.length);
});

test("partition invariant surfaces the offending deal code, never drops it", () => {
  const codes = unclassifiedDealCodes([...YIELD_DEALS, UNCLASSIFIED_DEAL]);
  assert.deepEqual(codes, ["DX99"]);
});

test("archived deals are excluded from the invariant (Rule 10)", () => {
  const archivedBad = { ...UNCLASSIFIED_DEAL, archived_at: "2026-01-01T00:00:00Z" };
  assert.deepEqual(unclassifiedDealCodes([...YIELD_DEALS, archivedBad]), []);
});
