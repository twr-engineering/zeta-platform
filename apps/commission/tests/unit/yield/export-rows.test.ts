import test from "node:test";
import assert from "node:assert/strict";

import {
  buildYieldReport,
  buildPlanningBasis,
  classifySegment,
  type ClassifiableDeal,
} from "../../../src/lib/yield/index.ts";
import {
  yieldReportToRows,
  type YieldExportRow,
} from "../../../src/lib/yield/export-rows.ts";
import { YIELD_DEALS } from "./fixtures.ts";

/**
 * M2.4 — the Yield Summary export rows (FR-M2-09). The flattening is pure, so it is
 * asserted here against the §9 fixtures directly: money 2 dp, yields 4 dp (§7 — the
 * export carries the finer figure the 2-dp screen hides), share 2 dp, and the
 * planning-basis lines ALWAYS all-time regardless of the report's year filter (Rule 4).
 */

function rowsFor(yearFilter: number | "all"): YieldExportRow[] {
  return yieldReportToRows(
    buildYieldReport(YIELD_DEALS, yearFilter),
    buildPlanningBasis(YIELD_DEALS)
  );
}

function line(rows: YieldExportRow[], label: string): YieldExportRow {
  const found = rows.find((r) => r.line === label);
  assert.ok(found, `export row "${label}" present`);
  return found;
}

test("segment rows reproduce the §9 fixtures (money 2dp, yields 4dp, share 2dp)", () => {
  const rows = rowsFor(2026);

  assert.deepEqual(line(rows, "Resale"), {
    line: "Resale",
    deals: 7,
    volume: "55251000.00",
    gci: "2687550.00",
    realizedYield: "4.8643%",
    shareOfSales: "34.69%",
  });
  assert.deepEqual(line(rows, "Developer"), {
    line: "Developer",
    deals: 10,
    volume: "104029945.00",
    gci: "3800947.25",
    realizedYield: "3.6537%",
    shareOfSales: "65.31%",
  });
  assert.deepEqual(line(rows, "SALES SUBTOTAL"), {
    line: "SALES SUBTOTAL",
    deals: 17,
    volume: "159280945.00",
    gci: "6488497.25",
    realizedYield: "4.0736%",
    shareOfSales: "100.00%",
  });
  // Rental: yield 8.3333%, share NEVER part of the sales mix ("—" ⇒ null).
  assert.deepEqual(line(rows, "Rental (on rent)"), {
    line: "Rental (on rent)",
    deals: 4,
    volume: "2400000.00",
    gci: "200000.00",
    realizedYield: "8.3333%",
    shareOfSales: null,
  });
  // Referral empty: zeros, undefined yield + share.
  assert.deepEqual(line(rows, "Referral (fees)"), {
    line: "Referral (fees)",
    deals: 0,
    volume: "0.00",
    gci: "0.00",
    realizedYield: null,
    shareOfSales: null,
  });
});

test("total, memos and averages reproduce §9 (memo referral-out stays signed)", () => {
  const rows = rowsFor(2026);
  assert.equal(line(rows, "TOTAL GCI (ALL OPERATIONS)").gci, "6688497.25");
  assert.equal(line(rows, "Incentives (+) — memo, already inside the GCI above").gci, "357142.87");
  assert.equal(line(rows, "Referral-outs (−) — memo, already inside the GCI above").gci, "-75000.00");
  assert.equal(line(rows, "Resale avg price").volume, "7893000.00");
  assert.equal(line(rows, "Developer avg price").volume, "10402994.50");
  assert.equal(line(rows, "BLENDED SALE avg price → feeds calculator").volume, "9369467.35");
  assert.equal(line(rows, "Rental annual GCI (YTD)").gci, "200000.00");
});

test("planning-basis lines are all-time and display-rounded (yield 4dp, price 2dp)", () => {
  const rows = rowsFor(2026);
  assert.deepEqual(line(rows, "PLANNING BASIS — All-time sales (ignores the year filter)"), {
    line: "PLANNING BASIS — All-time sales (ignores the year filter)",
    deals: 17,
    volume: "159280945.00",
    gci: "6488497.25",
    realizedYield: null,
    shareOfSales: null,
  });
  assert.equal(line(rows, "PLANNING BASIS — All-time blended yield (AllTimeYield)").realizedYield, "4.0736%");
  // Full-precision 9369467.3529… rounds to the displayed ₱9,369,467.35 in the export.
  assert.equal(line(rows, "PLANNING BASIS — All-time blended avg price (AllTimePrice)").volume, "9369467.35");
});

test("Rule 4: an empty report year zeroes the table but the planning basis is unmoved", () => {
  const rows = rowsFor(2027); // no deals booked 2027

  assert.deepEqual(line(rows, "SALES SUBTOTAL"), {
    line: "SALES SUBTOTAL",
    deals: 0,
    volume: "0.00",
    gci: "0.00",
    realizedYield: null,
    shareOfSales: null,
  });
  // Planning basis lines are byte-identical to the populated year.
  assert.equal(line(rows, "PLANNING BASIS — All-time blended yield (AllTimeYield)").realizedYield, "4.0736%");
  assert.equal(line(rows, "PLANNING BASIS — All-time blended avg price (AllTimePrice)").volume, "9369467.35");
  assert.equal(line(rows, "PLANNING BASIS — All-time sales (ignores the year filter)").deals, 17);
});

/**
 * Drill-through parity (FR-M2-12): the deal list resolves a segment URL param through
 * the SAME classifier, so a segment row lands on exactly its deals (7 / 10 / 4 / 0),
 * and "sales" is the SALES SUBTOTAL population (17). This is the predicate both the
 * deal list and the deals export use.
 */
function inSegment(deal: ClassifiableDeal, segment: string): boolean {
  const seg = classifySegment(deal);
  if (segment === "sales") return seg === "resale" || seg === "developer";
  return seg === segment;
}

test("segment drill-through selects exactly the segment's deals", () => {
  const count = (segment: string) => YIELD_DEALS.filter((d) => inSegment(d, segment)).length;
  assert.equal(count("resale"), 7);
  assert.equal(count("developer"), 10);
  assert.equal(count("sales"), 17);
  assert.equal(count("rental"), 4);
  assert.equal(count("referral"), 0);
});
