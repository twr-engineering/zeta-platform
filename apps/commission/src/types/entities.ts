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

export type MembershipRole = Enums<"membership_role">;
export type AuditAction = Enums<"audit_action">;

// Re-exported, not redeclared: the audit Row type is built from these, so a
// second structurally-different definition here would quietly diverge.
export type { FieldChange, FieldChanges } from "./database";
