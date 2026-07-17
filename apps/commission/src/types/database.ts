/**
 * Database types for the M0 foundation schema.
 *
 * HAND-WRITTEN, and therefore provisional: it mirrors
 * `supabase/migrations/*.sql` by inspection because no hosted project exists
 * yet. Once credentials land, regenerate and replace this file wholesale:
 *
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * Money and rate columns are `numeric` in Postgres and arrive over PostgREST as
 * STRINGS. They are typed as `string` here on purpose — widening them to
 * `number` would put a binary float in a money path, which the PRD forbids
 * (Master PRD §4.3). Parse them with `toMoney()` from `@/lib/money`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MembershipRole = "owner" | "admin" | "agent" | "readonly";

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "delete_blocked";

/** A single field's old→new pair. Decimals are strings — see the note above. */
export type FieldChange = {
  old: Json;
  new: Json;
};

export type FieldChanges = Record<string, FieldChange>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace: {
        Row: {
          id: string;
          name: string;
          currency: "PHP";
          timezone: string;
          deal_id_sequence: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          currency?: "PHP";
          timezone?: string;
          deal_id_sequence?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          timezone?: string;
          deal_id_sequence?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      membership: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: MembershipRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: MembershipRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: MembershipRole;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_workspace_id_fkey";
            columns: ["workspace_id"];
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_settings: {
        Row: {
          id: string;
          workspace_id: string;
          /** numeric(6,4) — e.g. "0.1200" */
          vat_rate: string;
          vat_registered: boolean;
          /** NULL until M10's wizard asks. Never read the default as an answer. */
          vat_registered_confirmed_at: string | null;
          /** numeric(6,4) — e.g. "0.1000" */
          ewt_rate: string;
          /** numeric(14,2) — e.g. "3600000.00" */
          property_vat_threshold: string;
          chase_idle_months: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          vat_rate?: string;
          vat_registered?: boolean;
          vat_registered_confirmed_at?: string | null;
          ewt_rate?: string;
          property_vat_threshold?: string;
          chase_idle_months?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vat_rate?: string;
          vat_registered?: boolean;
          vat_registered_confirmed_at?: string | null;
          ewt_rate?: string;
          property_vat_threshold?: string;
          chase_idle_months?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log_entry: {
        Row: {
          id: string;
          workspace_id: string;
          /** Bare uuid, not an FK — the trail outlives the account. */
          actor_user_id: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          field_changes: FieldChanges;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          actor_user_id: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          field_changes?: FieldChanges;
          occurred_at?: string;
        };
        /** Append-only: a DB trigger rejects every UPDATE (M0 §8). */
        Update: never;
        Relationships: [
          {
            foreignKeyName: "audit_log_entry_workspace_id_fkey";
            columns: ["workspace_id"];
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      membership_role: MembershipRole;
      audit_action: AuditAction;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Workspace = Tables<"workspace">;
export type Profile = Tables<"profiles">;
export type Membership = Tables<"membership">;
export type TaxSettings = Tables<"tax_settings">;
export type AuditLogEntry = Tables<"audit_log_entry">;
