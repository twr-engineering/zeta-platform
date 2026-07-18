import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlanningBasis,
  buildYieldReport,
  type ReportRowKey,
  type SegmentRow,
  type YieldSummaryReport,
} from "../../../src/lib/yield/index.ts";
import { toMoney, roundCentavos } from "../../../src/lib/money/index.ts";
import { REFERRER_DEAL, YIELD_DEALS } from "./fixtures.ts";

/**
 * M2.1 report + planning basis, proven against the v30.20 workbook (PRD §9
 * criteria 1–8). Every money figure to the centavo; every rate to 4 dp percent
 * (6-dp rate). The `All` and `2026` filters coincide (all 21 deals booked 2026),
 * so both are asserted where the PRD says they must match.
 */

function rowOf(report: YieldSummaryReport, key: ReportRowKey): SegmentRow {
  const row = report.rows.find((r) => r.key === key);
  assert.ok(row, `row ${key} present`);
  return row;
}

/** A 6-dp rate → its 4-dp percent string (e.g. "0.048643" → "4.8643"). */
function pct4(rate: string | null): string | null {
  return rate === null ? null : toMoney(rate).times(100).toFixed(4);
}
/** A 6-dp rate → its 2-dp percent string (e.g. "0.346878" → "34.69"). */
function pct2(rate: string | null): string | null {
  return rate === null ? null : toMoney(rate).times(100).toFixed(2);
}

// --- criterion 1: the five segment rows (All ≡ 2026) -------------------------

for (const filter of ["all", 2026] as const) {
  test(`segment table reads exactly per PRD criterion 1 (filter=${filter})`, () => {
    const report = buildYieldReport(YIELD_DEALS, filter);

    const resale = rowOf(report, "resale");
    assert.equal(resale.deals, 7);
    assert.equal(resale.volume, "55251000.00");
    assert.equal(resale.gci, "2687550.00");
    assert.equal(pct4(resale.realizedYield), "4.8643");
    assert.equal(pct2(resale.shareOfSales), "34.69");

    const developer = rowOf(report, "developer");
    assert.equal(developer.deals, 10);
    assert.equal(developer.volume, "104029945.00");
    assert.equal(developer.gci, "3800947.25");
    assert.equal(pct4(developer.realizedYield), "3.6537");
    assert.equal(pct2(developer.shareOfSales), "65.31");

    const subtotal = rowOf(report, "sales_subtotal");
    assert.equal(subtotal.deals, 17);
    assert.equal(subtotal.volume, "159280945.00");
    assert.equal(subtotal.gci, "6488497.25");
    assert.equal(pct4(subtotal.realizedYield), "4.0736");
    assert.equal(pct2(subtotal.shareOfSales), "100.00");

    const rental = rowOf(report, "rental");
    assert.equal(rental.deals, 4);
    assert.equal(rental.volume, "2400000.00");
    assert.equal(rental.gci, "200000.00");
    assert.equal(pct4(rental.realizedYield), "8.3333");
    assert.equal(rental.shareOfSales, null); // Rental Share of Sales is "—" (Rule 12)

    const referral = rowOf(report, "referral");
    assert.equal(referral.deals, 0);
    assert.equal(referral.volume, "0.00");
    assert.equal(referral.gci, "0.00");
    assert.equal(referral.realizedYield, null); // volume 0 ⇒ "—" (Rule 5)
    assert.equal(referral.shareOfSales, null);

    assert.deepEqual(report.unclassified, []);
  });
}

// --- criterion 2: total + memos ---------------------------------------------

test("TOTAL GCI + memos per PRD criterion 2 (Rule 8 stored-value sum)", () => {
  const r = buildYieldReport(YIELD_DEALS, "all");
  assert.equal(r.totalGciAllOps, "6688497.25");
  // ₱357,142.87 from STORED 2-dp values; the sheet's full-precision sum is
  // ₱357,142.86 — the documented ₱0.01 Rule 8 consequence, asserted below.
  assert.equal(r.memoIncentives, "357142.87");
  assert.equal(r.memoReferralOuts, "-75000.00");
});

test("Rule 8 — stored-value incentive sum (.87) differs from full-precision (.86)", () => {
  // Full-precision path: each developer incentive is billed ÷ 1.12 summed BEFORE
  // rounding. It lands on 357142.86 — one centavo under the stored-value memo.
  const billed: Record<string, string> = {
    D008: "45000", D010: "40000", D013: "145000",
    D014: "95000", D015: "15000", D016: "20000", D021: "40000",
  };
  const fullPrecision = Object.values(billed)
    .reduce((acc, b) => acc.plus(toMoney(b).dividedBy("1.12")), toMoney("0"))
    .toDecimalPlaces(2);
  assert.equal(fullPrecision.toFixed(2), "357142.86");
  assert.notEqual(fullPrecision.toFixed(2), "357142.87");
});

// --- criterion 3: average prices --------------------------------------------

test("average-price block per PRD criterion 3", () => {
  const r = buildYieldReport(YIELD_DEALS, "all");
  assert.equal(r.resaleAvgPrice, "7893000.00");
  assert.equal(r.developerAvgPrice, "10402994.50");
  assert.equal(r.blendedAvgPrice, "9369467.35"); // 159,280,945 ÷ 17
  assert.equal(r.rentalAnnualGci, "200000.00");
});

// --- criterion 4: planning basis + the M3 identity (Rule 7) ------------------

test("planning basis is full precision and reproduces the M3 fees-per-deal identity", () => {
  const b = buildPlanningBasis(YIELD_DEALS);
  assert.equal(b.allTimeSalesDeals, 17);
  assert.equal(b.allTimeSalesVolume, "159280945.00");
  assert.equal(b.allTimeSalesGci, "6488497.25");

  // Full precision — the displayed 4 dp is 4.0736% / ₱9,369,467.35.
  assert.ok(b.allTimeYield!.startsWith("0.040736180"), b.allTimeYield!);
  assert.ok(b.allTimePrice!.startsWith("9369467.3529"), b.allTimePrice!);
  assert.equal(toMoney(b.allTimeYield!).times(100).toFixed(4), "4.0736");
  assert.equal(roundCentavos(b.allTimePrice!).toFixed(2), "9369467.35");

  // §3.4 identity: yield × price = gci ÷ deals = ₱381,676.31 (M3 anchor).
  const feesPerDeal = toMoney(b.allTimeYield!).times(toMoney(b.allTimePrice!));
  assert.equal(roundCentavos(feesPerDeal).toFixed(2), "381676.31");
  assert.equal(roundCentavos(toMoney("6488497.25").dividedBy(17)).toFixed(2), "381676.31");
});

test("Rule 7 — display-rounding the yield first breaks the identity by ₱1.69", () => {
  // The WRONG path: 4.0736% (0.040736) × ₱9,369,467.35 = ₱381,674.62.
  const wrong = toMoney("0.040736").times("9369467.35");
  assert.equal(roundCentavos(wrong).toFixed(2), "381674.62");
});

// --- criterion 5: empty filter year (zeros, not errors; basis unmoved) -------

test("filter year with no deals zeroes the table but not the planning basis", () => {
  const report = buildYieldReport(YIELD_DEALS, 2027);
  for (const key of ["resale", "developer", "sales_subtotal", "rental", "referral"] as const) {
    const row = rowOf(report, key);
    assert.equal(row.deals, 0);
    assert.equal(row.volume, "0.00");
    assert.equal(row.gci, "0.00");
    assert.equal(row.realizedYield, null);
    assert.equal(row.shareOfSales, null);
  }
  assert.equal(report.totalGciAllOps, "0.00");
  assert.equal(report.memoIncentives, "0.00");
  assert.equal(report.memoReferralOuts, "0.00"); // no "-0.00"
  assert.equal(report.resaleAvgPrice, null);
  assert.equal(report.blendedAvgPrice, null);

  // The basis IGNORES the filter — still 4.0736% / ₱9,369,467.35 (Rule 4).
  const b = buildPlanningBasis(YIELD_DEALS);
  assert.equal(b.allTimeSalesDeals, 17);
  assert.equal(toMoney(b.allTimeYield!).times(100).toFixed(4), "4.0736");
});

// --- criterion 6: Referrer deal moves NO sales number ------------------------

test("a Referrer deal appears only on the Referral row; sales rows unchanged", () => {
  const base = buildYieldReport(YIELD_DEALS, "all");
  const withRef = buildYieldReport([...YIELD_DEALS, REFERRER_DEAL], "all");

  const ref = rowOf(withRef, "referral");
  assert.equal(ref.deals, 1);
  assert.equal(ref.volume, "5000000.00");
  assert.equal(ref.gci, "50000.00");
  assert.equal(pct4(ref.realizedYield), "1.0000"); // 50,000 ÷ 5,000,000
  assert.equal(ref.shareOfSales, null);

  // Resale + SALES SUBTOTAL byte-identical to criterion 1.
  assert.deepEqual(rowOf(withRef, "resale"), rowOf(base, "resale"));
  assert.deepEqual(rowOf(withRef, "sales_subtotal"), rowOf(base, "sales_subtotal"));

  // TOTAL GCI rises by the referral fee; blended yield untouched.
  assert.equal(withRef.totalGciAllOps, "6738497.25");
  const b = buildPlanningBasis([...YIELD_DEALS, REFERRER_DEAL]);
  assert.equal(toMoney(b.allTimeYield!).times(100).toFixed(4), "4.0736");
  assert.equal(b.allTimeSalesDeals, 17);
});

// --- criterion 7: rentals excluded from the sales blend ----------------------

test("rentals never contaminate the SALES SUBTOTAL yield", () => {
  const r = buildYieldReport(YIELD_DEALS, "all");
  const subtotal = rowOf(r, "sales_subtotal");
  assert.equal(pct4(subtotal.realizedYield), "4.0736");

  // The contaminated blend (rentals folded in) would read ~4.1369% — assert the
  // real subtotal is NOT that value.
  const contaminated = toMoney("6688497.25").dividedBy("161680945").toFixed(6);
  assert.notEqual(subtotal.realizedYield, contaminated);
});

// --- criterion 8: archive D021 restates the subtotal + basis -----------------

test("archiving D021 restates SALES SUBTOTAL and AllTimePrice (criterion 8)", () => {
  const archived = YIELD_DEALS.map((d) =>
    d.deal_code === "D021" ? { ...d, archived_at: "2026-06-01T00:00:00Z" } : d
  );
  const r = buildYieldReport(archived, "all");
  const subtotal = rowOf(r, "sales_subtotal");
  assert.equal(subtotal.deals, 16);
  assert.equal(subtotal.volume, "151280945.00");
  assert.equal(subtotal.gci, "6133905.41");
  assert.equal(pct4(subtotal.realizedYield), "4.0546");

  const b = buildPlanningBasis(archived);
  assert.equal(b.allTimeSalesDeals, 16);
  assert.equal(roundCentavos(b.allTimePrice!).toFixed(2), "9455059.06");

  // Restoring D021 (archived_at back to null) returns the criterion-1 values.
  const restored = buildYieldReport(YIELD_DEALS, "all");
  assert.deepEqual(rowOf(restored, "sales_subtotal"), rowOf(buildYieldReport(YIELD_DEALS, "all"), "sales_subtotal"));
  assert.equal(rowOf(restored, "sales_subtotal").deals, 17);
});

// --- empty workspace: planning basis nulls (criterion 11 seed) ---------------

test("empty deal set → planning basis nulls, report zeros, no errors", () => {
  const b = buildPlanningBasis([]);
  assert.equal(b.allTimeSalesDeals, 0);
  assert.equal(b.allTimeSalesVolume, "0.00");
  assert.equal(b.allTimeYield, null);
  assert.equal(b.allTimePrice, null);

  const r = buildYieldReport([], "all");
  assert.equal(rowOf(r, "sales_subtotal").realizedYield, null);
  assert.equal(r.blendedAvgPrice, null);
  assert.deepEqual(r.unclassified, []);
});
