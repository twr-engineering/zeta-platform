import test from "node:test";
import assert from "node:assert/strict";

import { positionTotals, type ProjectionReceivable } from "../../../src/lib/receivables/projections.ts";
import {
  buildAging,
  buildByDeveloper,
  buildCashTax,
  buildChase,
  buildMonthly,
  buildPosition,
  buildTarget,
  type DashboardPayment,
} from "../../../src/lib/dashboard/sections.ts";
import type { TargetTableRow } from "../../../src/lib/dashboard/target.ts";

/**
 * M6 §3.3 — the eight-section read models over the v30.20 fixture, frozen at
 * 2026-07-17. Receivable + payment fixtures both tie to the acceptance anchors, so
 * every section and every internal reconciliation is asserted to the centavo
 * (Milestones test plan items 1, 4–8; §8 correctness assertions).
 */

const DEV_A = "dev-a";
const DEV_M = "dev-m";
const TARGET_2026: TargetTableRow = {
  netIncomeTarget: "11500000",
  opexPct: "0.22",
  cosPct: "0.10",
};

// --- receivable fixture (the 21-row workbook state, ties to the anchors) ------

function row(p: Partial<ProjectionReceivable> & { deal_code: string }): ProjectionReceivable {
  const collectible = p.total_collectible ?? "0.00";
  return {
    deal_id: `id-${p.deal_code}`,
    deal_code: p.deal_code,
    client_name: p.client_name ?? `Client ${p.deal_code}`,
    property_details: p.property_details ?? `Unit ${p.deal_code}`,
    deal_type: p.deal_type ?? "developer",
    developer_id: p.developer_id ?? null,
    lead_source_id: p.lead_source_id ?? "src",
    booked_year: p.booked_year ?? 2026,
    status: p.status ?? "open",
    booked_net_gci: p.booked_net_gci ?? collectible,
    total_collectible: collectible,
    collected_net: p.collected_net ?? "0.00",
    balance: p.balance ?? null,
    variance: p.variance ?? null,
    written_off: p.written_off ?? null,
    pct_collected: p.pct_collected ?? null,
    last_payment_date: p.last_payment_date ?? null,
    months_idle: p.months_idle ?? null,
    age_months: p.age_months ?? null,
    days_to_first_release: p.days_to_first_release ?? null,
    confirmed_collectible: p.confirmed_collectible ?? null,
    next_action_note: p.next_action_note ?? null,
    archived_at: p.archived_at ?? null,
    developer:
      p.developer ??
      (p.developer_id === DEV_A
        ? { name: "Ayala" }
        : p.developer_id === DEV_M
          ? { name: "Megaworld" }
          : null),
  };
}

function open(deal_code: string, collectible: string, extra: Partial<ProjectionReceivable> = {}) {
  return row({ deal_code, total_collectible: collectible, balance: collectible, collected_net: "0.00", status: "open", ...extra });
}
function closed(deal_code: string, collectible: string, extra: Partial<ProjectionReceivable> = {}) {
  return row({ deal_code, total_collectible: collectible, collected_net: collectible, balance: "0.00", variance: "0.00", status: "closed", ...extra });
}

function workbookReceivables(): ProjectionReceivable[] {
  return [
    open("D002", "126500.00", { deal_type: "resale", developer_id: null, age_months: 5 }),
    open("D003", "117500.00", { deal_type: "resale", developer_id: null, age_months: 4 }),
    open("D005", "675000.00", { developer_id: DEV_A, age_months: 4 }),
    open("D007", "180000.00", { developer_id: DEV_M, age_months: 3 }),
    open("D008", "317414.70", { developer_id: DEV_A, age_months: 3 }),
    open("D009", "322724.20", { developer_id: DEV_M, age_months: 0 }),
    open("D010", "426953.13", { developer_id: DEV_A, age_months: 0 }),
    open("D011", "155803.57", { developer_id: DEV_M, age_months: 0 }),
    open("D012", "206696.43", { developer_id: DEV_A, age_months: 0 }),
    open("D013", "906752.23", { developer_id: DEV_M, age_months: 0 }),
    open("D014", "401965.08", { developer_id: DEV_A, age_months: 0 }),
    open("D015", "77232.14", { deal_type: "n_a", developer_id: null, age_months: 0 }),
    open("D016", "630813.93", { developer_id: DEV_M, age_months: 0 }),
    open("D021", "354591.84", {
      developer_id: DEV_A,
      collected_net: "44642.86",
      balance: "309948.98",
      last_payment_date: "2026-07-09",
      months_idle: 0,
      age_months: 0,
      days_to_first_release: -1,
    }),
    // 7 Closed, collected in full (illustrative amounts summing to 1,863,550).
    closed("D001", "436050.00", { developer_id: null, deal_type: "resale" }),
    closed("D004", "875000.00", { developer_id: DEV_M, booked_net_gci: "800000.00" }),
    closed("D006", "100000.00", { developer_id: DEV_A }),
    closed("D017", "110000.00", { developer_id: null, deal_type: "n_a" }),
    closed("D018", "120000.00", { developer_id: DEV_A }),
    closed("D019", "110000.00", { developer_id: DEV_M }),
    closed("D020", "112500.00", { developer_id: DEV_A }),
  ];
}

// --- payment fixture (the 8 workbook releases, exact splits) ------------------

function pay(
  gross: string, vat: string, ewt: string, netCash: string, netOfVat: string, month: number, year = 2026
): DashboardPayment {
  return { gross_amount: gross, vat_amount: vat, ewt_amount: ewt, net_cash: netCash, net_of_vat: netOfVat, year_paid: year, month_paid: month };
}

function workbookPayments(): DashboardPayment[] {
  return [
    pay("436050.00", "0.00", "0.00", "436050.00", "436050.00", 1), // D001 Jan
    pay("875000.00", "0.00", "0.00", "875000.00", "875000.00", 7), // D004
    pay("22500.00", "0.00", "0.00", "22500.00", "22500.00", 7), // D017
    pay("130000.00", "0.00", "0.00", "130000.00", "130000.00", 7), // D018
    pay("10000.00", "0.00", "0.00", "10000.00", "10000.00", 7), // D019
    pay("37500.00", "0.00", "0.00", "37500.00", "37500.00", 7), // D020
    pay("352500.00", "0.00", "0.00", "352500.00", "352500.00", 7), // D006
    pay("50000.00", "5357.14", "4464.29", "45535.71", "44642.86", 7), // D021 incentive
  ];
}

// --- Section 1 — Position ----------------------------------------------------

test("Section 1 — position ties to the anchors + net cash + referral tile", () => {
  const rec = workbookReceivables();
  const pos = buildPosition(rec, workbookPayments(), []);

  assert.equal(pos.totalCollectible, "6763497.25");
  assert.equal(pos.collectedNet, "1908192.86");
  assert.equal(pos.balanceOutstanding, "4855304.39");
  // % Collected displays 28.21% (1,908,192.86 ÷ 6,763,497.25).
  assert.equal((Number(pos.pctCollected) * 100).toFixed(2), "28.21");
  assert.equal(pos.writtenOff, "0.00");
  assert.equal(pos.varianceRealized, "0.00");
  assert.equal(pos.netCashReceived, "1909085.71");
  assert.equal(pos.referralOwed, "0.00");
  assert.equal(pos.referralOwedDeals, 0);
});

test("Section 1 — spreads positionTotals identically (position vs M4.4 projection)", () => {
  const rec = workbookReceivables();
  const pos = buildPosition(rec, workbookPayments(), []);
  const proj = positionTotals(rec);
  assert.equal(pos.totalCollectible, proj.totalCollectible);
  assert.equal(pos.collectedNet, proj.collectedNet);
  assert.equal(pos.balanceOutstanding, proj.balanceOutstanding);
  assert.deepEqual(pos.counts, proj.counts);
});

// --- Section 3 — Cash & Tax --------------------------------------------------

test("Section 3 — the five-line waterfall to the centavo", () => {
  const c = buildCashTax(workbookPayments());
  assert.equal(c.gross, "1913550.00");
  assert.equal(c.vat, "5357.14");
  assert.equal(c.ewt, "4464.29");
  assert.equal(c.netCash, "1909085.71");
  assert.equal(c.retained, "1903728.57");
  // Identities hold: Net Cash = Gross − EWT; Retained = Gross − VAT − EWT.
  assert.equal(c.netCash, (Number(c.gross) - Number(c.ewt)).toFixed(2));
  assert.equal(c.retained, (Number(c.gross) - Number(c.vat) - Number(c.ewt)).toFixed(2));
});

// --- Section 2 — Collected vs Target -----------------------------------------

test("Section 2 — target, collected-for-year, %, pace, behind-by (v30.20)", () => {
  const t = buildTarget(workbookPayments(), 2026, "2026-07-17", null, TARGET_2026);
  assert.equal(t.annualTarget, "16920000.00");
  assert.equal(t.overridden, false);
  assert.equal(t.collectedForYear, "1908192.86");
  assert.equal(t.pctOfTarget, "0.112777");
  assert.equal(t.paceToDate, "9178520.55");
  assert.equal(t.vsPace, "-7270327.69");
  assert.equal(t.paceLabel, "behind");
});

test("Section 2 — an override wins and the derived value stays visible (AC3)", () => {
  const t = buildTarget(
    workbookPayments(), 2026, "2026-07-17",
    { amount: "15000000.00", note: "board plan" }, TARGET_2026
  );
  assert.equal(t.annualTarget, "15000000.00");
  assert.equal(t.overridden, true);
  assert.equal(t.overrideNote, "board plan");
  assert.equal(t.derivedTarget, "16920000.00");
  assert.equal(t.paceToDate, "8136986.30"); // 198/365 × 15,000,000
});

test("Section 2 — no target row and no override → '—' (null), line suppressed", () => {
  const t = buildTarget(workbookPayments(), 2026, "2026-07-17", null, null);
  assert.equal(t.annualTarget, null);
  assert.equal(t.pctOfTarget, null);
  assert.equal(t.paceToDate, null);
  assert.equal(t.vsPace, null);
  assert.equal(t.paceLabel, null);
});

test("Section 2 — 'ahead' when collected clears the pace", () => {
  const big = [pay("10000000.00", "0.00", "0.00", "10000000.00", "10000000.00", 3)];
  const t = buildTarget(big, 2026, "2026-07-17", null, TARGET_2026);
  assert.equal(t.paceLabel, "ahead");
  assert.equal(t.vsPace, "821479.45"); // 10,000,000 − 9,178,520.55
});

test("Section 2 — the year filter selects the paid year (2025 → nothing collected)", () => {
  const t = buildTarget(workbookPayments(), 2025, "2026-07-17", null, null);
  assert.equal(t.collectedForYear, "0.00");
  assert.equal(t.annualTarget, null); // no 2025 override/table
});

// --- Section 6 — Monthly -----------------------------------------------------

test("Section 6 — Jan/Jul rows + cumulative vs straight-line target (v30.20)", () => {
  const m = buildMonthly(workbookPayments(), 2026, "16920000.00");
  assert.equal(m.rows.length, 12);

  const jan = m.rows[0];
  assert.equal(jan.collectedNet, "436050.00");
  assert.equal(jan.netCash, "436050.00");
  assert.equal(jan.payments, 1);
  assert.equal(jan.cumulativeCollected, "436050.00");
  assert.equal(jan.cumulativeTarget, "1410000.00"); // 16,920,000 × 1/12
  assert.equal(jan.vsTarget, "-973950.00");

  // Feb–Jun carry the cumulative unchanged.
  for (let i = 1; i <= 5; i++) {
    assert.equal(m.rows[i].payments, 0);
    assert.equal(m.rows[i].cumulativeCollected, "436050.00");
  }

  const jul = m.rows[6];
  assert.equal(jul.collectedNet, "1472142.86");
  assert.equal(jul.netCash, "1473035.71");
  assert.equal(jul.payments, 7);
  assert.equal(jul.cumulativeCollected, "1908192.86");
  assert.equal(jul.cumulativeTarget, "9870000.00"); // × 7/12
  assert.equal(jul.vsTarget, "-7961807.14");
});

test("Section 6 — no target ⇒ cumulative-target column is '—' (null)", () => {
  const m = buildMonthly(workbookPayments(), 2026, null);
  assert.ok(m.rows.every((r) => r.cumulativeTarget === null && r.vsTarget === null));
});

// --- reconciliation assertions (the module lives or dies on these) -----------

test("RECONCILIATION — aging TOTAL == Balance Outstanding", () => {
  const rec = workbookReceivables();
  const pos = buildPosition(rec, workbookPayments(), []);
  const aging = buildAging(rec);
  assert.equal(aging.totalBalance, pos.balanceOutstanding);
});

test("RECONCILIATION — Σ developer rows == position totals", () => {
  const rec = workbookReceivables();
  const pos = buildPosition(rec, workbookPayments(), []);
  const { rows, total } = buildByDeveloper(rec);
  assert.equal(total.balance, pos.balanceOutstanding);
  assert.equal(total.collectedNet, pos.collectedNet);
  assert.equal(total.collectible, pos.totalCollectible);
  const sumBal = rows.reduce((a, d) => a + Number(d.balance), 0).toFixed(2);
  assert.equal(sumBal, total.balance);
});

test("RECONCILIATION — December cumulative == Section 2 collected-for-year == position collected", () => {
  const pays = workbookPayments();
  const rec = workbookReceivables();
  const target = buildTarget(pays, 2026, "2026-07-17", null, TARGET_2026);
  const monthly = buildMonthly(pays, 2026, target.annualTarget);
  const december = monthly.rows[11].cumulativeCollected;
  assert.equal(december, target.collectedForYear);
  assert.equal(december, "1908192.86");
  assert.equal(buildPosition(rec, pays, []).collectedNet, december);
});

// --- Section 8 — Chase order + >30 warning -----------------------------------

test("Section 8 — chase order D013 → D005 → D016 → D010 (Rule Q)", () => {
  const chase = buildChase(workbookReceivables(), 3);
  assert.equal(chase.rows.length, 14);
  assert.deepEqual(chase.rows.slice(0, 4).map((c) => c.dealCode), ["D013", "D005", "D016", "D010"]);
  assert.equal(chase.overThirtyWarning, false);
});

test("Section 8 — the >30 open-balances warning fires at 31, not 30", () => {
  const thirty = Array.from({ length: 30 }, (_, i) => open(`X${i}`, "1000.00", { age_months: i % 5 }));
  const thirtyOne = [...thirty, open("X30", "1000.00")];
  assert.equal(buildChase(thirty, 3).overThirtyWarning, false);
  assert.equal(buildChase(thirtyOne, 3).overThirtyWarning, true);
});

// --- synthetic position cases (the workbook has none) ------------------------

test("SYNTHETIC — a Cancelled deal writes off its uncollected remainder", () => {
  const rec = [
    ...workbookReceivables(),
    row({ deal_code: "C1", total_collectible: "100000.00", collected_net: "40000.00", balance: "0.00", written_off: "60000.00", status: "cancelled" }),
  ];
  const pos = buildPosition(rec, workbookPayments(), []);
  assert.equal(pos.writtenOff, "60000.00");
  // Collected keeps the 40,000 already in the bank; outstanding is open rows only.
  assert.equal(pos.collectedNet, "1948192.86");
  assert.equal(pos.balanceOutstanding, "4855304.39");
});

test("SYNTHETIC — a Closed-over deal realizes positive variance", () => {
  const rec = [
    ...workbookReceivables(),
    closed("O1", "100000.00", { collected_net: "100500.00", variance: "500.00" }),
  ];
  assert.equal(buildPosition(rec, workbookPayments(), []).varianceRealized, "500.00");
});

test("SYNTHETIC — the referral tile sums unpaid referral fees across N deals", () => {
  const pos = buildPosition(workbookReceivables(), workbookPayments(), [
    { referral_out: "75000.00" },
    { referral_out: "12500.00" },
  ]);
  assert.equal(pos.referralOwed, "87500.00");
  assert.equal(pos.referralOwedDeals, 2);
});
