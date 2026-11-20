import { strict as assert } from "node:assert";
import { test } from "node:test";

import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import { parseDeal, type RawDeal } from "@/lib/deals/schema";
import type { DealComputeRefs } from "@/lib/deals/map";
import type { TaxSettings } from "@/types/entities";

/**
 * The app-layer compute+persist pipeline (FR-M1-01/05), from a raw form through
 * the engine to the RPC arguments. It pins two things M1.2 owns on top of the
 * M1.1 engine: that the engine is wired correctly (D021 → NET GCI ₱354,591.84),
 * and that the DB-token bridge (n/a ↔ n_a) is applied on the way to the RPC.
 */

/** Only the four fields the engine reads; the rest of TaxSettings is irrelevant. */
const VAT_REGISTERED = {
  vat_rate: "0.1200",
  ewt_rate: "0.1000",
  property_vat_threshold: "3600000.00",
  vat_registered: true,
} as unknown as TaxSettings;

function parseOrThrow(raw: RawDeal) {
  const result = parseDeal(raw);
  if (!result.ok) throw new Error(`fixture did not validate: ${result.error}`);
  return result.value;
}

const D021_FORM: RawDeal = {
  bookedDate: "2026-07-10",
  transactionType: "sale",
  dealType: "developer",
  developerId: "11111111-1111-1111-1111-111111111111",
  clientName: "Daria & John Salon",
  representation: "double_ended",
  propertyTypeId: "22222222-2222-2222-2222-222222222222",
  leadSourceId: "33333333-3333-3333-3333-333333333333",
  propertyDetails: "House & Lot",
  modeOfPayment: "bank",
  listPrice: "8000000",
  commissionBasis: "percent",
  rate: "5",
  incentiveBilled: "40000",
  incentiveTaxable: "yes",
};

// Abrown Inc. = Net; House & Lot = Threshold (M0 fixtures / WORKBOOK §3).
const D021_REFS: DealComputeRefs = {
  property_vat_rule: "threshold",
  developer_comm_base: "net",
};

test("D021 reproduces the workbook figures to the centavo (DoD)", () => {
  const derived = deriveDeal(parseOrThrow(D021_FORM), D021_REFS, VAT_REGISTERED);

  assert.equal(derived.property_vat, "vat_able");
  assert.equal(derived.net_list_price, "7142857.14");
  assert.equal(derived.comm_base, "net");
  assert.equal(derived.vat_basis, "inclusive");
  assert.equal(derived.gci_net_of_vat, "318877.55");
  assert.equal(derived.incentive_net, "35714.29");
  assert.equal(derived.net_gci, "354591.84");
  assert.equal(derived.vat_memo, "42551.02");
  assert.equal(derived.ewt_memo, "35459.18");
  assert.equal(derived.yield_on_list, "0.044324");
  assert.equal(derived.taxable, true);
});

test("dealRpcArgs carries D021's derived figures as DB tokens", () => {
  const input = parseOrThrow(D021_FORM);
  const args = dealRpcArgs(input, deriveDeal(input, D021_REFS, VAT_REGISTERED));

  // Inclusive/vat_able/net pass through unchanged.
  assert.equal(args.p_property_vat, "vat_able");
  assert.equal(args.p_comm_base, "net");
  assert.equal(args.p_vat_basis, "inclusive");
  assert.equal(args.p_net_gci, "354591.84");
  assert.equal(args.p_rate_pct, "0.05");
  assert.equal(args.p_taxable, true);
});

test("an untaxed resale maps the engine's n/a tokens to the DB's n_a", () => {
  // D004 — resale, no receipt, referral out fixed ₱75,000.
  const input = parseOrThrow({
    bookedDate: "2026-03-10",
    transactionType: "sale",
    dealType: "resale",
    developerId: "",
    clientName: "Mndanao Korean Baptist",
    representation: "double_ended",
    propertyTypeId: "22222222-2222-2222-2222-222222222222",
    leadSourceId: "33333333-3333-3333-3333-333333333333",
    propertyDetails: "House & Lot",
    modeOfPayment: "bank",
    listPrice: "17500000",
    commissionBasis: "percent",
    rate: "5",
    referralOutFixed: "75000",
  });
  const derived = deriveDeal(
    input,
    { property_vat_rule: "threshold", developer_comm_base: null },
    VAT_REGISTERED
  );
  const args = dealRpcArgs(input, derived);

  // Engine 'n/a' → DB 'n_a' on every computed enum.
  assert.equal(args.p_property_vat, "n_a");
  assert.equal(args.p_comm_base, "n_a");
  assert.equal(args.p_vat_basis, "n_a");
  // Untaxed: GCI = billed, NET GCI = 875,000 − 75,000 = 800,000 (§9.2 AC2).
  assert.equal(args.p_gci_net_of_vat, "875000.00");
  assert.equal(args.p_net_gci, "800000.00");
  assert.equal(args.p_taxable, false);
});

test("non-VAT-registered workspace: fixture N1 (D021 inputs, EWT 5%)", () => {
  const nonVat = {
    vat_rate: "0.1200",
    ewt_rate: "0.0500",
    property_vat_threshold: "3600000.00",
    vat_registered: false,
  } as unknown as TaxSettings;

  const derived = deriveDeal(parseOrThrow(D021_FORM), D021_REFS, nonVat);

  // No ÷1.12 anywhere; VAT memo 0; EWT still applies at 5% (§3.2 fixture N1).
  assert.equal(derived.gci_net_of_vat, "357142.86");
  assert.equal(derived.incentive_net, "40000.00");
  assert.equal(derived.net_gci, "397142.86");
  // Engine output is the slash token; the DB 'n_a' is only produced by mapping.
  assert.equal(derived.vat_basis, "n/a");
  assert.equal(derived.vat_memo, "0.00");
  assert.equal(derived.ewt_memo, "19857.14");
});
