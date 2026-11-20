import { strict as assert } from "node:assert";
import { test } from "node:test";

import { dealToFormValues, emptyDealValues } from "@/lib/deals/form-values";
import type { Deal } from "@/types/entities";

/**
 * M1.3 — deal row → form values. The load-bearing conversion is the rate: a
 * stored decimal must come back as the percent the agent typed, and the exact
 * rental fraction must survive verbatim (§4 rule 17), or editing silently
 * rebases the commission.
 */

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    workspace_id: "ws",
    deal_code: "D021",
    booked_date: "2026-07-10",
    transaction_type: "sale",
    deal_type: "developer",
    developer_id: "dev-1",
    client_name: "Daria & John Salon",
    representation: "double_ended",
    property_type_id: "pt-1",
    lead_source_id: "ls-1",
    property_details: "House & Lot",
    mode_of_payment: "bank",
    list_price: "8000000.00",
    force_vat: false,
    commission_basis: "percent",
    rate_pct: "0.05",
    fixed_amount: null,
    receipt_issued: true,
    incentive_billed: "40000.00",
    incentive_taxable: "yes",
    referral_out_pct: "0",
    referral_out_fixed: "0.00",
    referral_paid: false,
    property_vat: "vat_able",
    net_list_price: "7142857.14",
    comm_base: "net",
    vat_basis: "inclusive",
    billed_commission: "357142.86",
    gci_net_of_vat: "318877.55",
    incentive_net: "35714.29",
    referral_out: "0.00",
    net_gci: "354591.84",
    vat_memo: "42551.02",
    ewt_memo: "35459.18",
    yield_on_list: "0.044324",
    taxable: true,
    booked_year: 2026,
    display_label: "D021 — Daria & John Salon",
    archived_at: null,
    version: 1,
    created_by: "u1",
    updated_by: "u1",
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    ...overrides,
  } as Deal;
}

test("a 5% stored rate (0.05) displays as the percent '5'", () => {
  assert.equal(dealToFormValues(deal({})).rate, "5");
});

test("a 7% stored rate (0.07) displays as '7'", () => {
  assert.equal(dealToFormValues(deal({ rate_pct: "0.07" })).rate, "7");
});

test("the exact rental fraction 1/12 survives verbatim", () => {
  const values = dealToFormValues(
    deal({ transaction_type: "rental", deal_type: "n_a", rate_pct: "1/12", developer_id: null })
  );
  assert.equal(values.rate, "1/12");
});

test("a fixed-basis deal carries no rate and shows its fixed amount", () => {
  const values = dealToFormValues(
    deal({ commission_basis: "fixed", rate_pct: null, fixed_amount: "174500.00" })
  );
  assert.equal(values.rate, "");
  assert.equal(values.fixedAmount, "174500.00");
});

test("incentive_taxable null (blank = Yes) maps to the 'blank' option", () => {
  assert.equal(dealToFormValues(deal({ incentive_taxable: null })).incentiveTaxable, "blank");
});

test("a referral-out rate 0.02 displays as '2'", () => {
  assert.equal(dealToFormValues(deal({ referral_out_pct: "0.02" })).referralOutPct, "2");
});

test("empty values default to a Sale on the given date with a percent basis", () => {
  const v = emptyDealValues("2026-07-18");
  assert.equal(v.bookedDate, "2026-07-18");
  assert.equal(v.transactionType, "sale");
  assert.equal(v.commissionBasis, "percent");
  assert.equal(v.incentiveTaxable, "blank");
});
