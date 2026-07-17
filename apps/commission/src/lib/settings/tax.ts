import { Money, percentToRate, rateToPercent, toMoney } from "@/lib/money";

/**
 * Tax settings: parsing, validation, and the rule-3/rule-9 classification.
 *
 * Pure — no database, no React. Everything here is decided the same way on the
 * server (where it is enforced) and in the browser (where it is a courtesy), and
 * is unit-testable without a workspace.
 *
 * THE TWO RULES THIS MODULE ENCODES
 *
 *  - Rule 3: a settings change that restates booked money needs an explicit
 *    confirmation and queues a recompute. Which fields those are is
 *    `MONEY_RESTATING_FIELDS` below, and that list is the single source of truth
 *    — the server action, the UI copy, and the database's event emission all
 *    read it (the SQL half mirrors it in update_tax_settings).
 *  - Rule 9: friction-gating replaces role-gating. The gate is on those same
 *    fields, and deliberately not on the others.
 */

export const TAX_FIELDS = [
  "vat_rate",
  "vat_registered",
  "ewt_rate",
  "property_vat_threshold",
  "chase_idle_months",
] as const;

export type TaxField = (typeof TAX_FIELDS)[number];

/**
 * The fields that restate money already booked (M0 rule 3).
 *
 * `chase_idle_months` is absent on purpose: it drives M6's "⚠ chase" flag —
 * when a receivable is *nagged about*, not what it is worth. No peso figure
 * moves, so gating it would spend the agent's attention on a change that cannot
 * hurt them, and rule 9's gate works only while it still means something (see
 * the note in @/lib/friction/gate).
 */
export const MONEY_RESTATING_FIELDS: readonly TaxField[] = [
  "vat_rate",
  "vat_registered",
  "ewt_rate",
  "property_vat_threshold",
];

/** Human labels — used by the form, the confirmation copy and the audit viewer. */
export const TAX_FIELD_LABELS: Record<TaxField, string> = {
  vat_rate: "Output VAT on commission",
  vat_registered: "VAT registration",
  ewt_rate: "Expanded withholding tax (EWT)",
  property_vat_threshold: "Property VAT threshold",
  chase_idle_months: "Chase idle threshold",
};

/**
 * What the agent typed. Strings throughout: this is keyboard input, and a
 * `number` here would put a float in front of a money column (Master PRD §4.3).
 */
export type TaxSettingsFormInput = {
  vatRatePercent: string;
  ewtRatePercent: string;
  propertyVatThreshold: string;
  chaseIdleMonths: string;
  vatRegistered: boolean;
};

/** Exactly what the RPC takes: rates as exact decimal strings. */
export type TaxSettingsValues = {
  vat_rate: string;
  vat_registered: boolean;
  ewt_rate: string;
  property_vat_threshold: string;
  chase_idle_months: number;
};

export type TaxFieldErrors = Partial<Record<TaxField, string>>;

export type ParseResult =
  | { ok: true; values: TaxSettingsValues }
  | { ok: false; errors: TaxFieldErrors };

/**
 * Column scales, mirrored from the migration. These are not cosmetic:
 * `numeric(6,4)` ROUNDS silently on insert, so an unvalidated 12.345% would be
 * stored as 0.1235 and the agent would never be told their rate changed. A rate
 * carries 4 decimals, which is 2 decimals as a percentage.
 */
const RATE_DP = 4;
const PERCENT_DP = RATE_DP - 2;
const AMOUNT_DP = 2;

function parsePercentField(
  raw: string,
  field: TaxField,
  { min, max, minInclusive }: { min: string; max: string; minInclusive: boolean }
): { value: string } | { error: string } {
  const cleaned = raw.replace(/[%,\s]/g, "").trim();

  if (cleaned === "") {
    return { error: `${TAX_FIELD_LABELS[field]} is required.` };
  }
  if (!/^\d*\.?\d+$/.test(cleaned)) {
    return { error: "Enter a percentage, like 12 or 12.5." };
  }

  let percent;
  try {
    percent = new Money(cleaned);
  } catch {
    return { error: "Enter a percentage, like 12 or 12.5." };
  }

  if (!percent.isFinite()) {
    return { error: "Enter a percentage, like 12 or 12.5." };
  }

  if (percent.decimalPlaces() > PERCENT_DP) {
    return {
      error: `Rates are stored to ${PERCENT_DP} decimal places — enter at most ${PERCENT_DP} (e.g. 12.50).`,
    };
  }

  const lowerOk = minInclusive
    ? percent.greaterThanOrEqualTo(min)
    : percent.greaterThan(min);

  if (!lowerOk) {
    return {
      error: minInclusive
        ? `Must be ${min}% or more.`
        : `Must be more than ${min}%.`,
    };
  }

  if (!percent.lessThan(max)) {
    return { error: `Must be less than ${max}%.` };
  }

  // toFixed(4), not toString(): the column is numeric(6,4) and the audit trail
  // compares stored values as text, so "0.1200" and "0.12" must not both be
  // reachable for the same rate.
  return { value: percentToRate(percent).toFixed(RATE_DP) };
}

/**
 * Validates and converts the form's raw text into what the database takes.
 *
 * The ranges mirror the table's CHECK constraints exactly (M0 §3.3). Both
 * layers exist deliberately: the constraint is the enforcement — a forged
 * request never gets past it — and this is what turns a Postgres
 * `check_violation` into a sentence the agent can act on.
 */
export function parseTaxSettingsForm(input: TaxSettingsFormInput): ParseResult {
  const errors: TaxFieldErrors = {};
  const values: Partial<TaxSettingsValues> = {
    vat_registered: input.vatRegistered,
  };

  // tax_settings_vat_rate_range: vat_rate > 0 and vat_rate < 1
  const vat = parsePercentField(input.vatRatePercent, "vat_rate", {
    min: "0",
    max: "100",
    minInclusive: false,
  });
  if ("error" in vat) errors.vat_rate = vat.error;
  else values.vat_rate = vat.value;

  // tax_settings_ewt_rate_range: ewt_rate >= 0 and ewt_rate < 1. Zero is legal
  // — an agent whose payor withholds nothing is a real case.
  const ewt = parsePercentField(input.ewtRatePercent, "ewt_rate", {
    min: "0",
    max: "100",
    minInclusive: true,
  });
  if ("error" in ewt) errors.ewt_rate = ewt.error;
  else values.ewt_rate = ewt.value;

  // tax_settings_threshold_positive: property_vat_threshold > 0
  const thresholdRaw = input.propertyVatThreshold.replace(/[₱,\s]/g, "").trim();
  if (thresholdRaw === "") {
    errors.property_vat_threshold = "Property VAT threshold is required.";
  } else if (!/^\d*\.?\d+$/.test(thresholdRaw)) {
    errors.property_vat_threshold = "Enter an amount, like 3,600,000.";
  } else {
    const amount = toMoney(thresholdRaw);
    if (!amount.isFinite()) {
      errors.property_vat_threshold = "Enter an amount, like 3,600,000.";
    } else if (amount.decimalPlaces() > AMOUNT_DP) {
      errors.property_vat_threshold =
        "Amounts are stored to the centavo — enter at most 2 decimal places.";
    } else if (!amount.greaterThan(0)) {
      errors.property_vat_threshold = "Must be more than ₱0.00.";
    } else {
      values.property_vat_threshold = amount.toFixed(AMOUNT_DP);
    }
  }

  // tax_settings_chase_idle_min: chase_idle_months >= 1, integer
  const monthsRaw = input.chaseIdleMonths.trim();
  if (monthsRaw === "") {
    errors.chase_idle_months = "Chase idle threshold is required.";
  } else if (!/^\d+$/.test(monthsRaw)) {
    errors.chase_idle_months = "Enter a whole number of months.";
  } else {
    const months = Number.parseInt(monthsRaw, 10);
    if (months < 1) errors.chase_idle_months = "Must be at least 1 month.";
    else if (!Number.isSafeInteger(months)) {
      errors.chase_idle_months = "That is not a plausible number of months.";
    } else values.chase_idle_months = months;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, values: values as TaxSettingsValues };
}

/** The stored row, as the form's text. Used to populate and to diff against. */
export function taxSettingsToFormInput(values: TaxSettingsValues): TaxSettingsFormInput {
  return {
    vatRatePercent: rateToPercent(values.vat_rate).toFixed(PERCENT_DP),
    ewtRatePercent: rateToPercent(values.ewt_rate).toFixed(PERCENT_DP),
    propertyVatThreshold: toMoney(values.property_vat_threshold).toFixed(AMOUNT_DP),
    chaseIdleMonths: String(values.chase_idle_months),
    vatRegistered: values.vat_registered,
  };
}

/**
 * Which fields actually changed.
 *
 * Rates compare as **decimals**, not strings: "0.1200" and "0.12" are the same
 * rate, and re-saving a form that rendered one as the other is not a change.
 * (The audit trail records the stored *text* instead — update_tax_settings
 * diffs the row it locked — because there the question is what was persisted,
 * not what it is worth. This diff only decides whether to write at all.)
 */
export function diffTaxSettings(
  before: TaxSettingsValues,
  next: TaxSettingsValues
): TaxField[] {
  const changed: TaxField[] = [];

  for (const field of TAX_FIELDS) {
    if (field === "chase_idle_months") {
      if (before.chase_idle_months !== next.chase_idle_months) changed.push(field);
      continue;
    }
    if (field === "vat_registered") {
      if (before.vat_registered !== next.vat_registered) changed.push(field);
      continue;
    }
    if (!toMoney(before[field]).equals(toMoney(next[field]))) changed.push(field);
  }

  return changed;
}

/** The money-restating subset of a change set (rule 3). */
export function restatingFields(changed: readonly TaxField[]): TaxField[] {
  return changed.filter((field) => MONEY_RESTATING_FIELDS.includes(field));
}

/**
 * Does this change need the friction gate (rule 9)?
 *
 * The server calls this and refuses without a valid confirmation; the client
 * calls it to decide whether to open the modal. One answer, one place — a
 * client that guessed differently would either nag or, worse, skip.
 */
export function requiresConfirmation(changed: readonly TaxField[]): boolean {
  return restatingFields(changed).length > 0;
}
