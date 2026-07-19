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
      annual_target_override: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_target_override_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_entry: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          entity_id: string
          entity_type: string
          field_changes: Json
          id: string
          occurred_at: string
          settings_change_event_id: string | null
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
          settings_change_event_id?: string | null
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
          settings_change_event_id?: string | null
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
      content_bundle: {
        Row: {
          changelog: string | null
          created_at: string
          id: string
          published_at: string | null
          status: Database["public"]["Enums"]["content_bundle_status"]
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_bundle_status"]
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_bundle_status"]
          version?: string
        }
        Relationships: []
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
          default_total_collectible: number
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
          search_blob: string | null
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
          default_total_collectible: number
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
          search_blob?: string | null
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
          default_total_collectible?: number
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
          search_blob?: string | null
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
          settings_change_event_id: string | null
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
          settings_change_event_id?: string | null
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
          settings_change_event_id?: string | null
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
      funnel_rates: {
        Row: {
          buyer_contact_to_viewing: number
          buyer_lead_to_contact: number
          buyer_viewing_to_atp: number
          created_at: string
          created_by: string | null
          id: string
          listing_appointment_rate: number
          listing_to_sold: number
          seller_contact_to_appt: number
          seller_lead_to_contact: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
          year: number | null
        }
        Insert: {
          buyer_contact_to_viewing: number
          buyer_lead_to_contact: number
          buyer_viewing_to_atp: number
          created_at?: string
          created_by?: string | null
          id?: string
          listing_appointment_rate: number
          listing_to_sold: number
          seller_contact_to_appt: number
          seller_lead_to_contact: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
          year?: number | null
        }
        Update: {
          buyer_contact_to_viewing?: number
          buyer_lead_to_contact?: number
          buyer_viewing_to_atp?: number
          created_at?: string
          created_by?: string | null
          id?: string
          listing_appointment_rate?: number
          listing_to_sold?: number
          seller_contact_to_appt?: number
          seller_lead_to_contact?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary_entry: {
        Row: {
          bundle_id: string
          created_at: string
          definition_md: string
          id: string
          key: string
          related_keys: string[]
          term: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          definition_md: string
          id?: string
          key: string
          related_keys?: string[]
          term: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          definition_md?: string
          id?: string
          key?: string
          related_keys?: string[]
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_entry_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "content_bundle"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article: {
        Row: {
          body_md: string
          bundle_id: string
          created_at: string
          id: string
          key: string
          placements: string[]
          title: string
        }
        Insert: {
          body_md: string
          bundle_id: string
          created_at?: string
          id?: string
          key: string
          placements?: string[]
          title: string
        }
        Update: {
          body_md?: string
          bundle_id?: string
          created_at?: string
          id?: string
          key?: string
          placements?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "content_bundle"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch: {
        Row: {
          created_at: string
          created_by: string | null
          file_hash: string
          file_name: string | null
          id: string
          summary: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_hash: string
          file_name?: string | null
          id?: string
          summary?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_hash?: string
          file_name?: string | null
          id?: string
          summary?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_workspace_id_fkey"
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
      onboarding_event: {
        Row: {
          actor_user_id: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          step: Database["public"]["Enums"]["onboarding_step"] | null
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          step?: Database["public"]["Enums"]["onboarding_step"] | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          step?: Database["public"]["Enums"]["onboarding_step"] | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_event_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step: Database["public"]["Enums"]["onboarding_step"]
          dismissed_at: string | null
          id: string
          import_job_id: string | null
          sample_deal_id: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          step_data: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: Database["public"]["Enums"]["onboarding_step"]
          dismissed_at?: string | null
          id?: string
          import_job_id?: string | null
          sample_deal_id?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          step_data?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: Database["public"]["Enums"]["onboarding_step"]
          dismissed_at?: string | null
          id?: string
          import_job_id?: string | null
          sample_deal_id?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          step_data?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_state_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_state_sample_deal_id_fkey"
            columns: ["sample_deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          ewt_amount: number
          ewt_rate_used: number
          gross_amount: number
          id: string
          month_paid: number | null
          net_cash: number
          net_of_vat: number
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          reference_note: string | null
          retained_cash: number
          updated_at: string
          updated_by: string | null
          vat_amount: number
          vat_basis_used: Database["public"]["Enums"]["deal_vat_basis"]
          vat_rate_used: number
          version: number
          workspace_id: string
          year_paid: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          ewt_amount: number
          ewt_rate_used: number
          gross_amount: number
          id?: string
          month_paid?: number | null
          net_cash: number
          net_of_vat: number
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          reference_note?: string | null
          retained_cash: number
          updated_at?: string
          updated_by?: string | null
          vat_amount: number
          vat_basis_used: Database["public"]["Enums"]["deal_vat_basis"]
          vat_rate_used: number
          version?: number
          workspace_id: string
          year_paid?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          ewt_amount?: number
          ewt_rate_used?: number
          gross_amount?: number
          id?: string
          month_paid?: number | null
          net_cash?: number
          net_of_vat?: number
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          reference_note?: string | null
          retained_cash?: number
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
          vat_basis_used?: Database["public"]["Enums"]["deal_vat_basis"]
          vat_rate_used?: number
          version?: number
          workspace_id?: string
          year_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_event: {
        Row: {
          actor_user_id: string
          audit_entry_id: string
          deal_id: string
          event_type: Database["public"]["Enums"]["payment_event_type"]
          field_changes: Json
          id: string
          new_values: Json
          occurred_at: string
          old_values: Json | null
          payment_id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          audit_entry_id: string
          deal_id: string
          event_type: Database["public"]["Enums"]["payment_event_type"]
          field_changes?: Json
          id?: string
          new_values: Json
          occurred_at?: string
          old_values?: Json | null
          payment_id: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          audit_entry_id?: string
          deal_id?: string
          event_type?: Database["public"]["Enums"]["payment_event_type"]
          field_changes?: Json
          id?: string
          new_values?: Json
          occurred_at?: string
          old_values?: Json | null
          payment_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_event_audit_entry_id_fkey"
            columns: ["audit_entry_id"]
            isOneToOne: false
            referencedRelation: "audit_log_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_event_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_event_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_year_target: {
        Row: {
          avg_price_override: number | null
          cos_pct: number | null
          created_at: string
          created_by: string | null
          id: string
          net_income_target: number | null
          opex_pct: number | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
          year: number
          yield_override: number | null
        }
        Insert: {
          avg_price_override?: number | null
          cos_pct?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          net_income_target?: number | null
          opex_pct?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
          year: number
          yield_override?: number | null
        }
        Update: {
          avg_price_override?: number | null
          cos_pct?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          net_income_target?: number | null
          opex_pct?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
          year?: number
          yield_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_year_target_workspace_id_fkey"
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
      receivable: {
        Row: {
          age_months: number | null
          archived_at: string | null
          balance: number | null
          booked_net_gci: number
          booked_year: number
          booking_date: string
          chase_priority: number | null
          client_name: string
          collected_net: number
          confirmed_collectible: number | null
          created_at: string
          created_by: string | null
          days_to_first_release: number | null
          deal_code: string
          deal_id: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          default_total_collectible: number
          developer_id: string | null
          first_payment_date: string | null
          id: string
          last_payment_date: string | null
          lead_source_id: string
          months_idle: number | null
          next_action_note: string | null
          override_review_flagged_at: string | null
          pct_collected: number | null
          property_details: string
          search_blob: string | null
          status: Database["public"]["Enums"]["receivable_status"]
          total_collectible: number | null
          updated_at: string
          updated_by: string | null
          variance: number | null
          version: number
          workspace_id: string
          written_off: number | null
        }
        Insert: {
          age_months?: number | null
          archived_at?: string | null
          balance?: number | null
          booked_net_gci: number
          booked_year: number
          booking_date: string
          chase_priority?: number | null
          client_name: string
          collected_net?: number
          confirmed_collectible?: number | null
          created_at?: string
          created_by?: string | null
          days_to_first_release?: number | null
          deal_code: string
          deal_id: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          default_total_collectible: number
          developer_id?: string | null
          first_payment_date?: string | null
          id?: string
          last_payment_date?: string | null
          lead_source_id: string
          months_idle?: number | null
          next_action_note?: string | null
          override_review_flagged_at?: string | null
          pct_collected?: number | null
          property_details: string
          search_blob?: string | null
          status?: Database["public"]["Enums"]["receivable_status"]
          total_collectible?: number | null
          updated_at?: string
          updated_by?: string | null
          variance?: number | null
          version?: number
          workspace_id: string
          written_off?: number | null
        }
        Update: {
          age_months?: number | null
          archived_at?: string | null
          balance?: number | null
          booked_net_gci?: number
          booked_year?: number
          booking_date?: string
          chase_priority?: number | null
          client_name?: string
          collected_net?: number
          confirmed_collectible?: number | null
          created_at?: string
          created_by?: string | null
          days_to_first_release?: number | null
          deal_code?: string
          deal_id?: string
          deal_type?: Database["public"]["Enums"]["deal_type"]
          default_total_collectible?: number
          developer_id?: string | null
          first_payment_date?: string | null
          id?: string
          last_payment_date?: string | null
          lead_source_id?: string
          months_idle?: number | null
          next_action_note?: string | null
          override_review_flagged_at?: string | null
          pct_collected?: number | null
          property_details?: string
          search_blob?: string | null
          status?: Database["public"]["Enums"]["receivable_status"]
          total_collectible?: number | null
          updated_at?: string
          updated_by?: string | null
          variance?: number | null
          version?: number
          workspace_id?: string
          written_off?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receivable_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_event_cursor: {
        Row: {
          last_event_id: string | null
          last_occurred_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_event_cursor_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_payment_cursor: {
        Row: {
          last_event_id: string | null
          last_occurred_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payment_cursor_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      recompute_job: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          error: string | null
          fields: string[]
          id: string
          last_deal_id: string | null
          processed_deals: number
          restated_deals: number
          settings_change_event_id: string
          started_by: string | null
          status: string
          total_deals: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error?: string | null
          fields?: string[]
          id?: string
          last_deal_id?: string | null
          processed_deals?: number
          restated_deals?: number
          settings_change_event_id: string
          started_by?: string | null
          status?: string
          total_deals?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          fields?: string[]
          id?: string
          last_deal_id?: string | null
          processed_deals?: number
          restated_deals?: number
          settings_change_event_id?: string
          started_by?: string | null
          status?: string
          total_deals?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recompute_job_settings_change_event_id_fkey"
            columns: ["settings_change_event_id"]
            isOneToOne: true
            referencedRelation: "settings_change_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recompute_job_workspace_id_fkey"
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
      yield_aggregate: {
        Row: {
          booked_year: number
          deal_count: number
          gci_sum: number
          incentive_net_sum: number
          referral_out_sum: number
          segment: string
          updated_at: string
          volume_sum: number
          workspace_id: string
        }
        Insert: {
          booked_year: number
          deal_count?: number
          gci_sum?: number
          incentive_net_sum?: number
          referral_out_sum?: number
          segment: string
          updated_at?: string
          volume_sum?: number
          workspace_id: string
        }
        Update: {
          booked_year?: number
          deal_count?: number
          gci_sum?: number
          incentive_net_sum?: number
          referral_out_sum?: number
          segment?: string
          updated_at?: string
          volume_sum?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yield_aggregate_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      yield_basis_version: {
        Row: {
          basis_version: number
          computed_at: string
          workspace_id: string
        }
        Insert: {
          basis_version?: number
          computed_at?: string
          workspace_id: string
        }
        Update: {
          basis_version?: number
          computed_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yield_basis_version_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      yield_event_cursor: {
        Row: {
          last_event_id: string | null
          last_occurred_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          last_event_id?: string | null
          last_occurred_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yield_event_cursor_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_onboarding: {
        Args: {
          p_from_step: Database["public"]["Enums"]["onboarding_step"]
          p_skipped?: boolean
          p_step_data?: Json
          p_to_step: Database["public"]["Enums"]["onboarding_step"]
        }
        Returns: Json
      }
      apply_recompute_batch: {
        Args: { p_job_id: string; p_results: Json }
        Returns: Json
      }
      cancel_receivable: {
        Args: {
          p_expected_version: number
          p_reason: string
          p_receivable_id: string
        }
        Returns: Json
      }
      clear_annual_target_override: { Args: { p_year: number }; Returns: Json }
      clear_override_review_flag: {
        Args: { p_receivable_id: string }
        Returns: Json
      }
      close_receivable: {
        Args: { p_expected_version: number; p_receivable_id: string }
        Returns: Json
      }
      complete_onboarding: { Args: { p_step_data?: Json }; Returns: Json }
      complete_recompute_job: { Args: { p_job_id: string }; Returns: Json }
      consume_deal_events: { Args: { p_limit?: number }; Returns: Json }
      consume_payment_events: { Args: { p_limit?: number }; Returns: Json }
      consume_yield_events: { Args: { p_limit?: number }; Returns: Json }
      count_affected_deals: {
        Args: { p_entity_id: string; p_entity_type: string; p_fields: string[] }
        Returns: number
      }
      create_deal: {
        Args: {
          p_billed_commission: number
          p_booked_date: string
          p_client_name: string
          p_comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          p_commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          p_deal_type: Database["public"]["Enums"]["deal_type"]
          p_default_total_collectible: number
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
      create_payment: {
        Args: {
          p_deal_id: string
          p_ewt_amount: number
          p_ewt_rate_used: number
          p_gross_amount: number
          p_net_cash: number
          p_net_of_vat: number
          p_payment_date: string
          p_payment_type: Database["public"]["Enums"]["payment_type"]
          p_reference_note: string
          p_retained_cash: number
          p_vat_amount: number
          p_vat_basis_used: Database["public"]["Enums"]["deal_vat_basis"]
          p_vat_rate_used: number
        }
        Returns: Json
      }
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
      delete_payment: {
        Args: { p_expected_version: number; p_id: string }
        Returns: Json
      }
      delete_plan_year_target: { Args: { p_year: number }; Returns: Json }
      delete_property_type: { Args: { p_id: string }; Returns: Json }
      dismiss_onboarding: { Args: never; Returns: Json }
      ensure_onboarding_state: { Args: never; Returns: Json }
      fail_recompute_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: Json
      }
      get_active_content_bundle: { Args: never; Returns: Json }
      get_or_seed_funnel_rates: { Args: never; Returns: Json }
      import_receivable_overlay: {
        Args: {
          p_confirmed: number
          p_deal_id: string
          p_legacy_note_missing?: boolean
          p_note: string
          p_status: Database["public"]["Enums"]["receivable_status"]
        }
        Returns: Json
      }
      log_deal_warning_override: {
        Args: { p_deal_id: string; p_warnings: string[] }
        Returns: Json
      }
      log_email_change: {
        Args: { p_new: string; p_old: string }
        Returns: string
      }
      log_password_change: { Args: never; Returns: string }
      log_payment_warning_override: {
        Args: { p_payment_id: string; p_warnings: string[] }
        Returns: Json
      }
      next_recompute_deals: {
        Args: { p_job_id: string; p_limit: number }
        Returns: Json
      }
      open_onboarding: { Args: never; Returns: Json }
      plan_ytd_actual_sales: {
        Args: { p_include_rentals?: boolean; p_year: number }
        Returns: string
      }
      reconcile_yield_aggregate: { Args: never; Returns: Json }
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
      reopen_onboarding: { Args: never; Returns: Json }
      reopen_receivable: {
        Args: { p_expected_version: number; p_receivable_id: string }
        Returns: Json
      }
      reorder_lead_source: {
        Args: { p_id: string; p_position: number }
        Returns: Json
      }
      run_workbook_import: { Args: { p_payload: Json }; Returns: Json }
      search_collectibles: {
        Args: {
          p_deal_code?: string
          p_limit?: number
          p_offset?: number
          p_only_with_balance?: boolean
          p_sort?: string
          p_status?: Database["public"]["Enums"]["receivable_status"]
          p_text?: string
          p_year?: number
        }
        Returns: {
          archived: boolean
          balance: string
          booked_year: number
          client_name: string
          collected_net: string
          deal_code: string
          deal_id: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          id: string
          property_details: string
          status: Database["public"]["Enums"]["receivable_status"]
          total_collectible: string
          total_count: number
        }[]
      }
      search_deals: {
        Args: {
          p_deal_code?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_text?: string
          p_year?: number
        }
        Returns: {
          archived: boolean
          booked_date: string
          booked_year: number
          client_name: string
          deal_code: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          developer_name: string
          id: string
          net_gci: string
          property_details: string
          total_count: number
          transaction_type: Database["public"]["Enums"]["deal_transaction_type"]
        }[]
      }
      search_payments: {
        Args: {
          p_deal_code?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_text?: string
          p_year?: number
        }
        Returns: {
          archived: boolean
          client_name: string
          deal_code: string
          deal_id: string
          gross: string
          id: string
          net_cash: string
          net_of_vat: string
          payment_date: string
          property_details: string
          total_count: number
          year_paid: number
        }[]
      }
      seed_developers: { Args: { p_items: Json }; Returns: Json }
      seed_lead_sources: { Args: { p_items: Json }; Returns: Json }
      seed_property_types: { Args: { p_items: Json }; Returns: Json }
      set_annual_target_override: {
        Args: { p_amount: number; p_note: string; p_year: number }
        Returns: Json
      }
      set_confirmed_collectible: {
        Args: { p_note: string; p_receivable_id: string; p_value: number }
        Returns: Json
      }
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
      set_next_action_note: {
        Args: { p_note: string; p_receivable_id: string }
        Returns: Json
      }
      set_property_type_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: Json
      }
      start_recompute_job: { Args: { p_event_id: string }; Returns: Json }
      update_deal: {
        Args: {
          p_billed_commission: number
          p_booked_date: string
          p_client_name: string
          p_comm_base: Database["public"]["Enums"]["deal_comm_base_display"]
          p_commission_basis: Database["public"]["Enums"]["deal_commission_basis"]
          p_deal_type: Database["public"]["Enums"]["deal_type"]
          p_default_total_collectible: number
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
      update_funnel_rates: {
        Args: {
          p_buyer_contact_to_viewing: number
          p_buyer_lead_to_contact: number
          p_buyer_viewing_to_atp: number
          p_listing_appointment_rate: number
          p_listing_to_sold: number
          p_seller_contact_to_appt: number
          p_seller_lead_to_contact: number
        }
        Returns: Json
      }
      update_lead_source: {
        Args: { p_id: string; p_name: string }
        Returns: Json
      }
      update_payment: {
        Args: {
          p_deal_id: string
          p_ewt_amount: number
          p_ewt_rate_used: number
          p_expected_version: number
          p_gross_amount: number
          p_id: string
          p_net_cash: number
          p_net_of_vat: number
          p_payment_date: string
          p_payment_type: Database["public"]["Enums"]["payment_type"]
          p_reference_note: string
          p_retained_cash: number
          p_vat_amount: number
          p_vat_basis_used: Database["public"]["Enums"]["deal_vat_basis"]
          p_vat_rate_used: number
        }
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
      upsert_plan_year_target: {
        Args: {
          p_avg_price_override: number
          p_cos_pct: number
          p_net_income_target: number
          p_opex_pct: number
          p_year: number
          p_yield_override: number
        }
        Returns: Json
      }
      zeta_search_needle: { Args: { input: string }; Returns: string }
      zeta_search_normalize: { Args: { input: string }; Returns: string }
    }
    Enums: {
      audit_action:
        | "create"
        | "update"
        | "archive"
        | "restore"
        | "delete_blocked"
        | "delete"
      content_bundle_status: "draft" | "published" | "archived"
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
      onboarding_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "dismissed"
      onboarding_step:
        | "basics"
        | "tax_review"
        | "seed_lists"
        | "migration_fork"
        | "first_deal"
      payment_event_type: "created" | "updated" | "deleted"
      payment_type: "commission" | "incentive"
      property_vat_rule: "threshold" | "always_vat" | "always_exempt"
      receivable_status: "open" | "closed" | "cancelled"
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
      content_bundle_status: ["draft", "published", "archived"],
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
      onboarding_status: [
        "not_started",
        "in_progress",
        "completed",
        "dismissed",
      ],
      onboarding_step: [
        "basics",
        "tax_review",
        "seed_lists",
        "migration_fork",
        "first_deal",
      ],
      payment_event_type: ["created", "updated", "deleted"],
      payment_type: ["commission", "incentive"],
      property_vat_rule: ["threshold", "always_vat", "always_exempt"],
      receivable_status: ["open", "closed", "cancelled"],
    },
  },
} as const
