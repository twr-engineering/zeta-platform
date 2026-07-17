export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log_entry: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          entity_id: string
          entity_type: string
          field_changes: Json
          id: string
          occurred_at: string
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          entity_id: string
          entity_type: string
          field_changes?: Json
          id?: string
          occurred_at?: string
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string
          entity_id?: string
          entity_type?: string
          field_changes?: Json
          id?: string
          occurred_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_entry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      deal: {
        Row: {
          archived_at: string | null
          billed_commission: number
          booked_date: string
          booked_year: number
          client_name: string
          comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          created_at: string
          created_by: string | null
          deal_code: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          developer_id: string | null
          display_label: string
          ewt_memo: number
          fixed_amount: number | null
          force_vat: boolean
          gci_net_of_vat: number
          id: string
          incentive_billed: number
          incentive_net: number
          incentive_taxable:
            | Database["public"]["Enums"]["deal_incentive_taxable"]
            | null
          lead_source_id: string
          list_price: number
          mode_of_payment: Database["public"]["Enums"]["deal_mode_of_payment"]
          net_gci: number
          net_list_price: number
          property_details: string
          property_type_id: string
          property_vat: Database["public"]["Enums"]["deal_property_vat"]
          rate_pct: string | null
          receipt_issued: boolean
          referral_out: number
          referral_out_fixed: number
          referral_out_pct: number
          referral_paid: boolean
          representation: Database["public"]["Enums"]["deal_representation"]
          taxable: boolean
          transaction_type: Database["public"]["Enums"]["deal_transaction_type"]
          updated_at: string
          updated_by: string | null
          vat_basis: Database["public"]["Enums"]["deal_vat_basis"]
          vat_memo: number
          version: number
          workspace_id: string
          yield_on_list: number
        }
        Insert: {
          archived_at?: string | null
          billed_commission: number
          booked_date: string
          booked_year: number
          client_name: string
          comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          created_at?: string
          created_by?: string | null
          deal_code: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          developer_id?: string | null
          display_label: string
          ewt_memo: number
          fixed_amount?: number | null
          force_vat?: boolean
          gci_net_of_vat: number
          id?: string
          incentive_billed?: number
          incentive_net: number
          incentive_taxable?:
            | Database["public"]["Enums"]["deal_incentive_taxable"]
            | null
          lead_source_id: string
          list_price: number
          mode_of_payment: Database["public"]["Enums"]["deal_mode_of_payment"]
          net_gci: number
          net_list_price: number
          property_details: string
          property_type_id: string
          property_vat: Database["public"]["Enums"]["deal_property_vat"]
          rate_pct?: string | null
          receipt_issued?: boolean
          referral_out: number
          referral_out_fixed?: number
          referral_out_pct?: number
          referral_paid?: boolean
          representation: Database["public"]["Enums"]["deal_representation"]
          taxable: boolean
          transaction_type: Database["public"]["Enums"]["deal_transaction_type"]
          updated_at?: string
          updated_by?: string | null
          vat_basis: Database["public"]["Enums"]["deal_vat_basis"]
          vat_memo: number
          version?: number
          workspace_id: string
          yield_on_list: number
        }
        Update: {
          archived_at?: string | null
          billed_commission?: number
          booked_date?: string
          booked_year?: number
          client_name?: string
          comm_base?: Database["public"]["Enums"]["deal_comm_base_display"]
          commission_basis?: Database["public"]["Enums"]["deal_commission_basis"]
          created_at?: string
          created_by?: string | null
          deal_code?: string
          deal_type?: Database["public"]["Enums"]["deal_type"]
          developer_id?: string | null
          display_label?: string
          ewt_memo?: number
          fixed_amount?: number | null
          force_vat?: boolean
          gci_net_of_vat?: number
          id?: string
          incentive_billed?: number
          incentive_net?: number
          incentive_taxable?:
            | Database["public"]["Enums"]["deal_incentive_taxable"]
            | null
          lead_source_id?: string
          list_price?: number
          mode_of_payment?: Database["public"]["Enums"]["deal_mode_of_payment"]
          net_gci?: number
          net_list_price?: number
          property_details?: string
          property_type_id?: string
          property_vat?: Database["public"]["Enums"]["deal_property_vat"]
          rate_pct?: string | null
          receipt_issued?: boolean
          referral_out?: number
          referral_out_fixed?: number
          referral_out_pct?: number
          referral_paid?: boolean
          representation?: Database["public"]["Enums"]["deal_representation"]
          taxable?: boolean
          transaction_type?: Database["public"]["Enums"]["deal_transaction_type"]
          updated_at?: string
          updated_by?: string | null
          vat_basis?: Database["public"]["Enums"]["deal_vat_basis"]
          vat_memo?: number
          version?: number
          workspace_id?: string
          yield_on_list?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_event: {
        Row: {
          actor_user_id: string
          audit_entry_id: string
          deal_code: string
          deal_id: string
          event_type: Database["public"]["Enums"]["deal_event_type"]
          field_changes: Json
          id: string
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          audit_entry_id: string
          deal_code: string
          deal_id: string
          event_type: Database["public"]["Enums"]["deal_event_type"]
          field_changes?: Json
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          audit_entry_id?: string
          deal_code?: string
          deal_id?: string
          event_type?: Database["public"]["Enums"]["deal_event_type"]
          field_changes?: Json
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_event_audit_entry_id_fkey"
            columns: ["audit_entry_id"]
            isOneToOne: false
            referencedRelation: "audit_log_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      developer: {
        Row: {
          archived_at: string | null
          comm_base: Database["public"]["Enums"]["developer_comm_base"]
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
          reference_count: number | null
        }
        Insert: {
          archived_at?: string | null
          comm_base?: Database["public"]["Enums"]["developer_comm_base"]
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          comm_base?: Database["public"]["Enums"]["developer_comm_base"]
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
          reference_count: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_source_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      membership: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_type: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
          vat_rule: Database["public"]["Enums"]["property_vat_rule"]
          workspace_id: string
          reference_count: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
          vat_rule: Database["public"]["Enums"]["property_vat_rule"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
          vat_rule?: Database["public"]["Enums"]["property_vat_rule"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_type_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_change_event: {
        Row: {
          actor_user_id: string
          affected_deal_count: number
          audit_entry_id: string
          consumed_at: string | null
          consumed_by: string | null
          entity_id: string
          entity_type: string
          field_changes: Json
          id: string
          occurred_at: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          affected_deal_count?: number
          audit_entry_id: string
          consumed_at?: string | null
          consumed_by?: string | null
          entity_id: string
          entity_type: string
          field_changes?: Json
          id?: string
          occurred_at?: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          affected_deal_count?: number
          audit_entry_id?: string
          consumed_at?: string | null
          consumed_by?: string | null
          entity_id?: string
          entity_type?: string
          field_changes?: Json
          id?: string
          occurred_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_change_event_audit_entry_id_fkey"
            columns: ["audit_entry_id"]
            isOneToOne: false
            referencedRelation: "audit_log_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_change_event_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_settings: {
        Row: {
          chase_idle_months: number
          created_at: string
          ewt_rate: number
          id: string
          property_vat_threshold: number
          updated_at: string
          vat_rate: number
          vat_registered: boolean
          vat_registered_confirmed_at: string | null
          workspace_id: string
        }
        Insert: {
          chase_idle_months?: number
          created_at?: string
          ewt_rate?: number
          id?: string
          property_vat_threshold?: number
          updated_at?: string
          vat_rate?: number
          vat_registered?: boolean
          vat_registered_confirmed_at?: string | null
          workspace_id: string
        }
        Update: {
          chase_idle_months?: number
          created_at?: string
          ewt_rate?: number
          id?: string
          property_vat_threshold?: number
          updated_at?: string
          vat_rate?: number
          vat_registered?: boolean
          vat_registered_confirmed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          currency: string
          deal_id_sequence: number
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deal_id_sequence?: number
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          deal_id_sequence?: number
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_deal: {
        Args: {
          p_billed_commission: number
          p_booked_date: string
          p_client_name: string
          p_comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          p_commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          p_deal_type: Database["public"]["Enums"]["deal_type"]
          p_developer_id: string
          p_ewt_memo: number
          p_fixed_amount: number
          p_force_vat: boolean
          p_gci_net_of_vat: number
          p_incentive_billed: number
          p_incentive_net: number
          p_incentive_taxable: Database["public"]["Enums"]["deal_incentive_taxable"]
          p_lead_source_id: string
          p_list_price: number
          p_mode_of_payment: Database["public"]["Enums"]["deal_mode_of_payment"]
          p_net_gci: number
          p_net_list_price: number
          p_property_details: string
          p_property_type_id: string
          p_property_vat: Database["public"]["Enums"]["deal_property_vat"]
          p_rate_pct: string
          p_receipt_issued: boolean
          p_referral_out: number
          p_referral_out_fixed: number
          p_referral_out_pct: number
          p_referral_paid: boolean
          p_representation: Database["public"]["Enums"]["deal_representation"]
          p_taxable: boolean
          p_transaction_type: Database["public"]["Enums"]["deal_transaction_type"]
          p_vat_basis: Database["public"]["Enums"]["deal_vat_basis"]
          p_vat_memo: number
          p_yield_on_list: number
        }
        Returns: Json
      }
      create_developer: {
        Args: {
          p_comm_base?: Database["public"]["Enums"]["developer_comm_base"]
          p_name: string
        }
        Returns: Json
      }
      create_lead_source: { Args: { p_name: string }; Returns: Json }
      create_property_type: {
        Args: {
          p_name: string
          p_vat_rule: Database["public"]["Enums"]["property_vat_rule"]
        }
        Returns: Json
      }
      delete_deal: { Args: { p_id: string }; Returns: Json }
      delete_developer: { Args: { p_id: string }; Returns: Json }
      delete_lead_source: { Args: { p_id: string }; Returns: Json }
      delete_property_type: { Args: { p_id: string }; Returns: Json }
      log_email_change: {
        Args: { p_new: string; p_old: string }
        Returns: string
      }
      log_password_change: { Args: never; Returns: string }
      reference_count:
        | {
            Args: { "": Database["public"]["Tables"]["developer"]["Row"] }
            Returns: {
              error: true
            } & "the function public.reference_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["lead_source"]["Row"] }
            Returns: {
              error: true
            } & "the function public.reference_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["property_type"]["Row"] }
            Returns: {
              error: true
            } & "the function public.reference_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
      rename_profile: { Args: { p_display_name: string }; Returns: Json }
      rename_workspace: { Args: { p_name: string }; Returns: Json }
      reorder_lead_source: {
        Args: { p_id: string; p_position: number }
        Returns: Json
      }
      seed_developers: { Args: { p_items: Json }; Returns: Json }
      seed_lead_sources: { Args: { p_items: Json }; Returns: Json }
      seed_property_types: { Args: { p_items: Json }; Returns: Json }
      set_deal_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: Json
      }
      set_developer_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: Json
      }
      set_lead_source_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: Json
      }
      set_property_type_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: Json
      }
      update_deal: {
        Args: {
          p_billed_commission: number
          p_booked_date: string
          p_client_name: string
          p_comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          p_commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          p_deal_type: Database["public"]["Enums"]["deal_type"]
          p_developer_id: string
          p_ewt_memo: number
          p_expected_version: number
          p_fixed_amount: number
          p_force_vat: boolean
          p_gci_net_of_vat: number
          p_id: string
          p_incentive_billed: number
          p_incentive_net: number
          p_incentive_taxable: Database["public"]["Enums"]["deal_incentive_taxable"]
          p_lead_source_id: string
          p_list_price: number
          p_mode_of_payment: Database["public"]["Enums"]["deal_mode_of_payment"]
          p_net_gci: number
          p_net_list_price: number
          p_property_details: string
          p_property_type_id: string
          p_property_vat: Database["public"]["Enums"]["deal_property_vat"]
          p_rate_pct: string
          p_receipt_issued: boolean
          p_referral_out: number
          p_referral_out_fixed: number
          p_referral_out_pct: number
          p_referral_paid: boolean
          p_representation: Database["public"]["Enums"]["deal_representation"]
          p_taxable: boolean
          p_transaction_type: Database["public"]["Enums"]["deal_transaction_type"]
          p_vat_basis: Database["public"]["Enums"]["deal_vat_basis"]
          p_vat_memo: number
          p_yield_on_list: number
        }
        Returns: Json
      }
      update_developer: {
        Args: {
          p_affected_deal_count?: number
          p_comm_base?: Database["public"]["Enums"]["developer_comm_base"]
          p_id: string
          p_name?: string
        }
        Returns: Json
      }
      update_lead_source: {
        Args: { p_id: string; p_name: string }
        Returns: Json
      }
      update_property_type: {
        Args: {
          p_affected_deal_count?: number
          p_id: string
          p_name?: string
          p_vat_rule?: Database["public"]["Enums"]["property_vat_rule"]
        }
        Returns: Json
      }
      update_tax_settings: {
        Args: {
          p_affected_deal_count?: number
          p_chase_idle_months?: number
          p_confirm_vat_registration?: boolean
          p_ewt_rate?: number
          p_property_vat_threshold?: number
          p_vat_rate?: number
          p_vat_registered?: boolean
        }
        Returns: Json
      }
    }
    Enums: {
      audit_action:
        | "create"
        | "update"
        | "archive"
        | "restore"
        | "delete_blocked"
        | "delete"
      deal_comm_base_display: "gross" | "net" | "n_a"
      deal_commission_basis: "percent" | "fixed"
      deal_event_type: "created" | "updated" | "archived" | "restored"
      deal_incentive_taxable: "yes" | "no"
      deal_mode_of_payment: "cash" | "bank" | "pagibig" | "deferred_cash"
      deal_property_vat: "vat_able" | "exempt" | "n_a"
      deal_representation:
        | "double_ended"
        | "seller"
        | "buyer"
        | "lessor"
        | "lessee"
        | "referrer"
      deal_transaction_type: "sale" | "rental"
      deal_type: "developer" | "resale" | "n_a"
      deal_vat_basis: "inclusive" | "n_a"
      developer_comm_base: "gross" | "net"
      membership_role: "owner" | "admin" | "agent" | "readonly"
      property_vat_rule: "threshold" | "always_vat" | "always_exempt"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "create",
        "update",
        "archive",
        "restore",
        "delete_blocked",
        "delete",
      ],
      deal_comm_base_display: ["gross", "net", "n_a"],
      deal_commission_basis: ["percent", "fixed"],
      deal_event_type: ["created", "updated", "archived", "restored"],
      deal_incentive_taxable: ["yes", "no"],
      deal_mode_of_payment: ["cash", "bank", "pagibig", "deferred_cash"],
      deal_property_vat: ["vat_able", "exempt", "n_a"],
      deal_representation: [
        "double_ended",
        "seller",
        "buyer",
        "lessor",
        "lessee",
        "referrer",
      ],
      deal_transaction_type: ["sale", "rental"],
      deal_type: ["developer", "resale", "n_a"],
      deal_vat_basis: ["inclusive", "n_a"],
      developer_comm_base: ["gross", "net"],
      membership_role: ["owner", "admin", "agent", "readonly"],
      property_vat_rule: ["threshold", "always_vat", "always_exempt"],
    },
  },
} as const
