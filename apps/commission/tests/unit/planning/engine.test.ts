import test from "node:test";
import assert from "node:assert/strict";

import {
  computePlan,
  DEFAULT_FUNNEL_RATES,
  deriveAnnualTarget,
  netIncomePct,
  roundUp10k,
  type FunnelRates,
  type Plan,
  type PlanResult,
  type PlanYearTargetInput,
} from "@/lib/planning";
import { effectiveCos, effectiveOpex } from "@/lib/planning";
import { roundCentavos, toMoney } from "@/lib/money";
import {
  EMPTY_PLANNING_BASIS,
  WORKBOOK_PLANNING_BASIS,
} from "../../doubles/planning-basis";

/**
 * M3.1 — the planning engine, pinned to the v30.20 workbook's §10 GCI Calculator and
 * the PRD §9.1 canonical fixtures (derived from Rules P1–P13 in exact decimal). The
 * two silent failure modes the milestone calls out — ÷1.12 on fees, and chaining
 * display-rounded funnel stages — each have a dedicated tripwire below.
 */

// The 2026 live plan: NIT ₱11.5M, opex/cos blank (→ 22%/10% defaults), no overrides,
// over the workbook planning basis (17 sales · yield 4.0736% · price ₱9,369,467.35).
const TARGET_2026: PlanYearTargetInput = {
  year: 2026,
  netIncomeTarget: "11500000",
  opexPct: null,
  cosPct: null,
  yieldOverride: null,
  avgPriceOverride: null,
};

/** Unwrap a PlanResult that must have succeeded. */
function plan(result: PlanResult): Plan {
  assert.equal(result.ok, true, `expected a plan, got issues: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  return result.plan;
}

const p2026 = () => plan(computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS));

// --- P1–P4 economic model ----------------------------------------------------

test("P2 net income % = 1 − opex − cos = 0.68 at the 22%/10% defaults", () => {
  const m = p2026().economicModel;
  assert.equal(m.netIncomePct, "0.68");
  assert.equal(m.opexEff, "0.22");
  assert.equal(m.cosEff, "0.1"); // exact decimal string (trailing zero dropped)
  assert.equal(m.opexIsDefault, true);
  assert.equal(m.cosIsDefault, true);
});

test("P3 raw GCI target = NIT ÷ 0.68 = ₱16,911,764.71", () => {
  assert.equal(p2026().economicModel.gciRawTarget, "16911764.71");
});

test("P4 working goal auto-rounds UP to the nearest ₱10,000 = ₱16,920,000", () => {
  assert.equal(p2026().economicModel.workingGciGoal, "16920000.00");
});

test("P4 round-up boundary — exact multiple unchanged, one centavo over steps up", () => {
  assert.equal(roundUp10k("16910000.00"), "16910000.00");
  assert.equal(roundUp10k("16910000.01"), "16920000.00");
  assert.equal(roundUp10k("16911764.7059"), "16920000.00");
  assert.equal(roundUp10k("0"), "0.00");
});

test("explicit opex/cos are NOT flagged as defaults (OQ marker)", () => {
  const m = plan(
    computePlan(
      { ...TARGET_2026, opexPct: "0.15", cosPct: "0.10" },
      DEFAULT_FUNNEL_RATES,
      WORKBOOK_PLANNING_BASIS
    )
  ).economicModel;
  assert.equal(m.netIncomePct, "0.75");
  assert.equal(m.opexIsDefault, false);
  assert.equal(m.cosIsDefault, false);
});

// --- P5/P6 assumptions + the ÷1.12 tripwire ----------------------------------

test("P5 effective price/yield fall back to the all-time basis, source-labelled", () => {
  const a = p2026().assumptions;
  assert.equal(a.priceEff, "9369467.35");
  assert.equal(a.priceSource, "all_time");
  assert.equal(a.yieldSource, "all_time");
  // yield_eff crosses at FULL precision (Rule 7), not the 4-dp display value.
  assert.equal(a.yieldEff, WORKBOOK_PLANNING_BASIS.all_time_yield);
});

test("P6 fees per deal = price × yield = ₱381,676.31 (NO ÷1.12)", () => {
  const fees = p2026().assumptions.feesPerDeal;
  assert.equal(fees, "381676.31");
  // Tripwire: the double-stripped figure must never appear.
  assert.notEqual(fees, "340782.42");
});

// --- P7 deals ----------------------------------------------------------------

test("P7 deals needed = goal ÷ fees = 44.33 (Listings SOLD ≡ Buyer ATP)", () => {
  const g = p2026().goals;
  assert.equal(g.listingsSold.yearly, "44.33");
  assert.equal(g.buyerAtp.yearly, "44.33");
});

// --- P8 time splits ----------------------------------------------------------

test("P8 GCI / Net Income / deals split ÷12 (monthly) and ÷48 (weekly)", () => {
  const g = p2026().goals;
  assert.deepEqual(g.gci, {
    yearly: "16920000.00",
    monthly: "1410000.00",
    weekly: "352500.00",
  });
  assert.deepEqual(g.netIncome, {
    yearly: "11500000.00",
    monthly: "958333.33",
    weekly: "239583.33",
  });
  assert.deepEqual(g.listingsSold, { yearly: "44.33", monthly: "3.69", weekly: "0.92" });
});

test("P8 property — for a clean multiple, monthly×12 = yearly and weekly×48 = yearly", () => {
  const gci = p2026().goals.gci;
  assert.equal(toMoney(gci.monthly).times(12).toFixed(2), "16920000.00");
  assert.equal(toMoney(gci.weekly).times(48).toFixed(2), "16920000.00");
  // weekly ≡ monthly ÷ 4.
  assert.equal(toMoney(gci.monthly).dividedBy(4).toFixed(2), gci.weekly);
});

// --- P9 seller funnel (full-precision chaining) ------------------------------

test("P9 seller funnel = 44.33 / 177.32 / 253.32 / 844.40 / 4,221.98", () => {
  const yearly = p2026().sellerFunnel.stages.map((s) => s.counts.yearly);
  assert.deepEqual(yearly, ["44.33", "177.32", "253.32", "844.40", "4221.98"]);
});

test("P9 seller leads weekly = 4,221.98 ÷ 48 = 87.96", () => {
  const leads = p2026().sellerFunnel.stages.at(-1)!;
  assert.equal(leads.key, "seller_leads");
  assert.equal(leads.counts.weekly, "87.96");
});

// --- P10 buyer funnel --------------------------------------------------------

test("P10 buyer funnel = 44.33 / 147.77 / 211.10 / 2,110.99", () => {
  const yearly = p2026().buyerFunnel.stages.map((s) => s.counts.yearly);
  assert.deepEqual(yearly, ["44.33", "147.77", "211.10", "2110.99"]);
});

// --- the chained-display tripwire (Milestones test plan item 4) ---------------

test("TRIPWIRE — chaining 2-dp display values drifts at S2 (253.31), the engine holds 253.32", () => {
  // Naive chain: round each stage to 2 dp BEFORE dividing.
  const dealsDisplay = toMoney("44.33");
  const s1 = roundCentavos(dealsDisplay.dividedBy("0.25")); // 177.32 (coincidentally exact)
  const s2 = roundCentavos(s1.dividedBy("0.70")); //           253.31 — WRONG
  assert.equal(s1.toFixed(2), "177.32");
  assert.equal(s2.toFixed(2), "253.31");
  // The engine chains at full precision, so its S2 is 253.32 — the drift must fail.
  const engineS2 = p2026().sellerFunnel.stages[2].counts.yearly;
  assert.equal(engineS2, "253.32");
  assert.notEqual(s2.toFixed(2), engineS2);
});

// --- P11 total sales required + the two-formula identity ----------------------

test("P11 total sales required = ₱415,355,587.83 (price × ATP)", () => {
  assert.equal(p2026().pace.totalSalesRequired, "415355587.83");
});

test("P11 identity — goal ÷ yield equals price × ATP to the centavo (full precision)", () => {
  const engine = p2026().pace.totalSalesRequired; // computed price_eff × buyer_atp
  // Independently via goal ÷ yield_eff at full precision.
  const viaGoalOverYield = roundCentavos(
    toMoney("16920000").dividedBy(toMoney(WORKBOOK_PLANNING_BASIS.all_time_yield!))
  ).toFixed(2);
  assert.equal(viaGoalOverYield, "415355587.83");
  assert.equal(viaGoalOverYield, engine);
  // The display-rounded product (9,369,467.35 × 44.33) drifts by ~₱7,100 — proves
  // full precision is required, not chained display values.
  const displayProduct = toMoney("9369467.35").times("44.33").toFixed(2);
  assert.notEqual(displayProduct, engine);
});

// --- P12/P13 pace ------------------------------------------------------------

test("P12/P13 — YTD actual and balance from the M3.4 aggregate", () => {
  const withYtd = plan(
    computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS, {
      ytdActualSales: "161680945.00",
    })
  );
  assert.equal(withYtd.pace.ytdActualSales, "161680945.00");
  assert.equal(withYtd.pace.balanceToTarget, "253674642.83");
});

test("OQ-1 — the rental-inclusion flag's effect at the engine boundary (P12/P13)", () => {
  // The flag lives in the QUERY (getPlanYtdAggregate), not the engine — the engine just
  // consumes whatever Σ list_price it is handed. This proves the two YTD values the flag
  // produces on the 2026 workbook data land as two distinct, exact balances (the OQ-1
  // evidence fixture; the delta is the four rentals' ₱2,400,000 annual-rent volume).
  const include = plan(
    computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS, {
      ytdActualSales: "161680945.00", // p_include_rentals = true (workbook default)
    })
  );
  const exclude = plan(
    computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS, {
      ytdActualSales: "159280945.00", // p_include_rentals = false (sales only)
    })
  );
  assert.equal(include.pace.balanceToTarget, "253674642.83");
  assert.equal(exclude.pace.ytdActualSales, "159280945.00");
  assert.equal(exclude.pace.balanceToTarget, "256074642.83"); // +₱2,400,000 to transact
});

test("balance may be negative (target beaten) and is never clamped", () => {
  const beaten = plan(
    computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, WORKBOOK_PLANNING_BASIS, {
      ytdActualSales: "500000000.00",
    })
  );
  assert.equal(beaten.pace.balanceToTarget, "-84644412.17");
});

test("no aggregate → pace balance is null, total-sales still renders", () => {
  const pace = p2026().pace;
  assert.equal(pace.ytdActualSales, null);
  assert.equal(pace.balanceToTarget, null);
  assert.equal(pace.totalSalesRequired, "415355587.83");
});

// --- criterion 6 — a rate edit recomputes downstream -------------------------

test("AC6 — seller_lead_to_contact 20% → 25% drops Seller Leads 4,221.98 → 3,377.58", () => {
  const rates: FunnelRates = { ...DEFAULT_FUNNEL_RATES, sellerLeadToContact: "0.25" };
  const leads = plan(computePlan(TARGET_2026, rates, WORKBOOK_PLANNING_BASIS)).sellerFunnel.stages.at(
    -1
  )!;
  assert.equal(leads.counts.yearly, "3377.58");
});

// --- criterion 7 — per-year overrides ----------------------------------------

test("AC7 — yield 4.2% + price ₱7,000,000 overrides → fees ₱294,000.00, deals 57.55", () => {
  const result = plan(
    computePlan(
      {
        year: 2027,
        netIncomeTarget: "11500000",
        opexPct: null,
        cosPct: null,
        yieldOverride: "0.042",
        avgPriceOverride: "7000000",
      },
      DEFAULT_FUNNEL_RATES,
      WORKBOOK_PLANNING_BASIS
    )
  );
  assert.equal(result.assumptions.feesPerDeal, "294000.00");
  assert.equal(result.assumptions.priceSource, "override");
  assert.equal(result.assumptions.yieldSource, "override");
  assert.equal(result.goals.listingsSold.yearly, "57.55");
});

test("an override of 0 is treated as unset — falls back to the all-time basis", () => {
  const a = plan(
    computePlan(
      { ...TARGET_2026, yieldOverride: "0", avgPriceOverride: "0" },
      DEFAULT_FUNNEL_RATES,
      WORKBOOK_PLANNING_BASIS
    )
  ).assumptions;
  assert.equal(a.priceSource, "all_time");
  assert.equal(a.yieldSource, "all_time");
});

// --- validation as typed results (never throws) ------------------------------

test("AC5 — opex 60% + cos 40% ⇒ typed net_income_pct_nonpositive, no throw", () => {
  const result = computePlan(
    { ...TARGET_2026, opexPct: "0.60", cosPct: "0.40" },
    DEFAULT_FUNNEL_RATES,
    WORKBOOK_PLANNING_BASIS
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.ok(result.issues.some((i) => i.code === "net_income_pct_nonpositive"));
});

test("AC9 — a null Net Income Target is not plannable (typed issue)", () => {
  const result = computePlan(
    { ...TARGET_2026, netIncomeTarget: null },
    DEFAULT_FUNNEL_RATES,
    WORKBOOK_PLANNING_BASIS
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.ok(result.issues.some((i) => i.code === "net_income_target_missing"));
});

test("a conversion rate outside (0,1] is a typed issue on that field, never a ÷0", () => {
  for (const bad of ["0", "1.5", "-0.1"]) {
    const rates: FunnelRates = { ...DEFAULT_FUNNEL_RATES, listingToSold: bad };
    const result = computePlan(TARGET_2026, rates, WORKBOOK_PLANNING_BASIS);
    assert.equal(result.ok, false, `rate ${bad} should be rejected`);
    if (result.ok) throw new Error("unreachable");
    assert.ok(
      result.issues.some((i) => i.code === "rate_out_of_range" && i.field === "listingToSold")
    );
  }
  // r = 1 (100%) is the valid boundary.
  const ok = computePlan(
    { year: 2026, netIncomeTarget: "11500000", opexPct: null, cosPct: null, yieldOverride: null, avgPriceOverride: null },
    { ...DEFAULT_FUNNEL_RATES, listingToSold: "1" },
    WORKBOOK_PLANNING_BASIS
  );
  assert.equal(ok.ok, true);
});

// --- criterion 8 / rule 5 — empty planning basis -----------------------------

test("AC8 / rule 5 — empty basis with no overrides ⇒ basis_unavailable on both fields", () => {
  const result = computePlan(TARGET_2026, DEFAULT_FUNNEL_RATES, EMPTY_PLANNING_BASIS);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  const fields = result.issues.filter((i) => i.code === "basis_unavailable").map((i) => i.field);
  assert.deepEqual(fields.sort(), ["avgPriceOverride", "yieldOverride"]);
});

test("AC8 — supplying both overrides unblocks a plan on an empty basis (no NaN)", () => {
  const result = plan(
    computePlan(
      { ...TARGET_2026, yieldOverride: "0.042", avgPriceOverride: "7000000" },
      DEFAULT_FUNNEL_RATES,
      EMPTY_PLANNING_BASIS
    )
  );
  assert.equal(result.assumptions.feesPerDeal, "294000.00");
  assert.ok(!result.assumptions.feesPerDeal.includes("NaN"));
});

test("all issues surface together (rates + economic + basis), not just the first", () => {
  const result = computePlan(
    { ...TARGET_2026, netIncomeTarget: null, opexPct: "0.60", cosPct: "0.50" },
    { ...DEFAULT_FUNNEL_RATES, listingToSold: "0" },
    EMPTY_PLANNING_BASIS
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  const codes = new Set(result.issues.map((i) => i.code));
  assert.ok(codes.has("net_income_target_missing"));
  assert.ok(codes.has("net_income_pct_nonpositive"));
  assert.ok(codes.has("rate_out_of_range"));
  assert.ok(codes.has("basis_unavailable"));
});

// --- invariant / property tests ----------------------------------------------

test("property — funnel counts increase strictly upward (dividing by rates ≤ 1)", () => {
  const p = p2026();
  for (const funnel of [p.sellerFunnel, p.buyerFunnel]) {
    for (let i = 1; i < funnel.stages.length; i++) {
      const below = toMoney(funnel.stages[i - 1].counts.yearly);
      const above = toMoney(funnel.stages[i].counts.yearly);
      assert.ok(above.greaterThan(below), `${funnel.side} stage ${i} not increasing`);
    }
  }
});

test("property — working goal ≥ raw target (round-up never shrinks the goal)", () => {
  const m = p2026().economicModel;
  assert.ok(toMoney(m.workingGciGoal).greaterThanOrEqualTo(toMoney(m.gciRawTarget)));
});

test("property — net income % ∈ (0,1] for valid opex/cos", () => {
  for (const [opex, cos] of [["0", "0"], ["0.22", "0.10"], ["0.5", "0.49"]]) {
    const pct = netIncomePct(effectiveOpex(opex), effectiveCos(cos));
    assert.ok(pct.greaterThan(0) && pct.lessThanOrEqualTo(1), `${opex}/${cos}`);
  }
});

// --- single-source with the M6 feed ------------------------------------------

test("deriveAnnualTarget (M6 feed) shares the working-goal rule — same ₱16,920,000", () => {
  const goal = deriveAnnualTarget({ netIncomeTarget: "11500000", opexPct: null, cosPct: null });
  assert.equal(goal, "16920000.00");
  assert.equal(goal, p2026().economicModel.workingGciGoal);
});
