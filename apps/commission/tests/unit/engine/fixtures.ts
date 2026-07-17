import type {
  DealComputeInput,
  DealDerived,
  EngineSettings,
} from "../../../src/lib/engine/index.ts";

/**
 * The workbook's verified numbers, as engine fixtures (M1 PRD §9, WORKBOOK §3).
 *
 * Every one of the 21 live deals is reproduced here from the WORKBOOK_REFERENCE
 * table and must recompute to the centavo. The expected values are the sheet's
 * cached figures — the engine is proven against the source of truth, not against
 * its own arithmetic.
 */

/** M0 AC1 defaults on a VAT-registered workspace. */
export const VAT_REGISTERED_SETTINGS: EngineSettings = {
  vat_rate: "0.1200",
  ewt_rate: "0.1000",
  property_vat_threshold: "3600000.00",
  vat_registered: true,
};

/** Fixture N1's workspace: non-VAT-registered, sworn-declaration EWT 5%. */
export const NON_VAT_SETTINGS: EngineSettings = {
  vat_rate: "0.1200",
  ewt_rate: "0.0500",
  property_vat_threshold: "3600000.00",
  vat_registered: false,
};

/** The subset of computed columns the workbook table pins down for every deal. */
export type ExpectedDeal = Pick<
  DealDerived,
  | "property_vat"
  | "net_list_price"
  | "comm_base"
  | "vat_basis"
  | "gci_net_of_vat"
  | "incentive_net"
  | "referral_out"
  | "net_gci"
  | "vat_memo"
  | "ewt_memo"
  | "yield_on_list"
  | "taxable"
>;

export type DealFixture = {
  id: string;
  input: DealComputeInput;
  expected: ExpectedDeal;
};

const BASE: DealComputeInput = {
  deal_type: "resale",
  transaction_type: "sale",
  representation: "double_ended",
  force_vat: false,
  property_vat_rule: "threshold",
  list_price: "0",
  commission: { basis: "percent", rate: "0.05" },
  developer_comm_base: null,
  receipt_issued: false,
  incentive_billed: "0",
  incentive_taxable: null,
  referral_out_pct: "0",
  referral_out_fixed: "0",
};

/** A resale/rental input (untaxed by default, no developer). */
function untaxed(over: Partial<DealComputeInput>): DealComputeInput {
  return { ...BASE, ...over };
}

/** A developer input — always receipted, comm_base from the developer. */
function developer(over: Partial<DealComputeInput>): DealComputeInput {
  return {
    ...BASE,
    deal_type: "developer",
    receipt_issued: true,
    developer_comm_base: "net",
    ...over,
  };
}

/** Untaxed resale/rental expectation scaffold — VAT/EWT always 0, basis n/a. */
function untaxedExpected(over: Partial<ExpectedDeal>): ExpectedDeal {
  return {
    property_vat: "n/a",
    net_list_price: "0.00",
    comm_base: "n/a",
    vat_basis: "n/a",
    gci_net_of_vat: "0.00",
    incentive_net: "0.00",
    referral_out: "0.00",
    net_gci: "0.00",
    vat_memo: "0.00",
    ewt_memo: "0.00",
    yield_on_list: "0.050000",
    taxable: false,
    ...over,
  };
}

/** VAT-inclusive developer expectation scaffold. */
function developerExpected(over: Partial<ExpectedDeal>): ExpectedDeal {
  return {
    property_vat: "vat_able",
    net_list_price: "0.00",
    comm_base: "net",
    vat_basis: "inclusive",
    gci_net_of_vat: "0.00",
    incentive_net: "0.00",
    referral_out: "0.00",
    net_gci: "0.00",
    vat_memo: "0.00",
    ewt_memo: "0.00",
    yield_on_list: "0.000000",
    taxable: true,
    ...over,
  };
}

/**
 * The 21 live deals (WORKBOOK §3). Rows carry the sheet's permanent IDs; the
 * expected values are its cached computed columns.
 */
export const WORKBOOK_DEALS: DealFixture[] = [
  {
    id: "D001",
    input: untaxed({ list_price: "8721000", property_vat_rule: "always_vat" }),
    expected: untaxedExpected({
      net_list_price: "8721000.00",
      gci_net_of_vat: "436050.00",
      net_gci: "436050.00",
    }),
  },
  {
    id: "D002",
    input: untaxed({ list_price: "2530000" }),
    expected: untaxedExpected({
      net_list_price: "2530000.00",
      gci_net_of_vat: "126500.00",
      net_gci: "126500.00",
    }),
  },
  {
    id: "D003",
    input: untaxed({
      list_price: "2350000",
      representation: "seller",
      property_vat_rule: "always_vat",
    }),
    expected: untaxedExpected({
      net_list_price: "2350000.00",
      gci_net_of_vat: "117500.00",
      net_gci: "117500.00",
    }),
  },
  {
    id: "D004",
    input: untaxed({
      list_price: "17500000",
      referral_out_fixed: "75000",
    }),
    expected: untaxedExpected({
      net_list_price: "17500000.00",
      gci_net_of_vat: "875000.00",
      referral_out: "75000.00",
      net_gci: "800000.00",
      yield_on_list: "0.045714",
    }),
  },
  {
    id: "D005",
    input: untaxed({ list_price: "13500000" }),
    expected: untaxedExpected({
      net_list_price: "13500000.00",
      gci_net_of_vat: "675000.00",
      net_gci: "675000.00",
    }),
  },
  {
    id: "D008",
    input: developer({
      list_price: "6955300",
      developer_comm_base: "net",
      incentive_billed: "45000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "6210089.29",
      gci_net_of_vat: "277236.13",
      incentive_net: "40178.57",
      net_gci: "317414.70",
      vat_memo: "38089.76",
      ewt_memo: "31741.47",
      yield_on_list: "0.045636",
    }),
  },
  {
    id: "D017",
    input: untaxed({
      list_price: "270000",
      transaction_type: "rental",
      deal_type: "n/a",
      representation: "lessor",
      commission: { basis: "percent", rate: "1/12" },
    }),
    expected: untaxedExpected({
      net_list_price: "270000.00",
      gci_net_of_vat: "22500.00",
      net_gci: "22500.00",
      yield_on_list: "0.083333",
    }),
  },
  {
    id: "D018",
    input: untaxed({
      list_price: "1560000",
      transaction_type: "rental",
      deal_type: "n/a",
      commission: { basis: "percent", rate: "1/12" },
    }),
    expected: untaxedExpected({
      net_list_price: "1560000.00",
      gci_net_of_vat: "130000.00",
      net_gci: "130000.00",
      yield_on_list: "0.083333",
    }),
  },
  {
    id: "D007",
    // Exactly at the threshold, but a resale → property VAT is n/a regardless.
    input: untaxed({ list_price: "3600000", property_vat_rule: "always_vat" }),
    expected: untaxedExpected({
      net_list_price: "3600000.00",
      gci_net_of_vat: "180000.00",
      net_gci: "180000.00",
    }),
  },
  {
    id: "D019",
    input: untaxed({
      list_price: "120000",
      transaction_type: "rental",
      deal_type: "n/a",
      representation: "lessor",
      commission: { basis: "percent", rate: "1/12" },
    }),
    expected: untaxedExpected({
      net_list_price: "120000.00",
      gci_net_of_vat: "10000.00",
      net_gci: "10000.00",
      yield_on_list: "0.083333",
    }),
  },
  {
    id: "D020",
    input: untaxed({
      list_price: "450000",
      transaction_type: "rental",
      deal_type: "n/a",
      representation: "lessor",
      commission: { basis: "percent", rate: "1/12" },
    }),
    expected: untaxedExpected({
      net_list_price: "450000.00",
      gci_net_of_vat: "37500.00",
      net_gci: "37500.00",
      yield_on_list: "0.083333",
    }),
  },
  {
    id: "D006",
    input: untaxed({ list_price: "7050000", representation: "buyer" }),
    expected: untaxedExpected({
      net_list_price: "7050000.00",
      gci_net_of_vat: "352500.00",
      net_gci: "352500.00",
    }),
  },
  {
    id: "D009",
    input: developer({
      list_price: "12048370",
      developer_comm_base: "gross",
      property_vat_rule: "threshold",
      commission: { basis: "percent", rate: "0.03" },
    }),
    expected: developerExpected({
      comm_base: "gross",
      net_list_price: "10757473.21",
      gci_net_of_vat: "322724.20",
      net_gci: "322724.20",
      vat_memo: "38726.90",
      ewt_memo: "32272.42",
      yield_on_list: "0.026786",
    }),
  },
  {
    id: "D010",
    input: developer({
      list_price: "7011000",
      developer_comm_base: "net",
      property_vat_rule: "always_vat",
      commission: { basis: "percent", rate: "0.07" },
      incentive_billed: "40000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "6259821.43",
      gci_net_of_vat: "391238.84",
      incentive_net: "35714.29",
      net_gci: "426953.13",
      vat_memo: "51234.38",
      ewt_memo: "42695.31",
      yield_on_list: "0.060898",
    }),
  },
  {
    id: "D011",
    input: developer({
      list_price: "12359740",
      developer_comm_base: "gross",
      property_vat_rule: "always_vat",
      commission: { basis: "fixed", amount: "174500" },
    }),
    expected: developerExpected({
      comm_base: "gross",
      net_list_price: "11035482.14",
      gci_net_of_vat: "155803.57",
      net_gci: "155803.57",
      vat_memo: "18696.43",
      ewt_memo: "15580.36",
      yield_on_list: "0.012606",
    }),
  },
  {
    id: "D012",
    input: developer({
      list_price: "13218975",
      developer_comm_base: "gross",
      property_vat_rule: "always_vat",
      commission: { basis: "fixed", amount: "231500" },
    }),
    expected: developerExpected({
      comm_base: "gross",
      net_list_price: "11802656.25",
      gci_net_of_vat: "206696.43",
      net_gci: "206696.43",
      vat_memo: "24803.57",
      ewt_memo: "20669.64",
      yield_on_list: "0.015636",
    }),
  },
  {
    id: "D013",
    input: developer({
      list_price: "19500600",
      developer_comm_base: "net",
      property_vat_rule: "threshold",
      incentive_billed: "145000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "17411250.00",
      gci_net_of_vat: "777287.95",
      incentive_net: "129464.29",
      net_gci: "906752.23",
      vat_memo: "108810.27",
      ewt_memo: "90675.22",
      yield_on_list: "0.046499",
    }),
  },
  {
    id: "D014",
    input: developer({
      list_price: "7956500",
      developer_comm_base: "net",
      property_vat_rule: "threshold",
      incentive_billed: "95000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "7104017.86",
      gci_net_of_vat: "317143.65",
      incentive_net: "84821.43",
      net_gci: "401965.08",
      vat_memo: "48235.81",
      ewt_memo: "40196.51",
      yield_on_list: "0.050520",
    }),
  },
  {
    id: "D015",
    input: developer({
      list_price: "1601600",
      developer_comm_base: "net",
      property_vat_rule: "always_vat",
      incentive_billed: "15000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "1430000.00",
      gci_net_of_vat: "63839.29",
      incentive_net: "13392.86",
      net_gci: "77232.14",
      vat_memo: "9267.86",
      ewt_memo: "7723.21",
      yield_on_list: "0.048222",
    }),
  },
  {
    id: "D016",
    input: developer({
      list_price: "15377860",
      developer_comm_base: "net",
      property_vat_rule: "always_vat",
      incentive_billed: "20000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "13730232.14",
      gci_net_of_vat: "612956.79",
      incentive_net: "17857.14",
      net_gci: "630813.93",
      vat_memo: "75697.67",
      ewt_memo: "63081.39",
      yield_on_list: "0.041021",
    }),
  },
  {
    id: "D021",
    input: developer({
      list_price: "8000000",
      developer_comm_base: "net",
      property_vat_rule: "threshold",
      incentive_billed: "40000",
      incentive_taxable: "yes",
    }),
    expected: developerExpected({
      net_list_price: "7142857.14",
      gci_net_of_vat: "318877.55",
      incentive_net: "35714.29",
      net_gci: "354591.84",
      vat_memo: "42551.02",
      ewt_memo: "35459.18",
      yield_on_list: "0.044324",
    }),
  },
];
