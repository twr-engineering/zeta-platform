import test from "node:test";
import assert from "node:assert/strict";

import {
  computePlan,
  planToRows,
  DEFAULT_FUNNEL_RATES,
  type PlanExportRow,
  type PlanResult,
  type PlanYearTargetInput,
} from "@/lib/planning";
import { WORKBOOK_PLANNING_BASIS } from "../../doubles/planning-basis";

/**
 * M3.3/M3.4 — the plan export flattening (FR-M3-12). Asserts the §10 / §9.1 fixtures
 * survive the flatten to the centavo, so the CSV/XLSX download ties to the screen
 * (AC8-style). The pace lines carry the live Rule P12 YTD + P13 balance when an aggregate
 * is supplied, and fall back to null with a "no read" note when it is not (defensive).
 */

const TARGET_2026: PlanYearTargetInput = {
  year: 2026,
  netIncomeTarget: "11500000",
  opexPct: null,
  cosPct: null,
  yieldOverride: null,
  avgPriceOverride: null,
};

function rowsFor(target: PlanYearTargetInput): PlanExportRow[] {
  const result: PlanResult = computePlan(target, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS);
  assert.equal(result.ok, true, `expected a plan: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  return planToRows(result.plan);
}

const rows = rowsFor(TARGET_2026);
const byLine = (line: string): PlanExportRow => {
  const row = rows.find((r) => r.line === line);
  assert.ok(row, `no export row "${line}"`);
  return row!;
};

test("economic model rows reproduce the §9.1 fixtures", () => {
  assert.equal(byLine("GCI raw target").yearly, "16911764.71");

  const goal = byLine("Working GCI goal");
  assert.equal(goal.yearly, "16920000.00");
  assert.equal(goal.monthly, "1410000.00");
  assert.equal(goal.weekly, "352500.00");

  const netPct = byLine("Net income %");
  assert.match(netPct.detail ?? "", /68\.00%/);
  assert.match(netPct.detail ?? "", /\(default\)/);
});

test("assumptions rows carry fees per deal + a source-labelled yield (no ÷1.12)", () => {
  assert.equal(byLine("Professional fees per deal").yearly, "381676.31");
  const yieldRow = byLine("Blended yield");
  assert.match(yieldRow.detail ?? "", /4\.0736%/);
  assert.match(yieldRow.detail ?? "", /All-time realized/);
});

test("deal + funnel counts flatten at full-precision 2-dp (Rules P7/P9/P10)", () => {
  assert.equal(byLine("Listings SOLD (deals)").yearly, "44.33");
  assert.equal(byLine("Buyer ATP (deals)").yearly, "44.33");

  const sellerLeads = byLine("Seller funnel: Seller Leads");
  assert.equal(sellerLeads.yearly, "4221.98");
  assert.equal(sellerLeads.weekly, "87.96");
  assert.equal(sellerLeads.detail, "÷ 20%");

  assert.equal(byLine("Buyer funnel: Buyer Leads").yearly, "2110.99");
  assert.equal(byLine("Seller funnel: Listings to take").yearly, "177.32");
});

test("pace: Total Sales real; YTD + Balance null (defensive) without an aggregate", () => {
  assert.equal(byLine("Total Sales required").yearly, "415355587.83");

  const ytd = byLine("YTD actual booked");
  assert.equal(ytd.yearly, null);
  assert.match(ytd.detail ?? "", /no booked-sales read/);

  const balance = byLine("Balance to target");
  assert.equal(balance.yearly, null);
  assert.match(balance.detail ?? "", /no booked-sales read/);
});

test("M3.4 — pace lines carry the live Rule P12 YTD + P13 balance when supplied", () => {
  // Updated: M3.4 wires the aggregate through; the export loader always supplies it. 2026-07-18
  const result = computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS, {
    ytdActualSales: "161680945.00",
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  const wired = planToRows(result.plan);
  const line = (l: string) => wired.find((r) => r.line === l)!;

  assert.equal(line("YTD actual booked").yearly, "161680945.00");
  assert.match(line("YTD actual booked").detail ?? "", /sales \+ rentals/);
  assert.equal(line("Balance to target").yearly, "253674642.83");
  assert.match(line("Balance to target").detail ?? "", /Total Sales required − YTD actual/);
});
