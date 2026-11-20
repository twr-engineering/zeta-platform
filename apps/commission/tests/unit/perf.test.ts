import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  computeDeal,
  type DealComputeInput,
  type EngineSettings,
} from "../../src/lib/engine/index.ts";

/**
 * M1.5 — the perf budget for the recompute engine, at 1,000 synthetic deals.
 *
 * This is the CI-runnable half of the milestone's perf targets (the DB-bound
 * halves — deal-list P95 < 500 ms and full bulk recompute < 30 s — are measured
 * live by scripts/perf-recompute.ts against a real workspace, and their numbers
 * recorded in progress.txt). What CI can prove without a database is that the
 * engine — run once per deal by both a single edit and a bulk recompute — meets
 * its own budget: single-deal compute < 10 ms (M1 PRD §8), and recomputing the
 * engine over 1,000 deals is a small fraction of the 30 s bulk budget, so the
 * database work, not the arithmetic, is what that budget must cover.
 *
 * Sample-based, with a warm-up so JIT/first-call cost is not measured, and
 * generous ceilings so a green CI machine under load does not flake — the point
 * is catching a pathological regression (an accidental O(n²), a per-call
 * allocation blow-up), not micro-benchmarking.
 */

const SETTINGS: EngineSettings = {
  vat_rate: "0.1200",
  ewt_rate: "0.0500",
  property_vat_threshold: "3600000.00",
  vat_registered: true,
};

/** 1,000 varied synthetic deals — developer/resale/rental, taxable and not. */
function syntheticDeals(n: number): DealComputeInput[] {
  const deals: DealComputeInput[] = [];
  for (let i = 0; i < n; i += 1) {
    const kind = i % 5;
    const listPrice = (2_000_000 + (i % 50) * 137_500).toFixed(2);
    if (kind === 0 || kind === 1) {
      // developer sale (always taxable), percent commission
      deals.push({
        deal_type: "developer",
        transaction_type: "sale",
        representation: "seller",
        force_vat: i % 7 === 0,
        property_vat_rule: i % 2 === 0 ? "threshold" : "always_vat",
        list_price: listPrice,
        commission: { basis: "percent", rate: "0.05" },
        developer_comm_base: i % 2 === 0 ? "net" : "gross",
        receipt_issued: true,
        incentive_billed: (i % 3 === 0 ? 50_000 : 0).toFixed(2),
        incentive_taxable: i % 3 === 0 ? "yes" : null,
        referral_out_pct: "0",
        referral_out_fixed: (i % 4 === 0 ? 10_000 : 0).toFixed(2),
      });
    } else if (kind === 2) {
      // receipted resale (taxable), fixed commission
      deals.push({
        deal_type: "resale",
        transaction_type: "sale",
        representation: "buyer",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: listPrice,
        commission: { basis: "fixed", amount: "200000.00" },
        developer_comm_base: null,
        receipt_issued: true,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0.02",
        referral_out_fixed: "0.00",
      });
    } else if (kind === 3) {
      // untaxed resale (not taxable)
      deals.push({
        deal_type: "resale",
        transaction_type: "sale",
        representation: "double_ended",
        force_vat: false,
        property_vat_rule: "threshold",
        list_price: listPrice,
        commission: { basis: "percent", rate: "0.03" },
        developer_comm_base: null,
        receipt_issued: false,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    } else {
      // rental, exact 1/12 fraction
      deals.push({
        deal_type: "n/a",
        transaction_type: "rental",
        representation: "lessor",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: (240_000 + (i % 20) * 12_000).toFixed(2),
        commission: { basis: "percent", rate: "1/12" },
        developer_comm_base: null,
        receipt_issued: true,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    }
  }
  return deals;
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

test("single-deal compute is well under the 10 ms budget (P95)", () => {
  const deals = syntheticDeals(1000);
  // Warm-up: don't measure first-call JIT.
  for (let i = 0; i < 200; i += 1) computeDeal(deals[i % deals.length], SETTINGS);

  const durations: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const deal = deals[i % deals.length];
    const start = performance.now();
    computeDeal(deal, SETTINGS);
    durations.push(performance.now() - start);
  }

  const p = p95(durations);
  console.log(`  single-deal compute P95: ${p.toFixed(3)} ms (target < 10 ms)`);
  assert.ok(p < 10, `single-deal compute P95 ${p.toFixed(3)}ms exceeds 10ms`);
});

test("recomputing the engine over 1,000 deals is a small fraction of the 30 s budget", () => {
  const deals = syntheticDeals(1000);
  for (let i = 0; i < 200; i += 1) computeDeal(deals[i % deals.length], SETTINGS);

  const start = performance.now();
  for (const deal of deals) computeDeal(deal, SETTINGS);
  const elapsed = performance.now() - start;

  console.log(
    `  engine recompute of 1,000 deals: ${elapsed.toFixed(1)} ms (bulk budget 30,000 ms is DB-bound)`
  );
  // 3 s is a very loose ceiling — the engine portion is typically tens of ms;
  // the real 30 s budget is dominated by the per-deal DB write, not this.
  assert.ok(elapsed < 3000, `1,000-deal engine recompute ${elapsed.toFixed(0)}ms too slow`);
});
