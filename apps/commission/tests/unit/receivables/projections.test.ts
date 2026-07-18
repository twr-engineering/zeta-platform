import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  agingRows,
  bookingYearSummary,
  chaseProjection,
  perDeveloperRollups,
  perSourceRollups,
  positionTotals,
  searchProjection,
  type ProjectionReceivable,
} from "../../../src/lib/receivables/projections.ts";

/**
 * M4.4 downstream projections. The fixture reproduces the v30.20 workbook's
 * receivable state (14 Open / 7 Closed / 0 Cancelled) at 2026-07-17, so the
 * aggregates tie to the acceptance anchors to the centavo:
 *
 *   Σ Total Collectible = 6,763,497.25
 *   Σ Collected (net)   = 1,908,192.86
 *   Σ Outstanding       = 4,855,304.39   (open rows)
 *
 * and every projection's Σ reconciles to those totals — the reconciliation the
 * module lives on. The 13 unpaid open rows carry their full collectible as balance;
 * D021 carries its post-payment 309,948.98. The 7 Closed rows collected in full
 * (variance 0). Their exact per-row split beyond D001/D004 is illustrative — the
 * per-row workbook reconciliation is M1.4/M4.2's (verified live); this proves the
 * aggregation + the ties.
 */

const DEV_A = "dev-ayala";
const DEV_M = "dev-megaworld";
const SRC_FB = "src-facebook";
const SRC_REF = "src-referral";

function row(p: Partial<ProjectionReceivable> & { deal_code: string }): ProjectionReceivable {
  const collectible = p.total_collectible ?? "0.00";
  return {
    deal_id: `id-${p.deal_code}`,
    deal_code: p.deal_code,
    client_name: p.client_name ?? `Client ${p.deal_code}`,
    property_details: p.property_details ?? `Unit ${p.deal_code}`,
    deal_type: p.deal_type ?? "developer",
    developer_id: p.developer_id ?? null,
    lead_source_id: p.lead_source_id ?? SRC_FB,
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
        ? { name: "Ayala Land" }
        : p.developer_id === DEV_M
          ? { name: "Megaworld" }
          : null),
  };
}

/** An unpaid open row: balance = collectible, age set for the aging buckets. */
function open(deal_code: string, collectible: string, extra: Partial<ProjectionReceivable> = {}) {
  return row({
    deal_code,
    total_collectible: collectible,
    balance: collectible,
    collected_net: "0.00",
    status: "open",
    ...extra,
  });
}

/** A closed-in-full row: collected = collectible, variance 0, balance 0. */
function closed(deal_code: string, collectible: string, extra: Partial<ProjectionReceivable> = {}) {
  return row({
    deal_code,
    total_collectible: collectible,
    collected_net: collectible,
    balance: "0.00",
    variance: "0.00",
    status: "closed",
    ...extra,
  });
}

function workbookReceivables(): ProjectionReceivable[] {
  return [
    // --- 14 Open -----------------------------------------------------------
    open("D002", "126500.00", { deal_type: "resale", developer_id: null, age_months: 1, lead_source_id: SRC_REF }),
    open("D003", "117500.00", { deal_type: "resale", developer_id: null, age_months: 2, lead_source_id: SRC_REF }),
    open("D005", "675000.00", { developer_id: DEV_A, age_months: 4 }),
    open("D007", "180000.00", { developer_id: DEV_M, age_months: 7 }),
    open("D008", "317414.70", { developer_id: DEV_A, age_months: 3 }),
    open("D009", "322724.20", { developer_id: DEV_M, age_months: 3 }),
    open("D010", "426953.13", { developer_id: DEV_A, age_months: 5 }),
    open("D011", "155803.57", { developer_id: DEV_M, age_months: 2 }),
    open("D012", "206696.43", { developer_id: DEV_A, age_months: 6 }),
    open("D013", "906752.23", { developer_id: DEV_M, age_months: 0 }),
    open("D014", "401965.08", { developer_id: DEV_A, age_months: 8 }),
    open("D015", "77232.14", { deal_type: "n_a", developer_id: null, age_months: 1, lead_source_id: SRC_REF }),
    open("D016", "630813.93", { developer_id: DEV_M, age_months: 2 }),
    // D021 — one incentive release: collected 44,642.86 / balance 309,948.98.
    open("D021", "354591.84", {
      developer_id: DEV_A,
      collected_net: "44642.86",
      balance: "309948.98",
      last_payment_date: "2026-07-09",
      months_idle: 0,
      age_months: 0,
      days_to_first_release: -1,
      pct_collected: "0.125899",
    }),
    // --- 7 Closed (collected in full, variance 0) --------------------------
    closed("D001", "436050.00", { developer_id: DEV_A, days_to_first_release: 12 }),
    closed("D004", "875000.00", { developer_id: DEV_M, booked_net_gci: "800000.00", days_to_first_release: 115 }),
    closed("D006", "100000.00", { developer_id: DEV_A }),
    closed("D017", "110000.00", { developer_id: DEV_M }),
    closed("D018", "120000.00", { developer_id: DEV_A }),
    closed("D019", "110000.00", { developer_id: DEV_M }),
    closed("D020", "112500.00", { developer_id: DEV_A }),
  ];
}

// --- position totals ---------------------------------------------------------

test("position totals tie to the workbook acceptance anchors to the centavo", () => {
  const t = positionTotals(workbookReceivables());
  assert.equal(t.totalCollectible, "6763497.25");
  assert.equal(t.collectedNet, "1908192.86");
  assert.equal(t.balanceOutstanding, "4855304.39");
  assert.equal(t.writtenOff, "0.00");
  assert.equal(t.varianceRealized, "0.00");
  // Booked NET GCI = collectible everywhere except D004 (800,000 vs 875,000).
  assert.equal(t.bookedNetGci, "6688497.25");
  assert.deepEqual(t.counts, { open: 14, closed: 7, cancelled: 0 });
});

test("position — archived rows are excluded from every total", () => {
  const rows = workbookReceivables();
  rows.push(open("D099", "1000000.00", { archived_at: "2026-07-01T00:00:00Z" }));
  const t = positionTotals(rows);
  assert.equal(t.totalCollectible, "6763497.25");
  assert.equal(t.counts.open, 14);
});

test("position — variance/write-off sum only over Closed/Cancelled", () => {
  const rows = [
    closed("C1", "100000.00", { collected_net: "90000.00", balance: "10000.00", variance: "-10000.00" }),
    row({ deal_code: "X1", total_collectible: "200000.00", collected_net: "50000.00", balance: "150000.00", written_off: "150000.00", status: "cancelled" }),
    open("O1", "300000.00"),
  ];
  const t = positionTotals(rows);
  assert.equal(t.varianceRealized, "-10000.00");
  assert.equal(t.writtenOff, "150000.00");
  // Cancelled cash is kept in collected; balance outstanding is open rows only.
  assert.equal(t.collectedNet, "140000.00");
  assert.equal(t.balanceOutstanding, "300000.00");
});

// --- aging -------------------------------------------------------------------

test("aging — bucket total ties to the outstanding balance (over open bal>0)", () => {
  const rows = workbookReceivables();
  const aging = agingRows(rows);
  const position = positionTotals(rows);
  assert.equal(aging.totalBalance, position.balanceOutstanding);

  // Σ bucket balances == the total; Σ counts == 14 (all open rows owe money).
  const sumBuckets = aging.buckets
    .reduce((acc, b) => acc + Number(b.balance), 0)
    .toFixed(2);
  assert.equal(sumBuckets, "4855304.39");
  assert.equal(aging.buckets.reduce((n, b) => n + b.count, 0), 14);
});

test("aging — buckets split on [0,1) [1,3) [3,6) [6,∞) of age_months", () => {
  const rows = [
    open("A", "100.00", { age_months: 0 }),
    open("B", "100.00", { age_months: 1 }),
    open("C", "100.00", { age_months: 2 }),
    open("D", "100.00", { age_months: 3 }),
    open("E", "100.00", { age_months: 5 }),
    open("F", "100.00", { age_months: 6 }),
    open("G", "100.00", { age_months: 12 }),
  ];
  const { buckets } = agingRows(rows);
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.count]));
  assert.equal(byKey.lt1, 1); // A
  assert.equal(byKey.m1to3, 2); // B, C
  assert.equal(byKey.m3to6, 2); // D, E
  assert.equal(byKey.m6plus, 2); // F, G
});

test("aging — excludes closed, cancelled, and open rows with balance ≤ 0", () => {
  const rows = [
    open("A", "100.00", { age_months: 1 }),
    closed("B", "100.00", { age_months: 1 }),
    row({ deal_code: "C", status: "open", total_collectible: "100.00", collected_net: "150.00", balance: "-50.00", age_months: 1 }),
  ];
  const { buckets, totalBalance } = agingRows(rows);
  assert.equal(totalBalance, "100.00");
  assert.equal(buckets.reduce((n, b) => n + b.count, 0), 1);
});

// --- per-developer -----------------------------------------------------------

test("per-developer — TOTAL row ties to the position totals", () => {
  const rows = workbookReceivables();
  const { rows: devs, total } = perDeveloperRollups(rows);
  const position = positionTotals(rows);

  assert.equal(total.balance, position.balanceOutstanding);
  assert.equal(total.collectedNet, position.collectedNet);
  assert.equal(total.collectible, position.totalCollectible);

  // Σ over the developer rows equals the TOTAL row.
  const sumBal = devs.reduce((acc, d) => acc + Number(d.balance), 0).toFixed(2);
  assert.equal(sumBal, total.balance);
  const sumColl = devs.reduce((acc, d) => acc + Number(d.collectedNet), 0).toFixed(2);
  assert.equal(sumColl, total.collectedNet);
});

test("per-developer — a 'Resale / Rental (no developer)' row exists and sinks last", () => {
  const { rows: devs } = perDeveloperRollups(workbookReceivables());
  const noDev = devs.find((d) => d.developerId === null);
  assert.ok(noDev, "expected a no-developer row");
  assert.equal(noDev?.developerName, "Resale / Rental (no developer)");
  // D002 + D003 + D015 all open, no developer: 126500 + 117500 + 77232.14.
  assert.equal(noDev?.balance, "321232.14");
  assert.equal(devs[devs.length - 1].developerId, null);
});

test("per-developer — avg days to first release averages the non-null releases", () => {
  const { total } = perDeveloperRollups(workbookReceivables());
  // Non-null days: D021 -1, D001 12, D004 115 → avg 42 (whole, no ".0").
  assert.equal(total.avgDaysToFirstRelease, 42);
});

test("per-developer — avg days is rounded to ONE decimal (M6 §3.3 display precision)", () => {
  // Three developer deals with releases summing to 452 days ÷ 7 payments is the
  // sheet's 64.6; here a fabricated set proves the 1-dp rounding directly.
  const rows = [
    row({ deal_code: "P1", developer_id: DEV_A, status: "closed", total_collectible: "100.00", collected_net: "100.00", days_to_first_release: 12 }),
    row({ deal_code: "P2", developer_id: DEV_A, status: "closed", total_collectible: "100.00", collected_net: "100.00", days_to_first_release: 115 }),
    row({ deal_code: "P3", developer_id: DEV_A, status: "closed", total_collectible: "100.00", collected_net: "100.00", days_to_first_release: 82 }),
  ];
  const { rows: devs } = perDeveloperRollups(rows);
  const ayala = devs.find((d) => d.developerId === DEV_A);
  // (12 + 115 + 82) / 3 = 69.6666… → 69.7, NOT the integer 70.
  assert.equal(ayala?.avgDaysToFirstRelease, 69.7);
});

test("per-developer — a lone negative release stays a whole −1 (legal, §4 rule 10)", () => {
  const rows = [
    row({ deal_code: "N1", developer_id: DEV_M, status: "open", total_collectible: "100.00", balance: "50.00", collected_net: "50.00", days_to_first_release: -1 }),
  ];
  const { rows: devs } = perDeveloperRollups(rows);
  assert.equal(devs.find((d) => d.developerId === DEV_M)?.avgDaysToFirstRelease, -1);
});

// --- chase -------------------------------------------------------------------

test("chase — the 14 open rows order D013 → D005 → D016 → D010 … (Rule Q)", () => {
  const chase = chaseProjection(workbookReceivables(), 3);
  assert.equal(chase.length, 14);
  assert.deepEqual(chase.slice(0, 4).map((c) => c.dealCode), [
    "D013",
    "D005",
    "D016",
    "D010",
  ]);
});

test("chase — follow-up state: no payment / ⚠ chase / ok", () => {
  const rows = [
    open("NP", "100.00"), // never paid
    open("IDLE", "100.00", { last_payment_date: "2026-01-01", months_idle: 6 }),
    open("OK", "100.00", { last_payment_date: "2026-07-09", months_idle: 0 }),
  ];
  const byCode = Object.fromEntries(
    chaseProjection(rows, 3).map((c) => [c.dealCode, c.followUp])
  );
  assert.equal(byCode.NP, "no_payment_yet");
  assert.equal(byCode.IDLE, "chase"); // idle 6 ≥ threshold 3
  assert.equal(byCode.OK, "ok");
});

test("chase — payor is the developer for a Developer deal, else the client; override marked", () => {
  const rows = [
    open("DEV", "100.00", { deal_type: "developer", developer_id: DEV_A, confirmed_collectible: "90.00" }),
    open("RES", "100.00", { deal_type: "resale", developer_id: null }),
  ];
  const chase = chaseProjection(rows, 3);
  const dev = chase.find((c) => c.dealCode === "DEV")!;
  const res = chase.find((c) => c.dealCode === "RES")!;
  assert.equal(dev.payor, "Ayala Land");
  assert.equal(dev.overridden, true);
  assert.equal(res.payor, res.clientName);
  assert.equal(res.overridden, false);
});

test("chase — excludes Closed and Cancelled rows", () => {
  const chase = chaseProjection(workbookReceivables(), 3);
  assert.ok(!chase.some((c) => c.dealCode === "D004"));
  assert.equal(chase.length, 14);
});

// --- per-source --------------------------------------------------------------

test("per-source — TOTAL ties to the position totals; Σ rows == TOTAL", () => {
  const rows = workbookReceivables();
  const names = new Map([
    [SRC_FB, "Facebook"],
    [SRC_REF, "Referral"],
  ]);
  const { rows: sources, total } = perSourceRollups(rows, names);
  const position = positionTotals(rows);

  assert.equal(total.bookedNetGci, position.bookedNetGci);
  assert.equal(total.outstandingNet, position.balanceOutstanding);
  assert.equal(total.collectedNet, position.collectedNet);

  const sumBooked = sources.reduce((a, s) => a + Number(s.bookedNetGci), 0).toFixed(2);
  assert.equal(sumBooked, total.bookedNetGci);
  assert.equal(sources.reduce((n, s) => n + s.deals, 0), 21);

  // Names resolved; deal_type split present.
  assert.ok(sources.every((s) => s.leadSourceName === "Facebook" || s.leadSourceName === "Referral"));
});

test("per-source — a booking-year filter restricts the set", () => {
  const rows = workbookReceivables();
  rows.push(open("D050", "500000.00", { booked_year: 2025, lead_source_id: SRC_FB }));
  const names = new Map([[SRC_FB, "Facebook"], [SRC_REF, "Referral"]]);

  const all = perSourceRollups(rows, names);
  const only2026 = perSourceRollups(rows, names, 2026);
  assert.equal(all.total.deals, 22);
  assert.equal(only2026.total.deals, 21);
  assert.equal(only2026.total.bookedNetGci, "6688497.25");
});

// --- booking-year summary ----------------------------------------------------

test("booking-year — the 2026 row equals the whole-workbook aggregate", () => {
  const rows = workbookReceivables();
  const years = bookingYearSummary(rows);
  const position = positionTotals(rows);
  assert.equal(years.length, 1);
  const y = years[0];
  assert.equal(y.bookedYear, 2026);
  assert.equal(y.deals, 21);
  assert.equal(y.bookedNetGci, position.bookedNetGci);
  assert.equal(y.collectedNet, position.collectedNet);
  assert.equal(y.outstandingNet, position.balanceOutstanding);
});

test("booking-year — multiple years sort descending and each Σ ties", () => {
  const rows = [
    open("A", "100000.00", { booked_year: 2024 }),
    closed("B", "200000.00", { booked_year: 2025 }),
    open("C", "300000.00", { booked_year: 2026 }),
  ];
  const years = bookingYearSummary(rows);
  assert.deepEqual(years.map((y) => y.bookedYear), [2026, 2025, 2024]);
  const totalBooked = years.reduce((a, y) => a + Number(y.bookedNetGci), 0).toFixed(2);
  assert.equal(totalBooked, positionTotals(rows).bookedNetGci);
});

// --- search ------------------------------------------------------------------

test("search — only-with-balance returns the 14 open rows, balance high→low", () => {
  const results = searchProjection(workbookReceivables(), { onlyWithBalance: true });
  assert.equal(results.length, 14);
  assert.equal(results[0].dealCode, "D013");
  assert.equal(results[0].balance, "906752.23");
});

test("search — status and text filters", () => {
  const rows = workbookReceivables();
  assert.equal(searchProjection(rows, { status: "closed" }).length, 7);
  const byText = searchProjection(rows, { text: "unit d021" });
  assert.equal(byText.length, 1);
  assert.equal(byText[0].dealCode, "D021");
});

// --- performance (§8: projections < 300 ms at 1,000 rows) --------------------

test("projections — each aggregate is well under 300 ms at 1,000 rows", () => {
  const rows: ProjectionReceivable[] = [];
  for (let i = 0; i < 1000; i += 1) {
    const collectible = (100000 + (i % 50) * 7777).toFixed(2);
    const dev = i % 3 === 0 ? null : i % 2 === 0 ? DEV_A : DEV_M;
    rows.push(
      i % 5 === 0
        ? closed(`C${i}`, collectible, { developer_id: dev, booked_year: 2020 + (i % 7), days_to_first_release: i % 90 })
        : open(`D${i}`, collectible, {
            developer_id: dev,
            deal_type: dev ? "developer" : "resale",
            lead_source_id: i % 2 === 0 ? SRC_FB : SRC_REF,
            booked_year: 2020 + (i % 7),
            age_months: i % 10,
            last_payment_date: i % 4 === 0 ? "2026-01-01" : null,
            months_idle: i % 4 === 0 ? i % 8 : null,
          })
    );
  }
  const names = new Map([[SRC_FB, "Facebook"], [SRC_REF, "Referral"]]);

  const timed: Record<string, number> = {};
  const time = (label: string, fn: () => unknown) => {
    const s = performance.now();
    fn();
    timed[label] = performance.now() - s;
  };

  time("position", () => positionTotals(rows));
  time("aging", () => agingRows(rows));
  time("developer", () => perDeveloperRollups(rows));
  time("chase", () => chaseProjection(rows, 3));
  time("source", () => perSourceRollups(rows, names));
  time("bookingYear", () => bookingYearSummary(rows));
  time("search", () => searchProjection(rows, { onlyWithBalance: true, text: "d" }));

  for (const [label, ms] of Object.entries(timed)) {
    console.log(`  projection ${label}: ${ms.toFixed(2)} ms (target < 300 ms)`);
    assert.ok(ms < 300, `${label} projection ${ms.toFixed(1)}ms exceeds 300ms`);
  }
});
