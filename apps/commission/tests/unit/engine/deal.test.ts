import test from "node:test";
import assert from "node:assert/strict";

import { computeDeal } from "../../../src/lib/engine/index.ts";
import type {
  DealComputeInput,
  EngineSettings,
} from "../../../src/lib/engine/index.ts";
import {
  NON_VAT_SETTINGS,
  VAT_REGISTERED_SETTINGS,
  WORKBOOK_DEALS,
  type ExpectedDeal,
} from "./fixtures.ts";

/**
 * M1.1 — the calculation engine, Rules A–J.
 *
 * Every one of the 21 live workbook deals must reproduce to the centavo
 * (M1 PRD §9, Milestones test-plan item 9), plus the §9.1 hand-derivations,
 * the per-rule tests from the milestone test plan, edge cases 1–7 & 14–17, and
 * the non-VAT registration gate (fixture N1).
 */

const S = VAT_REGISTERED_SETTINGS;

/** Assert every computed column the workbook pins down for a deal. */
function assertDerived(input: DealComputeInput, expected: ExpectedDeal): void {
  const d = computeDeal(input, S);
  for (const key of Object.keys(expected) as (keyof ExpectedDeal)[]) {
    assert.equal(d[key], expected[key], `${key} mismatch`);
  }
}

// --- Full-table regression (test plan #9) -----------------------------------

for (const fixture of WORKBOOK_DEALS) {
  test(`${fixture.id} reproduces every workbook figure to the centavo`, () => {
    assertDerived(fixture.input, fixture.expected);
  });
}

test("all 21 workbook deals are present", () => {
  assert.equal(WORKBOOK_DEALS.length, 21);
});

// --- §9.1 canonical hand-derivations (re-derived from the rules) ------------

test("§9.1 D021 — the full chain, every field", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D021")!.input, S);
  assert.equal(d.net_list_price, "7142857.14"); // Rule B
  assert.equal(d.billed_commission, "357142.86"); // Rule E billed
  assert.equal(d.gci_net_of_vat, "318877.55"); // Rule E ÷1.12
  assert.equal(d.incentive_net, "35714.29"); // Rule F
  assert.equal(d.net_gci, "354591.84"); // Rule H
  assert.equal(d.vat_memo, "42551.02"); // Rule I
  assert.equal(d.ewt_memo, "35459.18"); // Rule I
  assert.equal(d.yield_on_list, "0.044324"); // Rule J → 4.4324%
});

test("§9.1 D004 — untaxed resale with referral out", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D004")!.input, S);
  assert.equal(d.gci_net_of_vat, "875000.00");
  assert.equal(d.referral_out, "75000.00");
  assert.equal(d.net_gci, "800000.00");
  assert.equal(d.vat_memo, "0.00");
  assert.equal(d.ewt_memo, "0.00");
  assert.equal(d.yield_on_list, "0.045714");
});

test("§9.1 D011 — Fixed basis ignores comm_base = Gross (edge case 3)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D011")!.input, S);
  assert.equal(d.gci_net_of_vat, "155803.57");
  assert.equal(d.vat_memo, "18696.43");
  assert.equal(d.ewt_memo, "15580.36");
});

// --- Rule A — Property VAT determination ------------------------------------

function developerAt(listPrice: string, rule: DealComputeInput["property_vat_rule"]) {
  return computeDeal(
    {
      ...WORKBOOK_DEALS.find((f) => f.id === "D021")!.input,
      list_price: listPrice,
      property_vat_rule: rule,
      incentive_billed: "0",
      incentive_taxable: null,
    },
    S
  );
}

test("Rule A — threshold boundary: 3,600,000.00 exempt, 3,600,000.01 vat_able (edge case 1)", () => {
  assert.equal(developerAt("3600000.00", "threshold").property_vat, "exempt");
  assert.equal(developerAt("3600000.01", "threshold").property_vat, "vat_able");
});

test("Rule A — always_exempt developer stays exempt above the threshold", () => {
  const d = developerAt("8000000", "always_exempt");
  assert.equal(d.property_vat, "exempt");
  assert.equal(d.net_list_price, "8000000.00"); // Rule B: no ÷1.12 when exempt
  // Still a developer deal → taxable, VAT-inclusive, GCI strips the commission VAT.
  assert.equal(d.vat_basis, "inclusive");
});

test("Rule A/Rule 20 — force_vat lifts a sub-threshold unit to vat_able (edge case 2)", () => {
  const forced = computeDeal(
    { ...developerBaseline(), list_price: "2000000", force_vat: true },
    S
  );
  assert.equal(forced.property_vat, "vat_able");
  const notForced = computeDeal(
    { ...developerBaseline(), list_price: "2000000", force_vat: false },
    S
  );
  assert.equal(notForced.property_vat, "exempt");
});

test("Rule A — resale/rental is never a developer sale → n/a regardless of price", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D007")!.input, S);
  assert.equal(d.property_vat, "n/a"); // ₱3,600,000 resale, still n/a
});

function developerBaseline(): DealComputeInput {
  return {
    ...WORKBOOK_DEALS.find((f) => f.id === "D021")!.input,
    incentive_billed: "0",
    incentive_taxable: null,
  };
}

// --- Rule C — commission base -----------------------------------------------

test("Rule C — Gross base uses list price (D009: 3% × 12,048,370)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D009")!.input, S);
  assert.equal(d.comm_base, "gross");
  assert.equal(d.billed_commission, "361451.10"); // 3% × gross TCP
  assert.equal(d.gci_net_of_vat, "322724.20");
});

test("Rule C — Net base uses net list (D021: 5% × 7,142,857.14…)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D021")!.input, S);
  assert.equal(d.comm_base, "net");
  assert.equal(d.billed_commission, "357142.86");
});

test("Rule C — a developer with no comm_base defaults to Net (M0 §3.5)", () => {
  const d = computeDeal(
    { ...developerBaseline(), developer_comm_base: null },
    S
  );
  assert.equal(d.comm_base, "net");
  // Base = net list ⇒ same billed as D021's explicit Net.
  assert.equal(d.billed_commission, "357142.86");
});

test("Rule C — non-developer base is list price, comm_base n/a", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D001")!.input, S);
  assert.equal(d.comm_base, "n/a");
});

// --- Rule E — billed → GCI --------------------------------------------------

test("Rule E — the VAT-inclusive escape hatch: Fixed 112,000 → GCI 100,000.00", () => {
  // M1 PRD Rule D escape hatch: an Exclusive-style bill (100k + 12k VAT) is
  // booked as Fixed on the VAT-inclusive total, centavo-exact, no special case.
  const d = computeDeal(
    { ...developerBaseline(), commission: { basis: "fixed", amount: "112000" } },
    S
  );
  assert.equal(d.gci_net_of_vat, "100000.00");
});

test("Rule E — untaxed resale: GCI = billed, no ÷1.12 (D001 436,050)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D001")!.input, S);
  assert.equal(d.billed_commission, "436050.00");
  assert.equal(d.gci_net_of_vat, "436050.00");
  assert.equal(d.vat_basis, "n/a");
});

test("Rule D — a receipted resale becomes taxable: GCI drops by ÷1.12 (criterion 7)", () => {
  const base = WORKBOOK_DEALS.find((f) => f.id === "D001")!.input;
  const noReceipt = computeDeal(base, S);
  const withReceipt = computeDeal({ ...base, receipt_issued: true }, S);
  assert.equal(noReceipt.gci_net_of_vat, "436050.00");
  assert.equal(withReceipt.taxable, true);
  assert.equal(withReceipt.vat_basis, "inclusive");
  assert.equal(withReceipt.gci_net_of_vat, "389330.36"); // 436,050 ÷ 1.12
});

test("Rule D — the enum never leaves {inclusive, n/a} (Exclusive has no code path)", () => {
  for (const fixture of WORKBOOK_DEALS) {
    const basis = computeDeal(fixture.input, S).vat_basis;
    assert.ok(basis === "inclusive" || basis === "n/a", `${fixture.id}: ${basis}`);
  }
});

// --- Rule F — incentive ------------------------------------------------------

test("Rule F — taxable incentive on an inclusive deal: 40,000 → 35,714.29", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D021")!.input, S);
  assert.equal(d.incentive_net, "35714.29");
});

test("Rule F — a bigger taxable incentive: 145,000 → 129,464.29 (D013)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D013")!.input, S);
  assert.equal(d.incentive_net, "129464.29");
});

test("Rule F/I — a non-taxable incentive passes through and is excluded from memos (edge case 7)", () => {
  const d = computeDeal(
    {
      ...developerBaseline(),
      incentive_billed: "40000",
      incentive_taxable: "no",
    },
    S
  );
  assert.equal(d.incentive_net, "40000.00"); // carried as-is, not ÷1.12
  // Memo base is GCI only — the incentive is excluded.
  assert.equal(d.gci_net_of_vat, "318877.55");
  assert.equal(d.vat_memo, "38265.31"); // 318,877.551… × 0.12
  assert.equal(d.ewt_memo, "31887.76"); // 318,877.551… × 0.10
});

test("Rule F — an incentive on an untaxed deal passes through", () => {
  const d = computeDeal(
    {
      ...WORKBOOK_DEALS.find((f) => f.id === "D001")!.input,
      incentive_billed: "10000",
      incentive_taxable: "yes",
    },
    S
  );
  assert.equal(d.incentive_net, "10000.00"); // untaxed → as-is
  assert.equal(d.net_gci, "446050.00"); // 436,050 + 10,000
});

// --- Rule G/H — referral out & NET GCI --------------------------------------

test("Rule G — pct and fixed combine: 2% × 875,000 + 10,000 = 27,500 (test plan #5)", () => {
  const d = computeDeal(
    {
      ...WORKBOOK_DEALS.find((f) => f.id === "D004")!.input,
      referral_out_pct: "0.02",
      referral_out_fixed: "10000",
    },
    S
  );
  assert.equal(d.referral_out, "27500.00");
  assert.equal(d.net_gci, "847500.00"); // 875,000 − 27,500
});

// --- Rule I — tax memos ------------------------------------------------------

test("Rule I — D008 memos: 38,089.76 / 31,741.47", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D008")!.input, S);
  assert.equal(d.vat_memo, "38089.76");
  assert.equal(d.ewt_memo, "31741.47");
});

test("Rule I / edge case 14 — EWT is a setting: D021 base at 5% → 17,729.59", () => {
  const settings: EngineSettings = { ...S, ewt_rate: "0.0500" };
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D021")!.input, settings);
  assert.equal(d.ewt_memo, "17729.59"); // 354,591.8367… × 0.05
  assert.equal(d.vat_memo, "42551.02"); // VAT unaffected
});

// --- Rule J — yield ----------------------------------------------------------

test("Rule J — rentals yield on annual rent via exact 1/12 (edge cases 4 & 17)", () => {
  const d = computeDeal(WORKBOOK_DEALS.find((f) => f.id === "D017")!.input, S);
  assert.equal(d.gci_net_of_vat, "22500.00"); // 270,000 × 1/12 exactly
  assert.equal(d.yield_on_list, "0.083333"); // 8.3333%
  assert.equal(d.property_vat, "n/a");
  assert.equal(d.vat_basis, "n/a");
});

// --- Fixture N1 — the non-VAT registration gate (Rule D / §3.2) -------------

test("N1 — D021 inputs on a non-VAT workspace: no ÷1.12, VAT memo 0, EWT at 5%", () => {
  const d = computeDeal(
    WORKBOOK_DEALS.find((f) => f.id === "D021")!.input,
    NON_VAT_SETTINGS
  );
  // Rules A–C unchanged — property VAT is the developer's, not the agent's.
  assert.equal(d.property_vat, "vat_able");
  assert.equal(d.net_list_price, "7142857.14");
  assert.equal(d.comm_base, "net");
  // Rule D — the gate: basis n/a, and taxable means EWT-subject only.
  assert.equal(d.vat_basis, "n/a");
  assert.equal(d.taxable, true);
  // Rule E — no ÷1.12.
  assert.equal(d.gci_net_of_vat, "357142.86");
  // Rule F — incentive as-is.
  assert.equal(d.incentive_net, "40000.00");
  // Rule H.
  assert.equal(d.net_gci, "397142.86");
  // Rule I — VAT memo 0, EWT on the full (undivided) base at 5%.
  assert.equal(d.vat_memo, "0.00");
  assert.equal(d.ewt_memo, "19857.14"); // 397,142.857… × 0.05
  // Rule J.
  assert.equal(d.yield_on_list, "0.049643"); // 4.9643%
});

test("N1 sibling — an untaxed resale is unchanged on a non-VAT workspace (no EWT)", () => {
  const d = computeDeal(
    WORKBOOK_DEALS.find((f) => f.id === "D004")!.input,
    NON_VAT_SETTINGS
  );
  assert.equal(d.gci_net_of_vat, "875000.00");
  assert.equal(d.net_gci, "800000.00");
  assert.equal(d.taxable, false); // untaxed resale stays untaxed
  assert.equal(d.vat_memo, "0.00");
  assert.equal(d.ewt_memo, "0.00");
});

// --- edge case 5 — Referrer representation: math is unchanged ---------------

test("edge case 5 — a Referrer deal computes with the ordinary rate × base math", () => {
  // Representation never touches the money math; a referral-fee-received deal
  // books like any other deal (it only sits on its own Yield-Summary line, M2).
  const d = computeDeal(
    { ...WORKBOOK_DEALS.find((f) => f.id === "D001")!.input, representation: "referrer" },
    S
  );
  assert.equal(d.gci_net_of_vat, "436050.00");
  assert.equal(d.net_gci, "436050.00");
});

// --- M4 Rule K.2 — default_total_collectible (the receivable's cash-in anchor) --

const derivedFor = (id: string) =>
  computeDeal(WORKBOOK_DEALS.find((f) => f.id === id)!.input, S);

test("Rule K.2 — default collectible = GCI + incentive net, NOT net_gci (D004)", () => {
  // D004 has a ₱75,000 referral out: the payor still sends the full ₱875,000 in;
  // booked NET GCI is ₱800,000. The two anchors diverge exactly by the referral.
  const d = derivedFor("D004");
  assert.equal(d.net_gci, "800000.00"); // K.1 booked
  assert.equal(d.default_total_collectible, "875000.00"); // K.2 default (§9 AC2)
});

test("Rule K.2 — no referral out: default collectible equals net_gci (D021)", () => {
  const d = derivedFor("D021");
  assert.equal(d.net_gci, "354591.84");
  assert.equal(d.default_total_collectible, "354591.84");
});

test("Rule K.2 — full-precision default, not summed 2-dp displays (D013)", () => {
  // gci 777,287.9464… + incentive 129,464.2857… = 906,752.2321… → 906,752.23.
  // Summing the rounded displays (777,287.95 + 129,464.29) would give 906,752.24
  // — forbidden per the rounding policy; the value is booked full-precision.
  const d = derivedFor("D013");
  assert.equal(d.default_total_collectible, "906752.23");
  assert.notEqual(d.default_total_collectible, "906752.24");
});

test("Rule K.2 — taxable incentive folds into the default (D008, D010)", () => {
  assert.equal(derivedFor("D008").default_total_collectible, "317414.70");
  assert.equal(derivedFor("D010").default_total_collectible, "426953.13");
});
