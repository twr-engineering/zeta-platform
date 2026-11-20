import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildPlanningBasis,
  buildYieldReport,
  classifySegment,
  planningBasisFromAggregates,
  reportFromAggregates,
  type Segment,
  type YieldAggregateCell,
  type YieldDeal,
} from "@/lib/yield";
import { toMoney, ZERO, type MoneyValue } from "@/lib/money";

import { YIELD_DEALS, REFERRER_DEAL, deal } from "./fixtures";

/**
 * M2.2 — the materialized read model must produce numbers byte-identical to the M2.1
 * pure functions. `cellsFromDeals` is the pure mirror of the SQL aggregation
 * (app.recompute_yield_cell / reconcile's truth CTE): group non-archived, classified
 * deals by (segment, year) and sum the stored 2-dp values (Rule 8). Proving
 * `reportFromAggregates ∘ cellsFromDeals === buildYieldReport` here shows the reducer
 * is a faithful inverse of the aggregation; the live script proves the DB computes
 * those cells correctly.
 */
function sumOf(deals: readonly YieldDeal[], get: (d: YieldDeal) => string): string {
  return deals
    .reduce<MoneyValue>((acc, d) => acc.plus(toMoney(get(d))), ZERO)
    .toFixed(2);
}

function cellsFromDeals(deals: readonly YieldDeal[]): YieldAggregateCell[] {
  const active = deals.filter((d) => d.archived_at === null);
  const byKey = new Map<string, YieldDeal[]>();
  for (const d of active) {
    const seg = classifySegment(d);
    if (seg === null) continue; // unclassified belongs to no cell (Rule 9)
    const key = `${seg}:${d.booked_year}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(d);
  }
  return [...byKey.entries()].map(([key, group]) => {
    const [segment, year] = key.split(":");
    return {
      segment: segment as Segment,
      booked_year: Number(year),
      deal_count: group.length,
      volume_sum: sumOf(group, (d) => d.list_price),
      gci_sum: sumOf(group, (d) => d.net_gci),
      incentive_net_sum: sumOf(group, (d) => d.incentive_net),
      referral_out_sum: sumOf(group, (d) => d.referral_out),
    };
  });
}

test("reportFromAggregates ties to buildYieldReport (All) — every §9 value", () => {
  const cells = cellsFromDeals(YIELD_DEALS);
  const fromAgg = reportFromAggregates(cells, "all");
  const fromRaw = buildYieldReport(YIELD_DEALS, "all");
  assert.deepEqual(fromAgg, fromRaw);

  // Spot the anchor values so a failure names the number, not just "not equal".
  const subtotal = fromAgg.rows.find((r) => r.key === "sales_subtotal")!;
  assert.equal(subtotal.deals, 17);
  assert.equal(subtotal.volume, "159280945.00");
  assert.equal(subtotal.gci, "6488497.25");
  assert.equal(subtotal.realizedYield, "0.040736");
  assert.equal(fromAgg.blendedAvgPrice, "9369467.35");
  assert.equal(fromAgg.memoIncentives, "357142.87");
  assert.equal(fromAgg.memoReferralOuts, "-75000.00");
});

test("reportFromAggregates ties to buildYieldReport (2026 ≡ All)", () => {
  const cells = cellsFromDeals(YIELD_DEALS);
  assert.deepEqual(
    reportFromAggregates(cells, 2026),
    buildYieldReport(YIELD_DEALS, 2026)
  );
});

test("planningBasisFromAggregates ties to buildPlanningBasis (full precision)", () => {
  const cells = cellsFromDeals(YIELD_DEALS);
  const fromAgg = planningBasisFromAggregates(cells);
  assert.deepEqual(fromAgg, buildPlanningBasis(YIELD_DEALS));
  assert.equal(fromAgg.allTimeSalesDeals, 17);
  assert.equal(fromAgg.allTimeSalesVolume, "159280945.00");
  assert.equal(fromAgg.allTimeSalesGci, "6488497.25");
  // §3.4 identity: yield × price = gci ÷ deals = ₱381,676.31 (full precision).
  const fees = toMoney(fromAgg.allTimeYield!)
    .times(toMoney(fromAgg.allTimePrice!))
    .toFixed(2);
  assert.equal(fees, "381676.31");
});

test("archiving D021 restates the aggregate report + basis (criterion 8)", () => {
  const archived = YIELD_DEALS.map((d) =>
    d.deal_code === "D021" ? { ...d, archived_at: "2026-07-18T00:00:00Z" } : d
  );
  const cells = cellsFromDeals(archived);
  const report = reportFromAggregates(cells, "all");
  const subtotal = report.rows.find((r) => r.key === "sales_subtotal")!;
  assert.equal(subtotal.deals, 16);
  assert.equal(subtotal.volume, "151280945.00");
  assert.equal(subtotal.gci, "6133905.41");
  assert.equal(subtotal.realizedYield, "0.040546");

  const basis = planningBasisFromAggregates(cells);
  assert.equal(basis.allTimePrice, toMoney("151280945.00").dividedBy(16).toString());
  // ₱9,455,059.06 to display precision (PRD criterion 8).
  assert.equal(toMoney(basis.allTimePrice!).toFixed(2), "9455059.06");
  // And still ties to buildPlanningBasis over the same archived set.
  assert.deepEqual(basis, buildPlanningBasis(archived));
});

test("planning basis ignores the year filter; a 2027 deal only moves the filtered report", () => {
  const next = { ...deal("D001"), deal_code: "D001B", booked_year: 2027 };
  const withNextYear = [...YIELD_DEALS, next];
  const cells = cellsFromDeals(withNextYear);

  // Planning basis (all-time) picks up the extra sales deal → 18 deals.
  const basis = planningBasisFromAggregates(cells);
  assert.equal(basis.allTimeSalesDeals, 18);
  assert.deepEqual(basis, buildPlanningBasis(withNextYear));

  // The 2026 report is unchanged vs the clean workbook (the 2027 cell is filtered out).
  assert.deepEqual(
    reportFromAggregates(cells, 2026),
    buildYieldReport(YIELD_DEALS, 2026)
  );
  // The 2027 report shows exactly the one resale deal.
  const r2027 = reportFromAggregates(cells, 2027);
  const resale2027 = r2027.rows.find((r) => r.key === "resale")!;
  assert.equal(resale2027.deals, 1);
  assert.equal(resale2027.volume, "8721000.00");
});

test("a Referrer deal moves only the Referral row, never the sales blend (Rule 2)", () => {
  const cells = cellsFromDeals([...YIELD_DEALS, REFERRER_DEAL]);
  const report = reportFromAggregates(cells, "all");
  const referral = report.rows.find((r) => r.key === "referral")!;
  assert.equal(referral.deals, 1);
  assert.equal(referral.volume, "5000000.00");
  assert.equal(referral.gci, "50000.00");
  // Sales subtotal + planning basis are byte-identical to the clean workbook.
  const clean = cellsFromDeals(YIELD_DEALS);
  assert.deepEqual(
    report.rows.find((r) => r.key === "sales_subtotal"),
    reportFromAggregates(clean, "all").rows.find((r) => r.key === "sales_subtotal")
  );
  assert.deepEqual(
    planningBasisFromAggregates(cells),
    planningBasisFromAggregates(clean)
  );
});

test("empty aggregate → zeros/nulls, no division errors (Rule 5)", () => {
  const report = reportFromAggregates([], "all");
  assert.equal(report.rows.find((r) => r.key === "sales_subtotal")!.gci, "0.00");
  assert.equal(report.rows.find((r) => r.key === "sales_subtotal")!.realizedYield, null);
  assert.equal(report.blendedAvgPrice, null);
  const basis = planningBasisFromAggregates([]);
  assert.equal(basis.allTimeYield, null);
  assert.equal(basis.allTimePrice, null);
  assert.equal(basis.allTimeSalesDeals, 0);
});
