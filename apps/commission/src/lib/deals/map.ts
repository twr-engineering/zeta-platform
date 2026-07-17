import type {
  CommBase,
  DealComputeInput,
  DealDerived,
  DealType as EngineDealType,
  PropertyVat as EnginePropertyVat,
  PropertyVatRule,
  VatBasis as EngineVatBasis,
} from "@/lib/engine";
import type {
  DealCommBaseDisplay,
  DealPropertyVat,
  DealVatBasis,
} from "@/types/entities";
import type { DealInput } from "./schema";

/**
 * The one place the DB's enum tokens and the M1.1 engine's tokens meet.
 *
 * The engine (M1.1) speaks the workbook's slash form — deal_type 'n/a',
 * property_vat 'n/a', comm_base 'n/a', vat_basis 'n/a'. The database uses
 * identifier-shaped labels ('n_a') to stay consistent with M0's own enums. The
 * bridge is deliberately tiny and lives HERE, not scattered through the action:
 * the persistence layer maps a row to the engine shape without translation
 * everywhere else (the M1.1 handoff's contract).
 */

/** DB deal_type → engine DealType (only 'n_a' differs). */
export function dealTypeToEngine(t: DealInput["deal_type"]): EngineDealType {
  return t === "n_a" ? "n/a" : t;
}

/** engine PropertyVat → DB deal_property_vat. */
export function propertyVatToDb(v: EnginePropertyVat): DealPropertyVat {
  return v === "n/a" ? "n_a" : v;
}

/** engine CommBaseDisplay → DB deal_comm_base_display. */
export function commBaseToDb(v: DealDerived["comm_base"]): DealCommBaseDisplay {
  return v === "n/a" ? "n_a" : v;
}

/** engine VatBasis → DB deal_vat_basis. */
export function vatBasisToDb(v: EngineVatBasis): DealVatBasis {
  return v === "n/a" ? "n_a" : v;
}

/**
 * The engine's derived figures as the DB tokens/strings a write function takes,
 * WITHOUT the p_ prefix. Shared by dealRpcArgs (which prefixes them) and the
 * bulk recompute (which sends them inside a jsonb batch). Money stays exact
 * strings; the four enum outputs go through the n/a↔n_a bridge above.
 */
export function dealDerivedDbFields(derived: DealDerived) {
  return {
    property_vat: propertyVatToDb(derived.property_vat),
    net_list_price: derived.net_list_price,
    comm_base: commBaseToDb(derived.comm_base),
    vat_basis: vatBasisToDb(derived.vat_basis),
    billed_commission: derived.billed_commission,
    gci_net_of_vat: derived.gci_net_of_vat,
    incentive_net: derived.incentive_net,
    referral_out: derived.referral_out,
    net_gci: derived.net_gci,
    default_total_collectible: derived.default_total_collectible,
    vat_memo: derived.vat_memo,
    ewt_memo: derived.ewt_memo,
    yield_on_list: derived.yield_on_list,
    taxable: derived.taxable,
  };
}

/**
 * The references the engine needs beyond the deal's own inputs: the resolved
 * PropertyType.vat_rule (Rule A) and the resolved Developer.comm_base (Rule C).
 * Both are M0 enum tokens that match the engine's directly — no bridge needed.
 */
export type DealComputeRefs = {
  property_vat_rule: PropertyVatRule;
  developer_comm_base: CommBase | null;
};

/**
 * Assemble the engine's input from a validated deal + its resolved references.
 * The commission discriminated union is rebuilt from the basis + the matching
 * field, so the engine never sees a percent deal with a stray fixed amount.
 */
export function buildComputeInput(
  input: DealInput,
  refs: DealComputeRefs
): DealComputeInput {
  return {
    deal_type: dealTypeToEngine(input.deal_type),
    transaction_type: input.transaction_type,
    representation: input.representation,
    force_vat: input.force_vat,
    property_vat_rule: refs.property_vat_rule,
    list_price: input.list_price,
    commission:
      input.commission_basis === "percent"
        ? { basis: "percent", rate: input.rate_pct as string }
        : { basis: "fixed", amount: input.fixed_amount as string },
    developer_comm_base: refs.developer_comm_base,
    receipt_issued: input.receipt_issued,
    incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable,
    referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed,
  };
}

/**
 * The RPC argument object shared by create_deal and update_deal: the validated
 * inputs plus the engine's derived figures, money as exact strings and enums as
 * DB tokens. update_deal adds p_id / p_expected_version on top of this.
 *
 * Named so the two actions build the payload identically — a divergence between
 * create and update is exactly the kind of drift that produces a deal whose
 * stored figures do not match its inputs.
 */
export function dealRpcArgs(input: DealInput, derived: DealDerived) {
  return {
    p_booked_date: input.booked_date,
    p_transaction_type: input.transaction_type,
    p_deal_type: input.deal_type,
    p_developer_id: input.developer_id,
    p_client_name: input.client_name,
    p_representation: input.representation,
    p_property_type_id: input.property_type_id,
    p_lead_source_id: input.lead_source_id,
    p_property_details: input.property_details,
    p_mode_of_payment: input.mode_of_payment,
    p_list_price: input.list_price,
    p_force_vat: input.force_vat,
    p_commission_basis: input.commission_basis,
    p_rate_pct: input.rate_pct,
    p_fixed_amount: input.fixed_amount,
    p_receipt_issued: input.receipt_issued,
    p_incentive_billed: input.incentive_billed,
    p_incentive_taxable: input.incentive_taxable,
    p_referral_out_pct: input.referral_out_pct,
    p_referral_out_fixed: input.referral_out_fixed,
    p_referral_paid: input.referral_paid,
    // engine-computed
    p_property_vat: propertyVatToDb(derived.property_vat),
    p_net_list_price: derived.net_list_price,
    p_comm_base: commBaseToDb(derived.comm_base),
    p_vat_basis: vatBasisToDb(derived.vat_basis),
    p_billed_commission: derived.billed_commission,
    p_gci_net_of_vat: derived.gci_net_of_vat,
    p_incentive_net: derived.incentive_net,
    p_referral_out: derived.referral_out,
    p_net_gci: derived.net_gci,
    p_default_total_collectible: derived.default_total_collectible,
    p_vat_memo: derived.vat_memo,
    p_ewt_memo: derived.ewt_memo,
    p_yield_on_list: derived.yield_on_list,
    p_taxable: derived.taxable,
  };
}
