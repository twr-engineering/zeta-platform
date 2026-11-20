import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMonthsIdle,
  computeAgeMonths,
  compareChasePriority,
  type ChaseKey,
} from "../../../src/lib/receivables/idle.ts";

/**
 * M4 Rule P (idle/age) + Rule Q (chase ordering). "today" is injected so the month
 * boundary is deterministic — the reason this math lives in the app, not SQL.
 */

// --- Rule P: months_idle (whole months since last payment) -------------------

test("months_idle — D021 last payment 2026-07-09 is 0 on 2026-07-17", () => {
  assert.equal(
    computeMonthsIdle({ status: "open", last_payment_date: "2026-07-09" }, "2026-07-17"),
    0
  );
});

test("months_idle — still 0 on 2026-08-08, becomes 1 on 2026-08-09 (DATEDIF-style)", () => {
  assert.equal(
    computeMonthsIdle({ status: "open", last_payment_date: "2026-07-09" }, "2026-08-08"),
    0
  );
  assert.equal(
    computeMonthsIdle({ status: "open", last_payment_date: "2026-07-09" }, "2026-08-09"),
    1
  );
});

test("months_idle — null when no payment yet, or when Closed/Cancelled", () => {
  assert.equal(
    computeMonthsIdle({ status: "open", last_payment_date: null }, "2026-07-17"),
    null
  );
  assert.equal(
    computeMonthsIdle({ status: "closed", last_payment_date: "2026-01-13" }, "2026-07-17"),
    null
  );
  assert.equal(
    computeMonthsIdle({ status: "cancelled", last_payment_date: "2026-01-13" }, "2026-07-17"),
    null
  );
});

test("months_idle — a future-dated payment clamps to 0, never negative", () => {
  assert.equal(
    computeMonthsIdle({ status: "open", last_payment_date: "2026-07-20" }, "2026-07-17"),
    0
  );
});

// --- Rule P: age_months (booking-date fallback) ------------------------------

test("age_months — D008 never paid, booked 2026-04-07 → 3 on 2026-07-17", () => {
  assert.equal(
    computeAgeMonths(
      { status: "open", last_payment_date: null, booking_date: "2026-04-07" },
      "2026-07-17"
    ),
    3
  );
});

test("age_months — uses last payment when one exists (not booking)", () => {
  // Booked long ago, paid recently → age counts from the payment.
  assert.equal(
    computeAgeMonths(
      { status: "open", last_payment_date: "2026-07-09", booking_date: "2026-01-01" },
      "2026-07-17"
    ),
    0
  );
});

test("age_months — null when Closed/Cancelled", () => {
  assert.equal(
    computeAgeMonths(
      { status: "closed", last_payment_date: null, booking_date: "2026-04-07" },
      "2026-07-17"
    ),
    null
  );
});

// --- Rule Q: chase-priority ordering -----------------------------------------

test("chase order — the 14 open workbook rows sort D013 → … → D015 by balance", () => {
  // Balances from WORKBOOK §5 / AC11: 13 open rows carry their full Total
  // Collectible (unpaid), D021 carries its post-payment balance 309,948.98.
  const rows: ChaseKey[] = [
    { deal_code: "D002", balance: "126500.00", months_idle: null },
    { deal_code: "D003", balance: "117500.00", months_idle: null },
    { deal_code: "D005", balance: "675000.00", months_idle: null },
    { deal_code: "D007", balance: "180000.00", months_idle: null },
    { deal_code: "D008", balance: "317414.70", months_idle: null },
    { deal_code: "D009", balance: "322724.20", months_idle: null },
    { deal_code: "D010", balance: "426953.13", months_idle: null },
    { deal_code: "D011", balance: "155803.57", months_idle: null },
    { deal_code: "D012", balance: "206696.43", months_idle: null },
    { deal_code: "D013", balance: "906752.23", months_idle: null },
    { deal_code: "D014", balance: "401965.08", months_idle: null },
    { deal_code: "D015", balance: "77232.14", months_idle: null },
    { deal_code: "D016", balance: "630813.93", months_idle: null },
    { deal_code: "D021", balance: "309948.98", months_idle: 0 },
  ];

  const order = [...rows].sort(compareChasePriority).map((r) => r.deal_code);
  assert.deepEqual(order, [
    "D013", "D005", "D016", "D010", "D014", "D009", "D008", "D021",
    "D012", "D007", "D011", "D002", "D003", "D015",
  ]);
});

test("chase tiebreak — equal balances break by months_idle DESC, nulls last, then deal_code", () => {
  const rows: ChaseKey[] = [
    { deal_code: "DB", balance: "100000.00", months_idle: 2 },
    { deal_code: "DA", balance: "100000.00", months_idle: null },
    { deal_code: "DC", balance: "100000.00", months_idle: 5 },
    { deal_code: "DD", balance: "100000.00", months_idle: 5 },
  ];
  const order = [...rows].sort(compareChasePriority).map((r) => r.deal_code);
  // idle 5 first (DC/DD, then deal_code asc), then idle 2 (DB), then null last (DA).
  assert.deepEqual(order, ["DC", "DD", "DB", "DA"]);
});

test("chase order — a null balance sorts last", () => {
  const rows: ChaseKey[] = [
    { deal_code: "DZ", balance: null, months_idle: null },
    { deal_code: "DA", balance: "1.00", months_idle: null },
  ];
  const order = [...rows].sort(compareChasePriority).map((r) => r.deal_code);
  assert.deepEqual(order, ["DA", "DZ"]);
});
