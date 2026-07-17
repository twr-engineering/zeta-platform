import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  computeDealWarnings,
  representationMismatch,
  type DuplicateMatch,
} from "@/lib/deals/deal-warnings";
import type { DealComputeInput } from "@/lib/engine";

/**
 * M1.3 — the soft-warnings engine (FR-M1-11). Pure predicates, so they are
 * tested here without a database; the duplicate list is injected.
 */

function baseInput(overrides: Partial<DealComputeInput> = {}): DealComputeInput {
  return {
    deal_type: "resale",
    transaction_type: "sale",
    representation: "double_ended",
    force_vat: false,
    property_vat_rule: "threshold",
    list_price: "1000000",
    commission: { basis: "percent", rate: "0.05" },
    developer_comm_base: null,
    receipt_issued: false,
    incentive_billed: "0",
    incentive_taxable: null,
    referral_out_pct: "0",
    referral_out_fixed: "0",
    ...overrides,
  };
}

test("representation mismatch: rental roles on a Sale warn", () => {
  assert.ok(representationMismatch({ transaction_type: "sale", representation: "lessor" }));
  assert.ok(representationMismatch({ transaction_type: "sale", representation: "lessee" }));
});

test("representation mismatch: sale roles on a Rental warn", () => {
  assert.ok(representationMismatch({ transaction_type: "rental", representation: "seller" }));
  assert.ok(representationMismatch({ transaction_type: "rental", representation: "buyer" }));
});

test("representation mismatch: Double Ended and Referrer are fine on either", () => {
  assert.equal(representationMismatch({ transaction_type: "sale", representation: "double_ended" }), null);
  assert.equal(representationMismatch({ transaction_type: "rental", representation: "lessor" }), null);
  assert.equal(representationMismatch({ transaction_type: "sale", representation: "referrer" }), null);
});

test("split-at-source: one-sided resale with a referral out warns (edge case 16)", () => {
  const warnings = computeDealWarnings(
    baseInput({ representation: "buyer", referral_out_fixed: "20000" })
  );
  assert.ok(warnings.some((w) => w.key === "split_at_source"));
});

test("split-at-source: a double-ended resale with a referral out does not warn", () => {
  const warnings = computeDealWarnings(
    baseInput({ representation: "double_ended", referral_out_fixed: "20000" })
  );
  assert.ok(!warnings.some((w) => w.key === "split_at_source"));
});

test("duplicate: a supplied match surfaces a duplicate warning naming the code", () => {
  const dupes: DuplicateMatch[] = [{ deal_code: "D013", booked_date: "2026-06-30" }];
  const warnings = computeDealWarnings(baseInput(), dupes);
  const dupe = warnings.find((w) => w.key === "duplicate");
  assert.ok(dupe);
  assert.ok(dupe.message.includes("D013"));
});

test("a clean developer deal produces no warnings", () => {
  const warnings = computeDealWarnings(
    baseInput({
      deal_type: "developer",
      representation: "double_ended",
      developer_comm_base: "net",
      receipt_issued: true,
    })
  );
  assert.equal(warnings.length, 0);
});

test("warnings keep a stable order: duplicate, split, mismatch", () => {
  const warnings = computeDealWarnings(
    baseInput({
      transaction_type: "sale",
      representation: "lessor", // mismatch
    }),
    [{ deal_code: "D001", booked_date: "2026-01-01" }]
  );
  assert.deepEqual(
    warnings.map((w) => w.key),
    ["duplicate", "representation_mismatch"]
  );
});
