import type {
  DealCommissionBasis,
  DealModeOfPayment,
  DealRepresentation,
  DealTransactionType,
  DealTypeEnum,
  DeveloperCommBase,
  PropertyVatRule,
  ReceivableStatus,
} from "@/types/entities";

/**
 * M1.4 — the workbook's structure, as data. The importer maps by COLUMN POSITION
 * (WORKBOOK_REFERENCE §3) but VALIDATES the header text (v30.13+ layouts): if a
 * header has drifted, the mapping report flags the column rather than importing a
 * silently-misread field. GSheets exports store strings inline and dates as Excel
 * serials (verified against the real v30.20 file).
 */

export const SHEETS = {
  settings: "Settings",
  dealLog: "Deal Log",
  payments: "Payments Log",
  collectibles: "Collectibles",
  gciCalculator: "GCI Calculator",
} as const;

/**
 * GCI Calculator TARGETS table (WORKBOOK §10 — named range TargetTable = B42:G48,
 * one row per year 2026–2032) + the two cells the importer reconciles the derived
 * goal against: PlanYear (D4) and the cached working GCI goal (F8 = ROUNDUP(E8, −4)).
 * Cols: B year, C Net Income Target, D Opex %, E CoS %, F Yield override, G Avg Price
 * override. Blank/0 in D–G (and C) maps to null (rule 10).
 */
export const TARGET_TABLE = {
  firstRow: 42,
  lastRow: 48,
  cols: {
    year: "B",
    net_income_target: "C",
    opex_pct: "D",
    cos_pct: "E",
    yield_override: "F",
    avg_price_override: "G",
  },
  planYearCell: "D4",
  workingGoalCell: "F8",
} as const;

/** Header row (row 5) + first data row (row 6) — shared by the three list sheets. */
export const HEADER_ROW = 5;
export const FIRST_DATA_ROW = 6;

/**
 * Deal Log columns B–AJ (WORKBOOK §3). `expected` is the header text validated at
 * parse time (matched case- and whitespace-insensitively, and as a prefix so a
 * trailing unit like "(₱)" never fails the check). Computed columns are read only
 * for reconciliation.
 */
export const DEAL_COLUMNS = {
  deal_code: { col: "B", expected: "Deal ID" },
  booked_date: { col: "C", expected: "Date" },
  transaction_type: { col: "D", expected: "Transaction Type" },
  deal_type: { col: "E", expected: "Deal Type" },
  developer: { col: "F", expected: "Developer" },
  client_name: { col: "G", expected: "Client" },
  representation: { col: "H", expected: "Agent Representation" },
  property_type: { col: "I", expected: "Property Type" },
  lead_source: { col: "J", expected: "Source" },
  property_details: { col: "K", expected: "Property Details" },
  mode_of_payment: { col: "L", expected: "Mode of Payment" },
  list_price: { col: "M", expected: "List Price" },
  force_vat: { col: "N", expected: "Force VAT" },
  property_vat: { col: "O", expected: "Property VAT" },
  net_list_price: { col: "P", expected: "Net List Price" },
  commission_basis: { col: "Q", expected: "Basis" },
  rate_pct: { col: "R", expected: "Rate" },
  fixed_amount: { col: "S", expected: "Fixed" },
  comm_base: { col: "T", expected: "Comm Base" },
  receipt_issued: { col: "U", expected: "Receipt Issued" },
  vat_basis: { col: "V", expected: "VAT Basis" },
  gci_net_of_vat: { col: "W", expected: "Commission GCI" },
  incentive_billed: { col: "X", expected: "Incentive" },
  incentive_taxable: { col: "Y", expected: "Incentive Taxable" },
  incentive_net: { col: "Z", expected: "Incentive (Net of VAT)" },
  referral_out_pct: { col: "AA", expected: "Referral Out %" },
  referral_out_fixed: { col: "AB", expected: "Referral Out Fixed" },
  referral_out: { col: "AC", expected: "Referral Out" },
  net_gci: { col: "AD", expected: "NET GCI" },
  referral_paid: { col: "AE", expected: "Referral Paid" },
  vat_memo: { col: "AF", expected: "VAT (memo)" },
  ewt_memo: { col: "AG", expected: "EWT (memo)" },
  yield_on_list: { col: "AH", expected: "Yield on List" },
} as const;

/** Payments Log columns (WORKBOOK §4). */
export const PAYMENT_COLUMNS = {
  payment_date: { col: "B", expected: "Date" },
  deal_code: { col: "C", expected: "Deal ID" },
  gross_amount: { col: "H", expected: "Gross Commission" },
  payment_type: { col: "I", expected: "Type" },
  net_of_vat: { col: "K", expected: "Commission (Net of VAT)" },
  vat: { col: "L", expected: "VAT" },
  ewt: { col: "M", expected: "EWT" },
  net_cash: { col: "N", expected: "Net Cash" },
  reference_note: { col: "O", expected: "OR / Invoice / Note" },
} as const;

/** Collectibles columns (WORKBOOK §5) — the overlay inputs + reconciliation cells. */
export const COLLECTIBLE_COLUMNS = {
  deal_code: { col: "B", expected: "Deal ID" },
  booked_net_gci: { col: "H", expected: "Booked NET GCI" },
  total_collectible: { col: "I", expected: "Total Collectible" },
  status: { col: "J", expected: "Status" },
  confirmed: { col: "R", expected: "Confirmed Collectible" },
  note: { col: "T", expected: "Next Action" },
} as const;

/** Settings-sheet section anchors, located by label in column B (row-drift safe). */
export const SETTINGS_LABELS = {
  vatRate: "VAT rate",
  ewtRate: "EWT rate",
  vatThreshold: "VAT threshold",
  chaseIdle: "Chase idle threshold",
  propertyTypeHeader: "Property Type", // its VAT-Rule header row
  developerHeader: "Developer", // its Comm-Base header row
  leadSourceHeader: "Source", // the lead-source list header
} as const;

// --- Token maps: workbook text → DB enum tokens -----------------------------

function norm(v: string): string {
  return v.trim().toLowerCase();
}

const TRANSACTION_TYPE: Record<string, DealTransactionType> = {
  sale: "sale",
  rental: "rental",
};
const DEAL_TYPE: Record<string, DealTypeEnum> = {
  developer: "developer",
  resale: "resale",
  "n/a": "n_a",
  "n / a": "n_a",
  na: "n_a",
};
const REPRESENTATION: Record<string, DealRepresentation> = {
  "double ended": "double_ended",
  seller: "seller",
  buyer: "buyer",
  lessor: "lessor",
  lessee: "lessee",
  referrer: "referrer",
};
const MODE_OF_PAYMENT: Record<string, DealModeOfPayment> = {
  cash: "cash",
  bank: "bank",
  pagibig: "pagibig",
  "pag-ibig": "pagibig",
  "deferred cash": "deferred_cash",
};
const COMMISSION_BASIS: Record<string, DealCommissionBasis> = {
  "%": "percent",
  percent: "percent",
  fixed: "fixed",
};
const PROPERTY_VAT_RULE: Record<string, PropertyVatRule> = {
  threshold: "threshold",
  "always vat": "always_vat",
  "always-vat": "always_vat",
  "always exempt": "always_exempt",
};
const COMM_BASE: Record<string, DeveloperCommBase> = {
  gross: "gross",
  net: "net",
};
const RECEIVABLE_STATUS: Record<string, ReceivableStatus> = {
  open: "open",
  closed: "closed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

function lookup<T>(map: Record<string, T>, raw: string, label: string): T {
  const hit = map[norm(raw)];
  if (hit === undefined) {
    throw new Error(`Unrecognised ${label} value "${raw}" in the workbook.`);
  }
  return hit;
}

export const toTransactionType = (v: string) =>
  lookup(TRANSACTION_TYPE, v, "Transaction Type");
export const toDealType = (v: string) => lookup(DEAL_TYPE, v, "Deal Type");
export const toRepresentation = (v: string) =>
  lookup(REPRESENTATION, v, "Agent Representation");
export const toModeOfPayment = (v: string) =>
  lookup(MODE_OF_PAYMENT, v, "Mode of Payment");
export const toCommissionBasis = (v: string) =>
  lookup(COMMISSION_BASIS, v, "Basis");
export const toPropertyVatRule = (v: string) =>
  lookup(PROPERTY_VAT_RULE, v, "VAT Rule");
export const toCommBase = (v: string) => lookup(COMM_BASE, v, "Comm Base");
export const toReceivableStatus = (v: string) =>
  lookup(RECEIVABLE_STATUS, v, "Status");

/** Payment Type: blank ≡ Commission (WORKBOOK register item 9). */
export function toPaymentType(v: string): "commission" | "incentive" {
  const n = norm(v);
  if (n === "" || n === "commission") return "commission";
  if (n === "incentive") return "incentive";
  throw new Error(`Unrecognised payment Type value "${v}" in the workbook.`);
}

/** Yes ⇒ true; No/blank ⇒ false (Force VAT, Receipt Issued, Referral Paid). */
export function toYesBool(v: string): boolean {
  return norm(v) === "yes";
}

/** Incentive Taxable?: Yes | No | blank(=null → engine treats as Yes). */
export function toIncentiveTaxable(v: string): "yes" | "no" | null {
  const n = norm(v);
  if (n === "" || n === "blank") return null;
  if (n === "yes") return "yes";
  if (n === "no") return "no";
  throw new Error(`Unrecognised Incentive Taxable value "${v}" in the workbook.`);
}

/** A header matches when the found text starts with the expected label. */
export function headerMatches(expected: string, found: string): boolean {
  return norm(found).startsWith(norm(expected));
}
