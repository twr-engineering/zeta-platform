import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildPlanningBasis,
  toPlanningBasisContract,
  type BasisVersionStamp,
} from "@/lib/yield";
import { toMoney } from "@/lib/money";

import { YIELD_DEALS } from "./fixtures";
import {
  EMPTY_PLANNING_BASIS,
  WORKBOOK_PLANNING_BASIS,
  WORKBOOK_PLANNING_BASIS_D021_ARCHIVED,
} from "../../doubles/planning-basis";

/**
 * M2.3 — the PlanningBasis API precision proof (PRD §3.4, Milestones DoD). These
 * exercise the exact contract mapper the server hands to M3 (`toPlanningBasisContract`
 * over the pure §3.4 basis), so the identity is asserted through the API shape M3
 * actually consumes — not just the internal PlanningBasis. The live path (DB cells →
 * getPlanningBasis) is proven end-to-end in scripts/live-m23-check.mts; here the
 * arithmetic contract is pinned with no database at all.
 */

const STAMP: BasisVersionStamp = {
  basisVersion: 1,
  computedAt: "2026-07-18T00:00:00.000Z",
};

test("§3.4 identity holds THROUGH the contract: yield × price = ₱381,676.31", () => {
  const contract = toPlanningBasisContract(
    buildPlanningBasis(YIELD_DEALS),
    STAMP
  );

  // The anchor numbers, as the wire strings M3 reads.
  assert.equal(contract.all_time_sales_deals, 17);
  assert.equal(contract.all_time_sales_volume, "159280945.00");
  assert.equal(contract.all_time_sales_gci, "6488497.25");
  assert.equal(
    contract.all_time_yield,
    "0.04073618002454719238387240859"
  );
  assert.equal(contract.all_time_price, "9369467.352941176470588235294");

  // M3's Professional Fees per deal, computed from the API values exactly as M3 will.
  const fees = toMoney(contract.all_time_yield!)
    .times(toMoney(contract.all_time_price!))
    .toFixed(2);
  assert.equal(fees, "381676.31");

  // And it ties to gci ÷ deals — the identity's other side (§3.4).
  assert.equal(
    toMoney(contract.all_time_sales_gci).dividedBy(17).toFixed(2),
    "381676.31"
  );
});

test("the display-rounded path is WRONG — the contract must carry full precision", () => {
  const contract = toPlanningBasisContract(
    buildPlanningBasis(YIELD_DEALS),
    STAMP
  );

  // Round the ratios to what the screen shows (yield 4.0736%, price ₱9,369,467.35)
  // and the identity drifts ₱1.69 — the exact failure Rule 7 / §3.4 warns about, and
  // the reason all_time_yield / all_time_price are handed over unrounded.
  const rounded = toMoney(contract.all_time_yield!)
    .toDecimalPlaces(6)
    .times(toMoney(contract.all_time_price!).toDecimalPlaces(2))
    .toFixed(2);
  assert.equal(rounded, "381674.62");
  assert.notEqual(rounded, "381676.31");
});

test("criterion 8 through the contract: archiving D021 → 16 / 4.0546% / ₱9,455,059.06", () => {
  const archived = YIELD_DEALS.map((d) =>
    d.deal_code === "D021" ? { ...d, archived_at: "2026-07-18T00:00:00Z" } : d
  );
  const contract = toPlanningBasisContract(buildPlanningBasis(archived), {
    basisVersion: 2,
    computedAt: STAMP.computedAt,
  });

  assert.equal(contract.all_time_sales_deals, 16);
  assert.equal(contract.all_time_sales_volume, "151280945.00");
  assert.equal(contract.all_time_sales_gci, "6133905.41");
  assert.equal(toMoney(contract.all_time_price!).toFixed(2), "9455059.06");
  assert.equal(toMoney(contract.all_time_yield!).toFixed(4), "0.0405");
  assert.equal(contract.basis_version, 2);
});

test("criterion 11: no sales deals → nulls, version PRESENT", () => {
  // A version row can exist even with no sales (e.g. all sales later archived), so
  // prove both the numbers null out and the version passes through.
  const contract = toPlanningBasisContract(buildPlanningBasis([]), {
    basisVersion: 3,
    computedAt: STAMP.computedAt,
  });
  assert.equal(contract.all_time_yield, null);
  assert.equal(contract.all_time_price, null);
  assert.equal(contract.all_time_sales_deals, 0);
  assert.equal(contract.all_time_sales_volume, "0.00");
  assert.equal(contract.all_time_sales_gci, "0.00");
  assert.equal(contract.basis_version, 3);
  assert.equal(contract.computed_at, STAMP.computedAt);
});

test("a brand-new workspace (no version row) → basis_version 0 / computed_at null", () => {
  // The mapper is total: a null stamp becomes the always-present zero token, so M3
  // never has to special-case a missing version.
  const contract = toPlanningBasisContract(buildPlanningBasis([]), null);
  assert.equal(contract.basis_version, 0);
  assert.equal(contract.computed_at, null);
  assert.equal(contract.all_time_yield, null);
  assert.equal(contract.all_time_price, null);
});

test("the consumer test double is byte-identical to the real contract (no drift)", () => {
  // The numbers M3's double carries must be exactly what getPlanningBasis emits.
  // We pin the value fields to the mapper output; version/computed_at are the
  // double's chosen fixture stamps (asserted here so a careless edit is caught).
  const workbook = toPlanningBasisContract(buildPlanningBasis(YIELD_DEALS), {
    basisVersion: WORKBOOK_PLANNING_BASIS.basis_version,
    computedAt: WORKBOOK_PLANNING_BASIS.computed_at!,
  });
  assert.deepEqual(workbook, WORKBOOK_PLANNING_BASIS);

  const archived = YIELD_DEALS.map((d) =>
    d.deal_code === "D021" ? { ...d, archived_at: "2026-07-18T00:00:00Z" } : d
  );
  const d021 = toPlanningBasisContract(buildPlanningBasis(archived), {
    basisVersion: WORKBOOK_PLANNING_BASIS_D021_ARCHIVED.basis_version,
    computedAt: WORKBOOK_PLANNING_BASIS_D021_ARCHIVED.computed_at!,
  });
  assert.deepEqual(d021, WORKBOOK_PLANNING_BASIS_D021_ARCHIVED);

  const empty = toPlanningBasisContract(buildPlanningBasis([]), null);
  assert.deepEqual(empty, EMPTY_PLANNING_BASIS);
});
