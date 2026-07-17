import test from "node:test";
import assert from "node:assert/strict";

import {
  MONEY_RESTATING_FIELDS,
  diffTaxSettings,
  parseTaxSettingsForm,
  requiresConfirmation,
  restatingFields,
  taxSettingsToFormInput,
  type TaxSettingsFormInput,
  type TaxSettingsValues,
} from "../../src/lib/settings/tax.ts";
import { recomputeConsequence } from "../../src/lib/settings/recompute.ts";

/**
 * M0.2 — tax settings.
 *
 * Covers the milestone's Definition of Done ("invalid values (VAT = 0,
 * threshold ≤ 0, idle < 1) rejected; unit tests cover boundaries") and test plan
 * items 2 and 4. The DB's CHECK constraints are the actual enforcement — these
 * assert that the form layer refuses the same values, so the agent gets a
 * sentence instead of a Postgres error.
 */

/** M0 AC1 defaults: 12% / 10% / ₱3,600,000.00 / 3 months. */
const DEFAULTS: TaxSettingsValues = {
  vat_rate: "0.1200",
  vat_registered: true,
  ewt_rate: "0.1000",
  property_vat_threshold: "3600000.00",
  chase_idle_months: 3,
};

const DEFAULT_FORM: TaxSettingsFormInput = {
  vatRatePercent: "12.00",
  ewtRatePercent: "10.00",
  propertyVatThreshold: "3600000.00",
  chaseIdleMonths: "3",
  vatRegistered: true,
};

function form(overrides: Partial<TaxSettingsFormInput> = {}): TaxSettingsFormInput {
  return { ...DEFAULT_FORM, ...overrides };
}

function parseOk(input: TaxSettingsFormInput): TaxSettingsValues {
  const result = parseTaxSettingsForm(input);
  assert.equal(result.ok, true, "expected the input to parse");
  if (!result.ok) throw new Error("unreachable");
  return result.values;
}

// --- percent entry → decimal storage (M0 §6) --------------------------------

test("percent entry is stored as an exact decimal string, never a float", () => {
  const values = parseOk(form({ vatRatePercent: "12", ewtRatePercent: "10" }));

  // Strings, at the column's scale. A float would show up here as 0.12000000000000001.
  assert.equal(values.vat_rate, "0.1200");
  assert.equal(values.ewt_rate, "0.1000");
  assert.equal(typeof values.vat_rate, "string");
});

test("the sworn-declaration path: 10% → 5% stores 0.0500 (milestone demo script)", () => {
  const values = parseOk(form({ ewtRatePercent: "5" }));
  assert.equal(values.ewt_rate, "0.0500");
});

test("fractional percents keep their scale", () => {
  assert.equal(parseOk(form({ ewtRatePercent: "12.5" })).ewt_rate, "0.1250");
  assert.equal(parseOk(form({ ewtRatePercent: "0.01" })).ewt_rate, "0.0001");
  assert.equal(parseOk(form({ vatRatePercent: "99.99" })).vat_rate, "0.9999");
});

test("a percent sign and thousands separators are tolerated, not rejected", () => {
  assert.equal(parseOk(form({ ewtRatePercent: " 5% " })).ewt_rate, "0.0500");
  assert.equal(
    parseOk(form({ propertyVatThreshold: "₱ 3,600,000.00" })).property_vat_threshold,
    "3600000.00"
  );
});

test("a rate finer than the column's scale is refused, not silently rounded", () => {
  // numeric(6,4) would store 12.345% as 0.1235 without a word to the agent.
  // Their rate would simply be wrong, so the input is refused instead.
  const result = parseTaxSettingsForm(form({ ewtRatePercent: "12.345" }));
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.errors.ewt_rate ?? "", /decimal places/);
});

test("an amount finer than the centavo is refused, not silently rounded", () => {
  const result = parseTaxSettingsForm(form({ propertyVatThreshold: "3600000.005" }));
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.errors.property_vat_threshold ?? "", /centavo/);
});

// --- validation boundaries (test plan #2; mirrors the CHECK constraints) ----

test("vat_rate ∈ (0,1): 0% is refused (tax_settings_vat_rate_range)", () => {
  const result = parseTaxSettingsForm(form({ vatRatePercent: "0" }));
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.ok(result.errors.vat_rate);
});

test("vat_rate ∈ (0,1): 100% is refused, 99.99% is accepted", () => {
  assert.equal(parseTaxSettingsForm(form({ vatRatePercent: "100" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ vatRatePercent: "99.99" })).ok, true);
});

test("ewt_rate ∈ [0,1): 0% is ACCEPTED — the range differs from VAT's", () => {
  // Not a copy-paste of the VAT rule: a payor who withholds nothing is real,
  // and the constraint is `ewt_rate >= 0` where VAT's is `> 0`.
  const values = parseOk(form({ ewtRatePercent: "0" }));
  assert.equal(values.ewt_rate, "0.0000");
});

test("ewt_rate ∈ [0,1): 100% is refused", () => {
  assert.equal(parseTaxSettingsForm(form({ ewtRatePercent: "100" })).ok, false);
});

test("threshold > 0: zero and negatives are refused", () => {
  assert.equal(parseTaxSettingsForm(form({ propertyVatThreshold: "0" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ propertyVatThreshold: "-1" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ propertyVatThreshold: "0.01" })).ok, true);
});

test("chase_idle_months >= 1 and integral", () => {
  assert.equal(parseTaxSettingsForm(form({ chaseIdleMonths: "0" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ chaseIdleMonths: "-1" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ chaseIdleMonths: "2.5" })).ok, false);
  assert.equal(parseTaxSettingsForm(form({ chaseIdleMonths: "1" })).ok, true);
});

test("empty and non-numeric input is refused per field", () => {
  const result = parseTaxSettingsForm(
    form({ vatRatePercent: "", ewtRatePercent: "abc", chaseIdleMonths: "" })
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.ok(result.errors.vat_rate);
  assert.ok(result.errors.ewt_rate);
  assert.ok(result.errors.chase_idle_months);
});

// --- round trip -------------------------------------------------------------

test("stored values round-trip through the form unchanged", () => {
  const roundTripped = parseOk(taxSettingsToFormInput(DEFAULTS));
  assert.deepEqual(roundTripped, DEFAULTS);
});

test("AC1 defaults render as the percentages the agent expects", () => {
  const input = taxSettingsToFormInput(DEFAULTS);
  assert.equal(input.vatRatePercent, "12.00");
  assert.equal(input.ewtRatePercent, "10.00");
  assert.equal(input.propertyVatThreshold, "3600000.00");
  assert.equal(input.chaseIdleMonths, "3");
});

// --- the diff ---------------------------------------------------------------

test("an unchanged form is not a change", () => {
  assert.deepEqual(diffTaxSettings(DEFAULTS, parseOk(taxSettingsToFormInput(DEFAULTS))), []);
});

test("rates compare by value, so 0.12 and 0.1200 are not a change", () => {
  // The form renders "12.00" and a stored "0.12" would parse back to "0.1200".
  // Comparing as strings here would report a phantom change and write an audit
  // entry saying a rate moved when it did not.
  const stored: TaxSettingsValues = { ...DEFAULTS, vat_rate: "0.12" };
  assert.deepEqual(diffTaxSettings(stored, { ...DEFAULTS, vat_rate: "0.1200" }), []);
});

test("each field is detected independently", () => {
  assert.deepEqual(diffTaxSettings(DEFAULTS, { ...DEFAULTS, ewt_rate: "0.0500" }), [
    "ewt_rate",
  ]);
  assert.deepEqual(diffTaxSettings(DEFAULTS, { ...DEFAULTS, chase_idle_months: 6 }), [
    "chase_idle_months",
  ]);
  assert.deepEqual(diffTaxSettings(DEFAULTS, { ...DEFAULTS, vat_registered: false }), [
    "vat_registered",
  ]);
  assert.deepEqual(
    diffTaxSettings(DEFAULTS, {
      ...DEFAULTS,
      vat_rate: "0.1000",
      property_vat_threshold: "3000000.00",
    }).sort(),
    ["property_vat_threshold", "vat_rate"]
  );
});

// --- the gate (rule 3 / rule 9) ---------------------------------------------

test("every money-restating field demands a confirmation", () => {
  for (const field of MONEY_RESTATING_FIELDS) {
    assert.equal(
      requiresConfirmation([field]),
      true,
      `${field} restates booked money and must be gated`
    );
  }
});

test("chase_idle_months alone does NOT demand a confirmation", () => {
  // It drives when a receivable is nagged about, not what it is worth. Gating
  // it would train the agent to click through the modal that matters.
  assert.equal(requiresConfirmation(["chase_idle_months"]), false);
  assert.equal(restatingFields(["chase_idle_months"]).length, 0);
});

test("a mixed change is gated on the restating field", () => {
  assert.equal(requiresConfirmation(["chase_idle_months", "ewt_rate"]), true);
  assert.deepEqual(restatingFields(["chase_idle_months", "ewt_rate"]), ["ewt_rate"]);
});

test("no change demands nothing", () => {
  assert.equal(requiresConfirmation([]), false);
});

// --- the confirmation copy --------------------------------------------------

test("with no deals, the consequence does not claim deals will recompute", () => {
  const copy = recomputeConsequence(["ewt_rate"], 0);
  assert.doesNotMatch(copy, /recompute 0/);
  assert.match(copy, /no deals yet/);
});

test("with deals, the consequence states the count and pluralises", () => {
  assert.match(recomputeConsequence(["ewt_rate"], 1), /recompute 1 deal —/);
  assert.match(recomputeConsequence(["ewt_rate"], 12), /recompute 12 deals —/);
});

test("the consequence names every field being changed", () => {
  const copy = recomputeConsequence(["vat_rate", "ewt_rate"], 0);
  assert.match(copy, /Output VAT on commission/);
  assert.match(copy, /Expanded withholding tax/);
});
