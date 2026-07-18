import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveAnnualTarget,
  planYearTargetToInput,
  planYearTargetToTargetTableRow,
} from "@/lib/planning";
import type { PlanYearTarget } from "@/types/entities";

/**
 * M3.2 — the pure mappers from the stored plan_year_target row to the engine input
 * and the M6 Section-2 feed row. The feed row is the seam that lights up the
 * dashboard's derived ₱16,920,000 (m6_1Handoff).
 */

function makeRow(overrides: Partial<PlanYearTarget> = {}): PlanYearTarget {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    workspace_id: "11111111-1111-1111-1111-111111111111",
    year: 2026,
    net_income_target: "11500000.00",
    opex_pct: "0.2200",
    cos_pct: "0.1000",
    yield_override: null,
    avg_price_override: null,
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-18T00:00:00Z",
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

test("planYearTargetToInput maps every field 1:1, nulls preserved", () => {
  const input = planYearTargetToInput(
    makeRow({ yield_override: "0.04200000", avg_price_override: "7000000.00" })
  );
  assert.deepEqual(input, {
    year: 2026,
    netIncomeTarget: "11500000.00",
    opexPct: "0.2200",
    cosPct: "0.1000",
    yieldOverride: "0.04200000",
    avgPriceOverride: "7000000.00",
  });
});

test("the 2026 workbook row derives the working GCI goal ₱16,920,000 through the feed row", () => {
  const feedRow = planYearTargetToTargetTableRow(makeRow());
  assert.notEqual(feedRow, null);
  // The SAME code M6 Section-2 runs (FR-M3-11): NIT ÷ (1 − opex − cos), rounded up.
  assert.equal(deriveAnnualTarget(feedRow), "16920000.00");
});

test("a null-NIT year maps to a null feed row (rule 9 — not plannable, no M6 target)", () => {
  const feedRow = planYearTargetToTargetTableRow(makeRow({ net_income_target: null }));
  assert.equal(feedRow, null);
  // deriveAnnualTarget(null) is the "—" state — no error.
  assert.equal(deriveAnnualTarget(feedRow), null);
});

test("blank opex/cos on the feed row default to 0.22/0.10 (Rule P1) — same 16,920,000", () => {
  const feedRow = planYearTargetToTargetTableRow(
    makeRow({ opex_pct: null, cos_pct: null })
  );
  assert.notEqual(feedRow, null);
  assert.equal(feedRow?.opexPct, null);
  assert.equal(feedRow?.cosPct, null);
  assert.equal(deriveAnnualTarget(feedRow), "16920000.00");
});

test("an exact-multiple derived goal is unchanged (AC / test plan 9: NIT 13M, opex .25, cos .10 → 20,000,000)", () => {
  const feedRow = planYearTargetToTargetTableRow(
    makeRow({ net_income_target: "13000000.00", opex_pct: "0.2500", cos_pct: "0.1000" })
  );
  // 13,000,000 ÷ 0.65 = 20,000,000 exactly → ROUNDUP leaves it unchanged.
  assert.equal(deriveAnnualTarget(feedRow), "20000000.00");
});
