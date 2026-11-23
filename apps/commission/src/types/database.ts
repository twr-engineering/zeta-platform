/**
 * The money-safe view of the generated schema types. Import from here, never
 * from `./database.generated`.
 *
 * WHY THIS LAYER EXISTS
 *
 * `supabase gen types` types every Postgres `numeric` as `number`, because that
 * is what PostgREST returns by default — a JSON number, which `JSON.parse`
 * makes an IEEE-754 float. Master PRD §4.3 forbids binary floats in money
 * paths, so the generator's output is *wrong for this product*. Verified live
 * against the project on 2026-07-17:
 *
 *   select("*")               -> ewt_rate: 0.1,      threshold: 3600000
 *                                (float, and the 4dp/2dp scale is gone)
 *   select("ewt_rate::text")  -> ewt_rate: "0.1000", threshold: "3600000.00"
 *
 * Queries therefore cast money columns with `::text` (see
 * `@/lib/supabase/selects`), and this module re-types those columns as `string`
 * to match what actually arrives. Hand-editing the generated file instead would
 * work exactly until the next `gen types`, which would silently reintroduce the
 * float — the failure mode being a product that quietly stops tying to the
 * centavo. Keeping the override here means regeneration is safe.
 *
 * Adding a table with money columns (M1 deals, M4 receivables, M5 payments)?
 * Add its `::text` select to `@/lib/supabase/selects` AND its override below.
 */

import type { Database as Generated, Json } from "./database.generated";

export type { Json };

type CommissionSchema = Generated["commission"];
type GeneratedTables = CommissionSchema["Tables"];

/** Re-type `K` as the exact-decimal string it is fetched as. */
type WithMoneyStrings<Row, K extends keyof Row> = Omit<Row, K> &
  Record<K, string>;

/** Same, for Insert/Update shapes where the columns are optional. */
type WithOptionalMoneyStrings<Row, K extends keyof Row> = Omit<Row, K> &
  Partial<Record<K, string>>;

// --- tax_settings (M0 §3.3) -------------------------------------------------

type TaxSettingsTable = GeneratedTables["tax_settings"];

/** numeric(6,4), numeric(6,4), numeric(14,2) */
type TaxSettingsMoneyColumns =
  | "vat_rate"
  | "ewt_rate"
  | "property_vat_threshold";

type TaxSettingsOverride = Omit<TaxSettingsTable, "Row" | "Insert" | "Update"> & {
  Row: WithMoneyStrings<TaxSettingsTable["Row"], TaxSettingsMoneyColumns>;
  Insert: WithOptionalMoneyStrings<
    TaxSettingsTable["Insert"],
    TaxSettingsMoneyColumns
  >;
  Update: WithOptionalMoneyStrings<
    TaxSettingsTable["Update"],
    TaxSettingsMoneyColumns
  >;
};

// --- audit_log_entry (M0 §3.7) ----------------------------------------------

type AuditTable = GeneratedTables["audit_log_entry"];

type AuditOverride = Omit<AuditTable, "Update" | "Row"> & {
  Row: Omit<AuditTable["Row"], "field_changes"> & {
    field_changes: FieldChanges;
  };
  /**
   * Append-only: a database trigger rejects every UPDATE (M0 §8). The generator
   * cannot know that, so the type says it here — a compile error is a kinder
   * teacher than a runtime `restrict_violation`.
   */
  Update: never;
};

// --- settings_change_event (M0 rule 3; M0.2's recompute contract) ------------

type SettingsEventTable = GeneratedTables["settings_change_event"];

type SettingsEventOverride = Omit<SettingsEventTable, "Row" | "Update"> & {
  Row: Omit<SettingsEventTable["Row"], "field_changes"> & {
    field_changes: FieldChanges;
  };
  /**
   * Consumption is the only permitted update (a trigger rejects the rest), so
   * the type offers only the consumption stamp. M1 marks an event done; nothing
   * edits what the event says happened.
   */
  Update: { consumed_at: string; consumed_by: string };
};

// --- deal (M1 §3.1) ---------------------------------------------------------

type DealTable = GeneratedTables["deal"];

/**
 * Every peso figure and rate is `numeric`, so PostgREST hands it back as a JSON
 * float unless the query casts `::text` (see @/lib/supabase/selects DEAL_SELECT).
 * `fixed_amount` is the one nullable money column; the rest are NOT NULL. Rates
 * (referral_out_pct, yield_on_list) are money-adjacent numerics, cast the same
 * way. `rate_pct` is already `text` (it holds the exact fraction "1/12"), so it
 * needs no override here.
 */
type DealNonNullMoneyColumns =
  | "list_price"
  | "net_list_price"
  | "billed_commission"
  | "gci_net_of_vat"
  | "incentive_billed"
  | "incentive_net"
  | "referral_out_pct"
  | "referral_out_fixed"
  | "referral_out"
  | "net_gci"
  | "default_total_collectible"
  | "vat_memo"
  | "ewt_memo"
  | "yield_on_list";

type DealRowMoney = WithMoneyStrings<DealTable["Row"], DealNonNullMoneyColumns>;

type DealOverride = Omit<DealTable, "Row" | "Insert" | "Update"> & {
  // fixed_amount stays nullable; every other money column is a plain string.
  Row: Omit<DealRowMoney, "fixed_amount"> & { fixed_amount: string | null };
  Insert: Omit<
    WithOptionalMoneyStrings<DealTable["Insert"], DealNonNullMoneyColumns>,
    "fixed_amount"
  > & { fixed_amount?: string | null };
  Update: Omit<
    WithOptionalMoneyStrings<DealTable["Update"], DealNonNullMoneyColumns>,
    "fixed_amount"
  > & { fixed_amount?: string | null };
};

// --- receivable (M4 §3.1) ---------------------------------------------------

type ReceivableTable = GeneratedTables["receivable"];

/**
 * Every peso figure is `numeric`, so it arrives as a JSON float unless the query
 * casts `::text` (see @/lib/supabase/selects RECEIVABLE_SELECT). Only the Row is
 * re-typed: receivables are written exclusively by SECURITY INVOKER DB functions
 * (the consumer + the two mutations), never inserted through the client, so the
 * Insert/Update shapes are unused. The Rule K anchors and collected total are NOT
 * NULL; the override and the payment-derived figures are nullable.
 */
type ReceivableNonNullMoney =
  | "booked_net_gci"
  | "default_total_collectible"
  | "total_collectible"
  | "collected_net";

type ReceivableNullableMoney =
  | "confirmed_collectible"
  | "balance"
  | "pct_collected"
  | "variance"
  | "written_off"
  | "chase_priority";

type ReceivableOverride = Omit<ReceivableTable, "Row"> & {
  Row: Omit<
    ReceivableTable["Row"],
    ReceivableNonNullMoney | ReceivableNullableMoney
  > &
    Record<ReceivableNonNullMoney, string> &
    Record<ReceivableNullableMoney, string | null>;
};

// --- payment (M5 §3.1) ------------------------------------------------------

type PaymentTable = GeneratedTables["payment"];

/**
 * Every peso figure and rate is `numeric`, so it arrives as a JSON float unless
 * the query casts `::text` (see @/lib/supabase/selects PAYMENT_SELECT). Only the
 * Row is re-typed: payments are written exclusively by the SECURITY INVOKER DB
 * functions (create/update/delete_payment), never inserted through the client, so
 * the Insert/Update shapes are unused. The five split ₱ fields, the gross, and the
 * two `*_used` rate anchors are all NOT NULL.
 */
type PaymentMoneyColumns =
  | "gross_amount"
  | "net_of_vat"
  | "vat_amount"
  | "ewt_amount"
  | "net_cash"
  | "retained_cash"
  | "ewt_rate_used"
  | "vat_rate_used";

type PaymentOverride = Omit<PaymentTable, "Row"> & {
  Row: WithMoneyStrings<PaymentTable["Row"], PaymentMoneyColumns>;
};

// --- annual_target_override (M6 §3.1) ---------------------------------------

type AnnualTargetOverrideTable = GeneratedTables["annual_target_override"];

/**
 * `amount` is numeric(14,2), so it arrives as a JSON float unless the query casts
 * `::text` (see @/lib/supabase/selects ANNUAL_TARGET_OVERRIDE_SELECT). Only the Row
 * is re-typed: the table is written exclusively by the SECURITY INVOKER DB
 * functions (set/clear_annual_target_override), never inserted through the client,
 * so the Insert/Update shapes are unused.
 */
type AnnualTargetOverrideOverride = Omit<AnnualTargetOverrideTable, "Row"> & {
  Row: WithMoneyStrings<AnnualTargetOverrideTable["Row"], "amount">;
};

// --- yield_aggregate (M2 §3.5) ----------------------------------------------

type YieldAggregateTable = GeneratedTables["yield_aggregate"];

/**
 * The four sum columns are numeric(14,2) — JSON floats unless the read casts
 * `::text` (see @/lib/supabase/selects YIELD_AGGREGATE_SELECT). The table is
 * written exclusively by the SECURITY INVOKER consumer (consume_yield_events via
 * commission_private.recompute_yield_cell), never through the client, so only the Row is re-typed;
 * `deal_count` is a true integer and stays a number. M2.3 reads these rows for the
 * PlanningBasis API; M2.4 for the report table.
 */
type YieldAggregateMoneyColumns =
  | "volume_sum"
  | "gci_sum"
  | "incentive_net_sum"
  | "referral_out_sum";

type YieldAggregateOverride = Omit<YieldAggregateTable, "Row"> & {
  Row: WithMoneyStrings<YieldAggregateTable["Row"], YieldAggregateMoneyColumns>;
};

// --- plan_year_target (M3 §3.1) ---------------------------------------------

type PlanYearTargetTable = GeneratedTables["plan_year_target"];

/**
 * All five money/rate columns are nullable numeric — JSON floats unless the read
 * casts `::text` (see @/lib/supabase/selects PLAN_YEAR_TARGET_SELECT). NULL is a
 * real state here (use-default / use-all-time / year-not-plannable), so each maps to
 * `string | null`, never a float. Written exclusively by the SECURITY INVOKER RPCs
 * (upsert/delete_plan_year_target) and the importer, never inserted through the
 * client, so only the Row is re-typed.
 */
type PlanYearTargetMoneyColumns =
  | "net_income_target"
  | "opex_pct"
  | "cos_pct"
  | "yield_override"
  | "avg_price_override";

type PlanYearTargetOverride = Omit<PlanYearTargetTable, "Row"> & {
  Row: Omit<PlanYearTargetTable["Row"], PlanYearTargetMoneyColumns> &
    Record<PlanYearTargetMoneyColumns, string | null>;
};

// --- funnel_rates (M3 §3.2) -------------------------------------------------

type FunnelRatesTable = GeneratedTables["funnel_rates"];

/**
 * The seven conversion rates are numeric(6,4) NOT NULL — JSON floats unless the read
 * casts `::text` (see @/lib/supabase/selects FUNNEL_RATES_SELECT). Written only by the
 * SECURITY INVOKER RPCs (get_or_seed/update_funnel_rates), so only the Row is re-typed.
 */
type FunnelRatesRateColumns =
  | "listing_to_sold"
  | "listing_appointment_rate"
  | "seller_contact_to_appt"
  | "seller_lead_to_contact"
  | "buyer_viewing_to_atp"
  | "buyer_contact_to_viewing"
  | "buyer_lead_to_contact";

type FunnelRatesOverride = Omit<FunnelRatesTable, "Row"> & {
  Row: WithMoneyStrings<FunnelRatesTable["Row"], FunnelRatesRateColumns>;
};

// --- Functions --------------------------------------------------------------

type GeneratedFunctions = CommissionSchema["Functions"];

type DealIncentiveTaxable = Generated["commission"]["Enums"]["deal_incentive_taxable"];

/**
 * create_deal / update_deal — the same float trap from the argument side. The
 * generator types every `numeric` param `number`; PostgREST casts a JSON string
 * straight to numeric, so the money/rate args are strings ("0.05", "318877.55").
 * The nullable args (developer_id, fixed_amount, rate_pct, incentive_taxable)
 * are relaxed to accept null — the generator marks them required.
 */
type DealRpcMoneyArgs =
  | "p_list_price"
  | "p_net_list_price"
  | "p_billed_commission"
  | "p_gci_net_of_vat"
  | "p_incentive_billed"
  | "p_incentive_net"
  | "p_referral_out_pct"
  | "p_referral_out_fixed"
  | "p_referral_out"
  | "p_net_gci"
  | "p_default_total_collectible"
  | "p_vat_memo"
  | "p_ewt_memo"
  | "p_yield_on_list";

type DealRpcNullableArgs = {
  p_developer_id: string | null;
  p_fixed_amount: string | null;
  p_rate_pct: string | null;
  p_incentive_taxable: DealIncentiveTaxable | null;
};

type WithDealRpcArgs<Args> = Omit<
  Args,
  DealRpcMoneyArgs | keyof DealRpcNullableArgs
> &
  Record<DealRpcMoneyArgs, string> &
  DealRpcNullableArgs;

type CreateDealFn = GeneratedFunctions["create_deal"];
type CreateDealOverride = Omit<CreateDealFn, "Args"> & {
  Args: WithDealRpcArgs<CreateDealFn["Args"]>;
};

type UpdateDealFn = GeneratedFunctions["update_deal"];
type UpdateDealOverride = Omit<UpdateDealFn, "Args"> & {
  Args: WithDealRpcArgs<UpdateDealFn["Args"]>;
};

type UpdateTaxSettingsFn = GeneratedFunctions["update_tax_settings"];

/**
 * The generator types the rate arguments `number`, which is the float bug from
 * the other direction: `rpc("update_tax_settings", { p_ewt_rate: 0.05 })` would
 * serialize a double into a money column. PostgREST casts a JSON *string*
 * straight to `numeric`, so these are strings — "0.0500", not 0.05.
 *
 * Counts stay `number`: an integer round-trips through JSON exactly.
 */
type UpdateTaxSettingsMoneyArgs =
  | "p_vat_rate"
  | "p_ewt_rate"
  | "p_property_vat_threshold";

type UpdateTaxSettingsOverride = Omit<UpdateTaxSettingsFn, "Args"> & {
  Args: Omit<UpdateTaxSettingsFn["Args"], UpdateTaxSettingsMoneyArgs> &
    Partial<Record<UpdateTaxSettingsMoneyArgs, string>>;
};

/**
 * count_affected_deals (M1.5). `p_entity_id` is a nullable uuid — null for a
 * tax_settings change (the fields drive it, not an entity id), a real id for a
 * developer / property_type change. The generator types every uuid arg required
 * `string`; relax it so the tax call can pass null.
 */
type CountAffectedDealsFn = GeneratedFunctions["count_affected_deals"];
type CountAffectedDealsOverride = Omit<CountAffectedDealsFn, "Args"> & {
  Args: Omit<CountAffectedDealsFn["Args"], "p_entity_id"> & {
    p_entity_id: string | null;
  };
};

/**
 * set_confirmed_collectible (M4.1). `p_value` is the numeric override amount — the
 * float trap from the argument side again: PostgREST casts a JSON *string* straight
 * to numeric, and null clears the override, so it is `string | null`, never a
 * float. `p_note` (text) and `p_receivable_id` (uuid) are already `string`.
 */
type SetConfirmedCollectibleFn = GeneratedFunctions["set_confirmed_collectible"];
type SetConfirmedCollectibleOverride = Omit<SetConfirmedCollectibleFn, "Args"> & {
  Args: Omit<SetConfirmedCollectibleFn["Args"], "p_value"> & {
    p_value: string | null;
  };
};

/**
 * create_payment / update_payment (M5.1) — the float trap from the argument side.
 * The generator types every `numeric` param `number`; PostgREST casts a JSON
 * string straight to numeric, so the split ₱ fields, the gross and the two rate
 * anchors are strings ("50000.00", "0.1000"). `p_reference_note` is a nullable
 * text arg (blank clears it), relaxed to accept null.
 */
type PaymentRpcMoneyArgs =
  | "p_gross_amount"
  | "p_net_of_vat"
  | "p_vat_amount"
  | "p_ewt_amount"
  | "p_net_cash"
  | "p_retained_cash"
  | "p_ewt_rate_used"
  | "p_vat_rate_used";

type WithPaymentRpcArgs<Args> = Omit<
  Args,
  PaymentRpcMoneyArgs | "p_reference_note"
> &
  Record<PaymentRpcMoneyArgs, string> & { p_reference_note: string | null };

type CreatePaymentFn = GeneratedFunctions["create_payment"];
type CreatePaymentOverride = Omit<CreatePaymentFn, "Args"> & {
  Args: WithPaymentRpcArgs<CreatePaymentFn["Args"]>;
};

type UpdatePaymentFn = GeneratedFunctions["update_payment"];
type UpdatePaymentOverride = Omit<UpdatePaymentFn, "Args"> & {
  Args: WithPaymentRpcArgs<UpdatePaymentFn["Args"]>;
};

/**
 * set_annual_target_override (M6.1). `p_amount` is the numeric override amount —
 * the float trap from the argument side: PostgREST casts a JSON *string* straight
 * to numeric, so it is `string`, never a float. `p_note` (text) and `p_year`
 * (integer) round-trip exactly. clear_annual_target_override takes only p_year, so
 * it needs no override.
 */
type SetAnnualTargetOverrideFn = GeneratedFunctions["set_annual_target_override"];
type SetAnnualTargetOverrideOverride = Omit<SetAnnualTargetOverrideFn, "Args"> & {
  Args: Omit<SetAnnualTargetOverrideFn["Args"], "p_amount" | "p_note"> & {
    p_amount: string;
    // A null note clears/omits it (the RPC coalesces to null); the generator marks
    // it required-string.
    p_note: string | null;
  };
};

/**
 * upsert_plan_year_target (M3.2). The five money/rate args are numeric — PostgREST
 * casts a JSON *string* straight to numeric, so they are strings ("11500000.00",
 * "0.22"), never floats; null is a real value (clear the field → use default /
 * all-time / not-plannable). p_year (integer) round-trips exactly.
 */
type UpsertPlanYearTargetFn = GeneratedFunctions["upsert_plan_year_target"];
type UpsertPlanYearTargetMoneyArgs =
  | "p_net_income_target"
  | "p_opex_pct"
  | "p_cos_pct"
  | "p_yield_override"
  | "p_avg_price_override";
type UpsertPlanYearTargetOverride = Omit<UpsertPlanYearTargetFn, "Args"> & {
  Args: Omit<UpsertPlanYearTargetFn["Args"], UpsertPlanYearTargetMoneyArgs> &
    Record<UpsertPlanYearTargetMoneyArgs, string | null>;
};

/**
 * update_funnel_rates (M3.2). All seven rate args are numeric — strings on the wire
 * ("0.25", "0.70"), never floats. All required. delete_plan_year_target (p_year only)
 * and get_or_seed_funnel_rates (no args) need no override.
 */
type UpdateFunnelRatesFn = GeneratedFunctions["update_funnel_rates"];
type UpdateFunnelRatesRateArgs =
  | "p_listing_to_sold"
  | "p_listing_appointment_rate"
  | "p_seller_contact_to_appt"
  | "p_seller_lead_to_contact"
  | "p_buyer_viewing_to_atp"
  | "p_buyer_contact_to_viewing"
  | "p_buyer_lead_to_contact";
type UpdateFunnelRatesOverride = Omit<UpdateFunnelRatesFn, "Args"> & {
  Args: Omit<UpdateFunnelRatesFn["Args"], UpdateFunnelRatesRateArgs> &
    Record<UpdateFunnelRatesRateArgs, string>;
};

// --- the money-safe Database ------------------------------------------------

export type Database = Omit<Generated, "commission"> & {
  commission: Omit<CommissionSchema, "Tables" | "Functions"> & {
    Tables: Omit<
      GeneratedTables,
      | "tax_settings"
      | "audit_log_entry"
      | "settings_change_event"
      | "deal"
      | "receivable"
      | "payment"
      | "annual_target_override"
      | "yield_aggregate"
      | "plan_year_target"
      | "funnel_rates"
    > & {
      tax_settings: TaxSettingsOverride;
      audit_log_entry: AuditOverride;
      settings_change_event: SettingsEventOverride;
      deal: DealOverride;
      receivable: ReceivableOverride;
      payment: PaymentOverride;
      annual_target_override: AnnualTargetOverrideOverride;
      yield_aggregate: YieldAggregateOverride;
      plan_year_target: PlanYearTargetOverride;
      funnel_rates: FunnelRatesOverride;
    };
    Functions: Omit<
      GeneratedFunctions,
      | "update_tax_settings"
      | "create_deal"
      | "update_deal"
      | "count_affected_deals"
      | "set_confirmed_collectible"
      | "create_payment"
      | "update_payment"
      | "set_annual_target_override"
      | "upsert_plan_year_target"
      | "update_funnel_rates"
    > & {
      update_tax_settings: UpdateTaxSettingsOverride;
      create_deal: CreateDealOverride;
      update_deal: UpdateDealOverride;
      count_affected_deals: CountAffectedDealsOverride;
      set_confirmed_collectible: SetConfirmedCollectibleOverride;
      create_payment: CreatePaymentOverride;
      update_payment: UpdatePaymentOverride;
      set_annual_target_override: SetAnnualTargetOverrideOverride;
      upsert_plan_year_target: UpsertPlanYearTargetOverride;
      update_funnel_rates: UpdateFunnelRatesOverride;
    };
  };
};

// --- helpers, bound to the overridden Database ------------------------------

export type Tables<T extends keyof Database["commission"]["Tables"]> =
  Database["commission"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["commission"]["Tables"]> =
  Database["commission"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["commission"]["Tables"]> =
  Database["commission"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["commission"]["Enums"]> =
  Database["commission"]["Enums"][T];

/** A single field's old→new pair. Decimals are strings, to stay exact. */
export type FieldChange = {
  old: Json;
  new: Json;
};

export type FieldChanges = Record<string, FieldChange>;
