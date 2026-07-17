import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computePaymentWarnings } from "@/lib/payments/warnings";
import type { PaymentInput } from "@/lib/payments/schema";

/**
 * M5.1 — the warning contract (§4 rules 3, 7, 8, 9; FR-M5-04). Amber, NON-blocking
 * signals returned to the caller. Pure, so identical on server and preview.
 */

function pay(over: Partial<PaymentInput> = {}): PaymentInput {
  return {
    deal_id: "11111111-1111-1111-1111-111111111111",
    payment_date: "2026-07-09",
    gross_amount: "50000.00",
    payment_type: "incentive",
    reference_note: null,
    ...over,
  };
}

const keys = (w: { key: string }[]) => w.map((x) => x.key);

test("no warnings on a clean same-day-or-later, open-receivable, no-duplicate payment", () => {
  const w = computePaymentWarnings({
    input: pay({ payment_date: "2026-07-20" }),
    bookedDate: "2026-07-10",
    today: "2026-07-20",
    receivableStatus: "open",
    duplicates: [],
  });
  assert.deepEqual(w, []);
});

test("rule 8 — a future-dated payment warns", () => {
  const w = computePaymentWarnings({
    input: pay({ payment_date: "2062-01-01" }),
    bookedDate: "2026-07-10",
    today: "2026-07-20",
  });
  assert.ok(keys(w).includes("future_date"));
});

test("rule 9 — D021's release dated the day before booking warns (not blocks)", () => {
  const w = computePaymentWarnings({
    input: pay({ payment_date: "2026-07-09" }),
    bookedDate: "2026-07-10",
    today: "2026-07-20",
  });
  assert.ok(keys(w).includes("pre_booking_date"));
});

test("rule 3 — a same deal+gross+date duplicate warns", () => {
  const w = computePaymentWarnings({
    input: pay(),
    bookedDate: "2026-01-01",
    today: "2026-07-20",
    duplicates: [{ payment_date: "2026-07-09", gross_amount: "50000.00" }],
  });
  assert.ok(keys(w).includes("possible_duplicate"));
});

test("rule 7 — a Closed receivable warns with the reopen prompt", () => {
  const w = computePaymentWarnings({
    input: pay(),
    bookedDate: "2026-01-01",
    today: "2026-07-20",
    receivableStatus: "closed",
  });
  assert.ok(keys(w).includes("receivable_closed"));
});

test("rule 7 — a Cancelled receivable warns", () => {
  const w = computePaymentWarnings({
    input: pay(),
    bookedDate: "2026-01-01",
    today: "2026-07-20",
    receivableStatus: "cancelled",
  });
  assert.ok(keys(w).includes("receivable_cancelled"));
});

test("warnings compose — future + pre-booking are independent (booked after a future date)", () => {
  const w = computePaymentWarnings({
    input: pay({ payment_date: "2026-07-05" }),
    bookedDate: "2026-07-10",
    today: "2026-07-01",
  });
  // 2026-07-05 is after today (future) and before booked (pre-booking).
  assert.ok(keys(w).includes("future_date"));
  assert.ok(keys(w).includes("pre_booking_date"));
});
