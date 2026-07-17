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

// Re-exported, not redeclared: the audit Row type is built from these, so a
// second structurally-different definition here would quietly diverge.
export type { FieldChange, FieldChanges } from "./database";
