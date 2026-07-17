import { strict as assert } from "node:assert";
import { test } from "node:test";

import { derivePaymentSnapshot } from "@/lib/payments/compute";
import type { PaymentInput } from "@/lib/payments/schema";
import type { Deal, TaxSettings } from "@/types/entities";

/**
 * M5.1 — the app-layer split SNAPSHOT wiring (§3.2/§3.3). The math itself is M1's
 * (tests/unit/engine/payment-split.test.ts); this proves M5 wires the referenced
 * deal + settings into computePaymentSplit correctly AND captures the three
 * `*_used` audit anchors (vat_basis_used, ewt_rate_used, vat_rate_used) that make
 * a stored split independently re-derivable. The workbook's 8 live payments are
 * the acceptance fixtures (WORKBOOK §4).
 */

const VAT_SETTINGS: TaxSettings = {
  vat_rate: "0.1200",
  ewt_rate: "0.1000",
  property_vat_threshold: "3600000.00",
  vat_registered: true,
} as unknown as TaxSettings;

const NON_VAT_SETTINGS: TaxSettings = {
  vat_rate: "0.1200",
  ewt_rate: "0.0500",
  property_vat_threshold: "3600000.00",
  vat_registered: false,
} as unknown as TaxSettings;

/** A minimal deal carrying only the fields the split reads. */
function deal(
  over: Partial<Pick<Deal, "vat_basis" | "incentive_taxable" | "taxable">>
): Deal {
  return {
    vat_basis: "n_a",
    incentive_taxable: null,
    taxable: false,
    ...over,
  } as unknown as Deal;
}

function pay(over: Partial<PaymentInput>): PaymentInput {
  return {
    deal_id: "00000000-0000-0000-0000-000000000000",
    payment_date: "2026-07-09",
    gross_amount: "0",
    payment_type: "commission",
    reference_note: null,
    ...over,
  };
}

test("AC1 — D021 incentive 50,000 Inclusive → the centavo-exact snapshot + anchors", () => {
  const snap = derivePaymentSnapshot(
    pay({ gross_amount: "50000.00", payment_type: "incentive" }),
    deal({ vat_basis: "inclusive", incentive_taxable: "yes", taxable: true }),
    VAT_SETTINGS
  );
  assert.equal(snap.split.net_of_vat, "44642.86");
  assert.equal(snap.split.vat, "5357.14");
  assert.equal(snap.split.ewt, "4464.29");
  assert.equal(snap.split.net_cash, "45535.71");
  assert.equal(snap.split.retained, "40178.57");
  // The audit anchors captured at save time.
  assert.equal(snap.vat_basis_used, "inclusive");
  assert.equal(snap.ewt_rate_used, "0.1000");
  assert.equal(snap.vat_rate_used, "0.1200");
});

test("AC2 — the 7 untaxed workbook commission rows: K=H, L=M=0, N=H, basis n_a", () => {
  const untaxed = deal({ vat_basis: "n_a", taxable: false });
  for (const gross of ["436050.00", "875000.00", "22500.00", "130000.00", "10000.00", "37500.00", "352500.00"]) {
    const snap = derivePaymentSnapshot(pay({ gross_amount: gross }), untaxed, VAT_SETTINGS);
    assert.equal(snap.split.net_of_vat, gross, `net = gross for ${gross}`);
    assert.equal(snap.split.vat, "0.00", `vat 0 for ${gross}`);
    assert.equal(snap.split.ewt, "0.00", `ewt 0 for ${gross}`);
    assert.equal(snap.split.net_cash, gross, `net_cash = gross for ${gross}`);
    assert.equal(snap.split.retained, gross, `retained = gross for ${gross}`);
    assert.equal(snap.vat_basis_used, "n_a");
  }
});

test("AC3 — Rule P3: incentive on incentive_taxable=No → zero tax; commission on same deal still splits", () => {
  const d = deal({ vat_basis: "inclusive", incentive_taxable: "no", taxable: true });
  const incentive = derivePaymentSnapshot(
    pay({ gross_amount: "30000.00", payment_type: "incentive" }),
    d,
    VAT_SETTINGS
  );
  assert.equal(incentive.split.net_of_vat, "30000.00");
  assert.equal(incentive.split.vat, "0.00");
  assert.equal(incentive.split.ewt, "0.00");

  const commission = derivePaymentSnapshot(
    pay({ gross_amount: "30000.00", payment_type: "commission" }),
    d,
    VAT_SETTINGS
  );
  // A commission-type release on the same Inclusive deal still splits per P1.
  assert.equal(commission.split.net_of_vat, "26785.71");
  assert.equal(commission.split.vat, "3214.29");
});

test("AC2b — Rule P5 non-VAT workspace: EWT 5%, no ÷1.12 (fixture N1 357,142.86 → EWT 17,857.14)", () => {
  const snap = derivePaymentSnapshot(
    pay({ gross_amount: "357142.86", payment_type: "commission" }),
    // Non-VAT workspace: a taxable deal's vat_basis is n_a yet it is EWT-subject.
    deal({ vat_basis: "n_a", taxable: true }),
    NON_VAT_SETTINGS
  );
  assert.equal(snap.split.net_of_vat, "357142.86");
  assert.equal(snap.split.vat, "0.00");
  // The tax fact ties exactly to the PRD: EWT = 357,142.86 × 0.05 = 17,857.143 → 17,857.14.
  assert.equal(snap.split.ewt, "17857.14");
  // net_cash / retained = gross − full-precision EWT = 357,142.86 − 17,857.143 =
  // 339,285.717 → 339,285.72 (decimal-exact, half-up). The PRD §3.2 worked example
  // shows 339,285.71 — a DISPLAY rounding slip (it subtracts the already-rounded
  // 17,857.14); the engine, the single source of money truth, is correct at .72.
  assert.equal(snap.split.net_cash, "339285.72");
  assert.equal(snap.split.retained, "339285.72");
  assert.equal(snap.ewt_rate_used, "0.0500");
});

test("AC6 — an EWT-rate change re-snapshots on the NEW rate (50,000 Inclusive → 2,232.14 @ 5%)", () => {
  const at5pct: TaxSettings = { ...VAT_SETTINGS, ewt_rate: "0.0500" } as TaxSettings;
  const snap = derivePaymentSnapshot(
    pay({ gross_amount: "50000.00", payment_type: "incentive" }),
    deal({ vat_basis: "inclusive", incentive_taxable: "yes", taxable: true }),
    at5pct
  );
  assert.equal(snap.split.ewt, "2232.14");
  assert.equal(snap.ewt_rate_used, "0.0500");
});
