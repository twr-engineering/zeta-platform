// Named row aliases — the everyday way to refer to a table's row type.
//
// Three files, one chain:
//   database.generated.ts  machine-generated, replaced wholesale on regeneration
//   database.ts            the money-safe override layer (numeric -> string)
//   entities.ts            these aliases, which survive regeneration
//
// Regenerate with:
//   npx supabase gen types typescript --linked > src/types/database.generated.ts
import type { Tables, Enums } from "./database";

export type Workspace = Tables<"workspace">;
export type Profile = Tables<"profiles">;
export type Membership = Tables<"membership">;
export type TaxSettings = Tables<"tax_settings">;
export type AuditLogEntry = Tables<"audit_log_entry">;
export type SettingsChangeEvent = Tables<"settings_change_event">;

// The configuration lists (M0 §3.4–3.6). No override layer: these tables carry
// no `numeric` column, so the generated types are already correct — see
// @/lib/supabase/selects.
export type PropertyType = Tables<"property_type">;
export type Developer = Tables<"developer">;
export type LeadSource = Tables<"lead_source">;

// M1 §3.1. The money-safe Row (numeric columns re-typed string) comes from the
// override layer in ./database — see @/lib/supabase/selects DEAL_SELECT.
export type Deal = Tables<"deal">;
export type DealEvent = Tables<"deal_event">;

// M1.5 (FR-M1-07). A bulk recompute in flight — progress + resume cursor.
export type RecomputeJob = Tables<"recompute_job">;

// M4 §3.1. One receivable per deal. The money-safe Row (numeric columns re-typed
// string) comes from the override layer in ./database — see RECEIVABLE_SELECT.
export type Receivable = Tables<"receivable">;
export type ReceivableStatus = Enums<"receivable_status">;

// M5 §3.1. One row per commission/incentive release; the split is a stored
// snapshot. The money-safe Row (numeric columns re-typed string) comes from the
// override layer in ./database — see PAYMENT_SELECT.
export type Payment = Tables<"payment">;
export type PaymentEvent = Tables<"payment_event">;
export type PaymentTypeEnum = Enums<"payment_type">;
export type PaymentEventType = Enums<"payment_event_type">;

// M6 §3.1. One optional manual annual GCI target per (workspace, year) — the
// sheet's cell E15. The money-safe Row (amount re-typed string) comes from the
// override layer in ./database — see ANNUAL_TARGET_OVERRIDE_SELECT.
export type AnnualTargetOverride = Tables<"annual_target_override">;

// M2 §3.5. One materialized yield row per (workspace, segment, booked_year). The
// money-safe Row (the four sum columns re-typed string) comes from the override
// layer in ./database — see YIELD_AGGREGATE_SELECT.
export type YieldAggregate = Tables<"yield_aggregate">;

// M3 §3.1. One planning-target row per (workspace, year): NIT + opex/cos + optional
// yield/avg-price overrides. The money-safe Row (the five numeric columns re-typed
// `string | null`) comes from the override layer in ./database — see
// PLAN_YEAR_TARGET_SELECT. NULL fields carry the use-default / all-time / not-
// plannable state (§3.1). The engine consumes this as PlanYearTargetInput.
export type PlanYearTarget = Tables<"plan_year_target">;

// M3 §3.2. The seven global conversion rates (one row per workspace; year NULL =
// global). Named FunnelRatesRow so it does not collide with the engine's FunnelRates
// input type (@/lib/planning). The money-safe Row (rates re-typed `string`) comes
// from the override layer in ./database — see FUNNEL_RATES_SELECT.
export type FunnelRatesRow = Tables<"funnel_rates">;

export type MembershipRole = Enums<"membership_role">;
export type AuditAction = Enums<"audit_action">;
export type PropertyVatRule = Enums<"property_vat_rule">;
export type DeveloperCommBase = Enums<"developer_comm_base">;

// M1 §3.1 deal enums (DB tokens; ./deals/map bridges them to the engine's).
export type DealTransactionType = Enums<"deal_transaction_type">;
export type DealTypeEnum = Enums<"deal_type">;
export type DealRepresentation = Enums<"deal_representation">;
export type DealModeOfPayment = Enums<"deal_mode_of_payment">;
export type DealCommissionBasis = Enums<"deal_commission_basis">;
export type DealIncentiveTaxable = Enums<"deal_incentive_taxable">;
export type DealPropertyVat = Enums<"deal_property_vat">;
export type DealCommBaseDisplay = Enums<"deal_comm_base_display">;
export type DealVatBasis = Enums<"deal_vat_basis">;
export type DealEventType = Enums<"deal_event_type">;

// M10.1 §3.3–3.4. Product-level help content (no workspace_id, no money columns,
// so no override layer). The runtime shapes the app renders come from
// @/lib/help/types (ContentBundle); these are the raw table rows.
export type ContentBundleRow = Tables<"content_bundle">;
export type HelpArticleRow = Tables<"help_article">;
export type GlossaryEntryRow = Tables<"glossary_entry">;
export type ContentBundleStatus = Enums<"content_bundle_status">;

// Re-exported, not redeclared: the audit Row type is built from these, so a
// second structurally-different definition here would quietly diverge.
export type { FieldChange, FieldChanges } from "./database";
