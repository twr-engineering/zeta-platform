import test from "node:test";
import assert from "node:assert/strict";

import { computePaymentSplit } from "../../../src/lib/engine/index.ts";
import type { PaymentSplit } from "../../../src/lib/engine/index.ts";
import { NON_VAT_SETTINGS, VAT_REGISTERED_SETTINGS } from "./fixtures.ts";

/**
 * M1.1 — payment split (WORKBOOK §4). The shared money-truth function M5 reuses.
 * Verified against the workbook's live payments and the §9.1 incentive fixture.
 */

const S = VAT_REGISTERED_SETTINGS;

function assertSplit(actual: PaymentSplit, expected: Omit<PaymentSplit, "gross">) {
  assert.equal(actual.net_of_vat, expected.net_of_vat, "K net_of_vat");
  assert.equal(actual.vat, expected.vat, "L vat");
  assert.equal(actual.ewt, expected.ewt, "M ewt");
  assert.equal(actual.net_cash, expected.net_cash, "N net_cash");
  assert.equal(actual.retained, expected.retained, "retained");
}

test("§9.1 — D021 incentive release: 50,000 Inclusive → 44,642.86 / 5,357.14 / 4,464.29 / 45,535.71 / 40,178.57", () => {
  const split = computePaymentSplit(
    {
      gross: "50000",
      vat_basis: "inclusive",
      payment_type: "incentive",
      incentive_taxable: "yes",
      ewt_subject: true,
    },
    S
  );
  assertSplit(split, {
    net_of_vat: "44642.86",
    vat: "5357.14",
    ewt: "4464.29",
    net_cash: "45535.71",
    retained: "40178.57",
  });
});

test("untaxed commission passes straight through (D004: 875,000 → all net)", () => {
  const split = computePaymentSplit(
    {
      gross: "875000",
      vat_basis: "n/a",
      payment_type: "commission",
      incentive_taxable: null,
      ewt_subject: false,
    },
    S
  );
  assertSplit(split, {
    net_of_vat: "875000.00",
    vat: "0.00",
    ewt: "0.00",
    net_cash: "875000.00",
    retained: "875000.00",
  });
});

test("an inclusive commission strips VAT and withholds EWT", () => {
  const split = computePaymentSplit(
    {
      gross: "357142.86",
      vat_basis: "inclusive",
      payment_type: "commission",
      incentive_taxable: null,
      ewt_subject: true,
    },
    S
  );
  // K = 357,142.86 ÷ 1.12 = 318,877.553…; L = H − K; M = K × 0.10; N = H − M.
  assertSplit(split, {
    net_of_vat: "318877.55",
    vat: "38265.31",
    ewt: "31887.76",
    net_cash: "325255.10",
    retained: "286989.80",
  });
});

test("an incentive with Incentive Taxable? = No carries zero VAT/EWT (edge case 7/10)", () => {
  const split = computePaymentSplit(
    {
      gross: "50000",
      vat_basis: "inclusive", // deal is inclusive, but this incentive is not taxable
      payment_type: "incentive",
      incentive_taxable: "no",
      ewt_subject: true,
    },
    S
  );
  assertSplit(split, {
    net_of_vat: "50000.00",
    vat: "0.00",
    ewt: "0.00",
    net_cash: "50000.00",
    retained: "50000.00",
  });
});

test("non-VAT workspace (M5 Rule P5): EWT-subject deal, basis n/a → no VAT, EWT still withheld", () => {
  const split = computePaymentSplit(
    {
      gross: "100000",
      vat_basis: "n/a", // Rule D gate: non-VAT workspace deals are always n/a
      payment_type: "commission",
      incentive_taxable: null,
      ewt_subject: true, // but the deal IS EWT-subject (developer/receipted)
    },
    NON_VAT_SETTINGS // ewt 5%
  );
  assertSplit(split, {
    net_of_vat: "100000.00",
    vat: "0.00",
    ewt: "5000.00", // 100,000 × 0.05, no ÷1.12
    net_cash: "95000.00",
    retained: "95000.00",
  });
});
