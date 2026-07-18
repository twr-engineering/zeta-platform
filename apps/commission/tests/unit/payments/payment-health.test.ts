import test from "node:test";
import assert from "node:assert/strict";

import { countStaleBasisPayments } from "@/lib/payments/stale";
import type { DealVatBasis } from "@/types/entities";

/**
 * M5.4 — the payment-side Data Health feed (§7, FR-M5-12). The pure counter behind
 * getPaymentDataHealth: how many active payments were captured under a basis/rate
 * that no longer matches the deal + current settings. Same predicate the list's ⚠
 * badge uses (isStaleBasis), so the dashboard count and the on-screen flags can
 * never diverge.
 *
 * Rates are compared as EXACT decimals (never floats, never centavo-rounded) —
 * 0.1000 and 0.10 are the same rate, not a drift; the tests pin that.
 */

type Row = {
  vat_basis_used: DealVatBasis;
  ewt_rate_used: string;
  vat_rate_used: string;
  deal: { vat_basis: DealVatBasis } | null;
};

/** A payment whose stored snapshot matches its deal + the current rates below. */
function fresh(overrides: Partial<Row> = {}): Row {
  return {
    vat_basis_used: "inclusive",
    ewt_rate_used: "0.1000",
    vat_rate_used: "0.1200",
    deal: { vat_basis: "inclusive" },
    ...overrides,
  };
}

const CURRENT = { ewt_rate: "0.1000", vat_rate: "0.1200" };

test("a list with no drift counts zero", () => {
  assert.equal(countStaleBasisPayments([fresh(), fresh(), fresh()], CURRENT), 0);
});

test("a vat_basis drift (deal corrected inclusive → n/a) counts", () => {
  const rows = [fresh(), fresh({ deal: { vat_basis: "n_a" } })];
  assert.equal(countStaleBasisPayments(rows, CURRENT), 1);
});

test("an EWT-rate drift (captured 10%, now 5%) counts (§3.3.4)", () => {
  const rows = [fresh({ ewt_rate_used: "0.1000" })];
  assert.equal(countStaleBasisPayments(rows, { ewt_rate: "0.0500", vat_rate: "0.1200" }), 1);
});

test("a VAT-rate drift counts", () => {
  const rows = [fresh({ vat_rate_used: "0.1200" })];
  assert.equal(countStaleBasisPayments(rows, { ewt_rate: "0.1000", vat_rate: "0.0800" }), 1);
});

test("rates compare by decimal value: 0.1000 vs 0.10 is NOT a drift", () => {
  const rows = [fresh({ ewt_rate_used: "0.1000", vat_rate_used: "0.1200" })];
  assert.equal(countStaleBasisPayments(rows, { ewt_rate: "0.10", vat_rate: "0.12" }), 0);
});

test("a row with no deal join (mid-import) is skipped, never counted", () => {
  const rows = [fresh({ deal: null }), fresh({ deal: null })];
  assert.equal(countStaleBasisPayments(rows, { ewt_rate: "0.0500", vat_rate: "0.0800" }), 0);
});

test("counts each stale row once, across mixed drift reasons", () => {
  const rows = [
    fresh(), // no drift
    fresh({ deal: { vat_basis: "n_a" } }), // basis drift
    fresh({ ewt_rate_used: "0.0800" }), // ewt drift vs current 0.10
    fresh({ vat_basis_used: "n_a", deal: { vat_basis: "n_a" }, vat_rate_used: "0.0500" }), // vat drift only
  ];
  assert.equal(countStaleBasisPayments(rows, CURRENT), 3);
});
