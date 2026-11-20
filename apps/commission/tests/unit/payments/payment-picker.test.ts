import { strict as assert } from "node:assert";
import { test } from "node:test";

import { filterPaymentDeals, type PaymentDealOption } from "@/lib/payments/picker";

/**
 * M5.2 — the deal picker's PURE type-ahead filter (FR-M5-02, §6.1). The same
 * matching the UI shows: substring over deal code + client + developer name,
 * case- and whitespace-insensitive, multi-token AND. Being pure, it is testable
 * to the exact rows the picker surfaces.
 */

function deal(over: Partial<PaymentDealOption> = {}): PaymentDealOption {
  return {
    id: crypto.randomUUID(),
    deal_code: "D021",
    display_label: "D021 — Daria & John Salon",
    client_name: "Daria & John Salon",
    booked_year: 2026,
    developer_name: null,
    receivable_status: "open",
    balance: "354591.84",
    ...over,
  };
}

const D021 = deal();
const D013 = deal({
  deal_code: "D013",
  display_label: "D013 — Lainie Vale",
  client_name: "Lainie Vale",
  developer_name: "Abrown Inc.",
});
const D004 = deal({
  deal_code: "D004",
  display_label: "D004 — Cristian Bins",
  client_name: "Cristian Bins",
});
const ALL = [D004, D013, D021];

const codes = (rows: PaymentDealOption[]) => rows.map((r) => r.deal_code);

test("an empty query returns every option (a fresh copy, not the same array)", () => {
  const out = filterPaymentDeals(ALL, "");
  assert.deepEqual(codes(out), ["D004", "D013", "D021"]);
  assert.notEqual(out, ALL); // a copy — the caller can slice/sort without mutating
});

test("a client-name fragment finds the deal, case-insensitively", () => {
  assert.deepEqual(codes(filterPaymentDeals(ALL, "sal")), ["D021"]);
  assert.deepEqual(codes(filterPaymentDeals(ALL, "DARIA")), ["D021"]);
});

test("a code fragment finds the deal (typing '21' finds D021)", () => {
  assert.deepEqual(codes(filterPaymentDeals(ALL, "21")), ["D021"]);
  assert.deepEqual(codes(filterPaymentDeals(ALL, "d013")), ["D013"]);
});

test("the developer name is searchable too", () => {
  assert.deepEqual(codes(filterPaymentDeals(ALL, "abrown")), ["D013"]);
});

test("whitespace is trimmed and multiple tokens narrow (AND)", () => {
  assert.deepEqual(codes(filterPaymentDeals(ALL, "  vale  ")), ["D013"]);
  assert.deepEqual(codes(filterPaymentDeals(ALL, "lainie vale")), ["D013"]);
  // Tokens from different rows match nothing (AND, not OR).
  assert.deepEqual(codes(filterPaymentDeals(ALL, "daria vale")), []);
});

test("no match returns an empty list, never throws", () => {
  assert.deepEqual(filterPaymentDeals(ALL, "zzz-nonexistent"), []);
});

test("type-ahead over 1,000 deals stays well under the 150ms bar (§8)", () => {
  // The perf target's worst case: the full 1,000-deal set the picker preloads.
  const many: PaymentDealOption[] = Array.from({ length: 1000 }, (_, i) =>
    deal({
      deal_code: `D${String(i + 1).padStart(4, "0")}`,
      display_label: `D${String(i + 1).padStart(4, "0")} — Client ${i}`,
      client_name: `Client ${i}`,
      developer_name: i % 3 === 0 ? "Abrown Inc." : null,
    })
  );
  // Warm, then time a realistic keystroke sequence (narrowing query per char).
  filterPaymentDeals(many, "cli");
  const started = performance.now();
  for (const q of ["c", "cl", "cli", "clie", "client 5"]) filterPaymentDeals(many, q);
  const elapsed = performance.now() - started;
  console.log(`  picker filter — 5 keystrokes over 1,000 deals: ${elapsed.toFixed(2)}ms`);
  // Five filters, so a single keystroke is a fifth of this; assert the whole
  // burst clears the per-keystroke budget with room to spare.
  assert.ok(elapsed < 150, `filter burst took ${elapsed.toFixed(2)}ms (budget 150ms)`);
});
