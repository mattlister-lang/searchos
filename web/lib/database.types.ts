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
      activity: {
        Row: {
          body_raw: string | null
          company_id: string | null
          consultant: string
          created_at: string
          deal_id: string | null
          embedding: string | null
          id: string
          mandate_id: string | null
          occurred_at: string
          source: string
          source_ref: string
          subject: string | null
          summary: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          body_raw?: string | null
          company_id?: string | null
          consultant?: string
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          id?: string
          mandate_id?: string | null
          occurred_at: string
          source: string
          source_ref: string
          subject?: string | null
          summary?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          body_raw?: string | null
          company_id?: string | null
          consultant?: string
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          id?: string
          mandate_id?: string | null
          occurred_at?: string
          source?: string
          source_ref?: string
          subject?: string | null
          summary?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_board"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "activity_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "mandate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_funnel"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "activity_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["mandate_id"]
          },
        ]
      }
      activity_participant: {
        Row: {
          activity_id: string
          person_id: string
          role: string | null
        }
        Insert: {
          activity_id: string
          person_id: string
          role?: string | null
        }
        Update: {
          activity_id?: string
          person_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_participant_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "activity_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "activity_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "activity_participant_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          cost_gbp: number
          id: string
          input_tokens: number | null
          model: string
          occurred_at: string
          output_tokens: number | null
          provider: string
          purpose: string
          source: string | null
          source_ref: string | null
        }
        Insert: {
          cost_gbp?: number
          id?: string
          input_tokens?: number | null
          model: string
          occurred_at?: string
          output_tokens?: number | null
          provider: string
          purpose: string
          source?: string | null
          source_ref?: string | null
        }
        Update: {
          cost_gbp?: number
          id?: string
          input_tokens?: number | null
          model?: string
          occurred_at?: string
          output_tokens?: number | null
          provider?: string
          purpose?: string
          source?: string | null
          source_ref?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actor: string
          id: number
          new_row: Json | null
          occurred_at: string
          old_row: Json | null
          op: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          actor?: string
          id?: never
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          op: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          actor?: string
          id?: never
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          op?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      candidacy: {
        Row: {
          boarded_at: string | null
          created_at: string
          fee_amount: number | null
          id: string
          mandate_id: string
          notes: string | null
          offer_accepted_at: string | null
          outcome_reason: string | null
          person_id: string
          placed_at: string | null
          salary: number | null
          stage: Database["public"]["Enums"]["candidacy_stage"]
          stage_changed_at: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          boarded_at?: string | null
          created_at?: string
          fee_amount?: number | null
          id?: string
          mandate_id: string
          notes?: string | null
          offer_accepted_at?: string | null
          outcome_reason?: string | null
          person_id: string
          placed_at?: string | null
          salary?: number | null
          stage?: Database["public"]["Enums"]["candidacy_stage"]
          stage_changed_at?: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          boarded_at?: string | null
          created_at?: string
          fee_amount?: number | null
          id?: string
          mandate_id?: string
          notes?: string | null
          offer_accepted_at?: string | null
          outcome_reason?: string | null
          person_id?: string
          placed_at?: string | null
          salary?: number | null
          stage?: Database["public"]["Enums"]["candidacy_stage"]
          stage_changed_at?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "mandate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_funnel"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "candidacy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidacy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "candidacy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "candidacy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "candidacy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      company: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          name: string
          notes: string | null
          sectors: string[]
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          name: string
          notes?: string | null
          sectors?: string[]
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          name?: string
          notes?: string | null
          sectors?: string[]
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: []
      }
      company_domain: {
        Row: {
          company_id: string
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_domain_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_domain_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
        ]
      }
      counterparty_queue: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrence_count: number
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: []
      }
      deal: {
        Row: {
          company_id: string
          consultant: string
          created_at: string
          id: string
          name: string
          next_step: string | null
          notes: string | null
          primary_contact_id: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          updated_at: string
          value: number | null
        }
        Insert: {
          company_id: string
          consultant?: string
          created_at?: string
          id?: string
          name: string
          next_step?: string | null
          notes?: string | null
          primary_contact_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          company_id?: string
          consultant?: string
          created_at?: string
          id?: string
          name?: string
          next_step?: string | null
          notes?: string | null
          primary_contact_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "deal_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "deal_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "deal_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "deal_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      document: {
        Row: {
          company_id: string | null
          created_at: string
          deal_id: string | null
          embedding: string | null
          filename: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mandate_id: string | null
          mime_type: string | null
          parsed_text: string | null
          person_id: string | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          filename?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mandate_id?: string | null
          mime_type?: string | null
          parsed_text?: string | null
          person_id?: string | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          filename?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mandate_id?: string | null
          mime_type?: string | null
          parsed_text?: string | null
          person_id?: string | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "document_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_board"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "document_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "mandate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_funnel"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "document_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      employment: {
        Row: {
          company_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          person_id: string
          start_date: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          person_id: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          person_id?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employment_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      ingestion_dead_letter: {
        Row: {
          error: string
          id: string
          occurred_at: string
          payload: Json | null
          resolved: boolean
          source: string
          source_ref: string | null
        }
        Insert: {
          error: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          resolved?: boolean
          source: string
          source_ref?: string | null
        }
        Update: {
          error?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          resolved?: boolean
          source?: string
          source_ref?: string | null
        }
        Relationships: []
      }
      ingestion_state: {
        Row: {
          cursor: string | null
          source: string
          updated_at: string
        }
        Insert: {
          cursor?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          cursor?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      interview: {
        Row: {
          candidacy_id: string
          consultant: string
          created_at: string
          feedback: string | null
          id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          location: string | null
          notes: string | null
          outcome: Database["public"]["Enums"]["interview_outcome"]
          round: number
          scheduled_at: string | null
          updated_at: string
        }
        Insert: {
          candidacy_id: string
          consultant?: string
          created_at?: string
          feedback?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["interview_kind"]
          location?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["interview_outcome"]
          round?: number
          scheduled_at?: string | null
          updated_at?: string
        }
        Update: {
          candidacy_id?: string
          consultant?: string
          created_at?: string
          feedback?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["interview_kind"]
          location?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["interview_outcome"]
          round?: number
          scheduled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "candidacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["candidacy_id"]
          },
          {
            foreignKeyName: "interview_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "v_stage_dwell"
            referencedColumns: ["candidacy_id"]
          },
        ]
      }
      invoice: {
        Row: {
          amount: number
          candidacy_id: string
          created_at: string
          due_date: string | null
          id: string
          issued_at: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          terms: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          candidacy_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          issued_at?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          terms?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          candidacy_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          issued_at?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "candidacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["candidacy_id"]
          },
          {
            foreignKeyName: "invoice_candidacy_id_fkey"
            columns: ["candidacy_id"]
            isOneToOne: false
            referencedRelation: "v_stage_dwell"
            referencedColumns: ["candidacy_id"]
          },
        ]
      }
      mandate: {
        Row: {
          brief: string | null
          closed_at: string | null
          company_id: string
          consultant: string
          created_at: string
          deal_id: string | null
          embedding: string | null
          fee_terms: string | null
          functions: string[]
          id: string
          location: string | null
          opened_at: string | null
          salary_range: string | null
          seniority: string | null
          skills: string[]
          status: Database["public"]["Enums"]["mandate_status"]
          title: string
          updated_at: string
        }
        Insert: {
          brief?: string | null
          closed_at?: string | null
          company_id: string
          consultant?: string
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          fee_terms?: string | null
          functions?: string[]
          id?: string
          location?: string | null
          opened_at?: string | null
          salary_range?: string | null
          seniority?: string | null
          skills?: string[]
          status?: Database["public"]["Enums"]["mandate_status"]
          title: string
          updated_at?: string
        }
        Update: {
          brief?: string | null
          closed_at?: string | null
          company_id?: string
          consultant?: string
          created_at?: string
          deal_id?: string | null
          embedding?: string | null
          fee_terms?: string | null
          functions?: string[]
          id?: string
          location?: string | null
          opened_at?: string | null
          salary_range?: string | null
          seniority?: string | null
          skills?: string[]
          status?: Database["public"]["Enums"]["mandate_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mandate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mandate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_activity_pulse"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "mandate_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mandate_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_board"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      merge_log: {
        Row: {
          id: string
          kept_person_id: string
          merged_at: string
          removed_person_id: string
          removed_snapshot: Json
        }
        Insert: {
          id?: string
          kept_person_id: string
          merged_at?: string
          removed_person_id: string
          removed_snapshot: Json
        }
        Update: {
          id?: string
          kept_person_id?: string
          merged_at?: string
          removed_person_id?: string
          removed_snapshot?: Json
        }
        Relationships: []
      }
      merge_queue: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          person_a: string
          person_b: string
          reason: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          person_a: string
          person_b: string
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          person_a?: string
          person_b?: string
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merge_queue_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_queue_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_queue_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "merge_queue_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      person: {
        Row: {
          consent_override: string | null
          created_at: string
          embedding: string | null
          erased_at: string | null
          full_name: string
          functions: string[]
          id: string
          lawful_basis: string
          linkedin_url: string | null
          location: string | null
          profile: string | null
          sectors: string[]
          seniority: string | null
          skills: string[]
          updated_at: string
        }
        Insert: {
          consent_override?: string | null
          created_at?: string
          embedding?: string | null
          erased_at?: string | null
          full_name: string
          functions?: string[]
          id?: string
          lawful_basis?: string
          linkedin_url?: string | null
          location?: string | null
          profile?: string | null
          sectors?: string[]
          seniority?: string | null
          skills?: string[]
          updated_at?: string
        }
        Update: {
          consent_override?: string | null
          created_at?: string
          embedding?: string | null
          erased_at?: string | null
          full_name?: string
          functions?: string[]
          id?: string
          lawful_basis?: string
          linkedin_url?: string | null
          location?: string | null
          profile?: string | null
          sectors?: string[]
          seniority?: string | null
          skills?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      person_email: {
        Row: {
          created_at: string
          email: string
          id: string
          is_primary: boolean
          person_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          person_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_email_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_email_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_email_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_relationship_freshness"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_email_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_retention_review"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_email_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_statutory_purge"
            referencedColumns: ["person_id"]
          },
        ]
      }
      suppression_list: {
        Row: {
          email_hash: string
          id: string
          reason: string | null
          suppressed_at: string
        }
        Insert: {
          email_hash: string
          id?: string
          reason?: string | null
          suppressed_at?: string
        }
        Update: {
          email_hash?: string
          id?: string
          reason?: string | null
          suppressed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_activity_pulse: {
        Row: {
          company: string | null
          company_id: string | null
          last_30d: number | null
          prior_30d: number | null
        }
        Relationships: []
      }
      v_ai_spend: {
        Row: {
          calls: number | null
          cost_gbp: number | null
          month: string | null
          provider: string | null
        }
        Relationships: []
      }
      v_deal_board: {
        Row: {
          company: string | null
          deal_id: string | null
          name: string | null
          next_step: string | null
          primary_contact: string | null
          stage: Database["public"]["Enums"]["deal_stage"] | null
          updated_at: string | null
          value: number | null
        }
        Relationships: []
      }
      v_fee_income: {
        Row: {
          fees: number | null
          month: string | null
          placements: number | null
        }
        Relationships: []
      }
      v_funnel: {
        Row: {
          candidates: number | null
          client: string | null
          mandate: string | null
          mandate_id: string | null
          stage: Database["public"]["Enums"]["candidacy_stage"] | null
        }
        Relationships: []
      }
      v_next_actions: {
        Row: {
          context: string | null
          item: string | null
          reason: string | null
          since: string | null
        }
        Relationships: []
      }
      v_pipeline: {
        Row: {
          candidacy_id: string | null
          client: string | null
          full_name: string | null
          mandate: string | null
          mandate_id: string | null
          person_id: string | null
          stage: Database["public"]["Enums"]["candidacy_stage"] | null
          stage_changed_at: string | null
          time_in_stage: string | null
        }
        Relationships: []
      }
      v_relationship_freshness: {
        Row: {
          days_since_contact: number | null
          full_name: string | null
          last_activity_at: string | null
          person_id: string | null
        }
        Relationships: []
      }
      v_retention_review: {
        Row: {
          full_name: string | null
          last_activity_at: string | null
          person_id: string | null
        }
        Relationships: []
      }
      v_sales_board: {
        Row: {
          fees_boarded: number | null
          invoiced: number | null
          month: string | null
          paid: number | null
          placements_boarded: number | null
        }
        Relationships: []
      }
      v_stage_dwell: {
        Row: {
          candidacy_id: string | null
          days_in_stage: number | null
          full_name: string | null
          mandate: string | null
          stage: Database["public"]["Enums"]["candidacy_stage"] | null
          stale: boolean | null
        }
        Relationships: []
      }
      v_statutory_purge: {
        Row: {
          erased_at: string | null
          mandate_id: string | null
          person_id: string | null
          placed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "mandate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_funnel"
            referencedColumns: ["mandate_id"]
          },
          {
            foreignKeyName: "candidacy_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline"
            referencedColumns: ["mandate_id"]
          },
        ]
      }
      v_upcoming_interviews: {
        Row: {
          candidate: string | null
          client: string | null
          consultant: string | null
          interview_id: string | null
          kind: Database["public"]["Enums"]["interview_kind"] | null
          mandate: string | null
          round: number | null
          scheduled_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      erase_person: { Args: { p_person: string }; Returns: undefined }
      merge_people: {
        Args: { p_keep: string; p_remove: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      similar_people: {
        Args: { p_company?: string; p_name: string }
        Returns: {
          full_name: string
          person_id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      activity_type:
        | "email"
        | "meeting"
        | "call"
        | "note"
        | "linkedin_message"
        | "linkedin_post"
        | "event"
      candidacy_stage:
        | "identified"
        | "approached"
        | "screening"
        | "shortlisted"
        | "client_interview"
        | "offer"
        | "placed"
        | "rejected"
        | "withdrawn"
      company_status: "prospect" | "client" | "target" | "source"
      deal_stage:
        | "lead"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      document_kind: "cv" | "spec" | "terms" | "other"
      interview_kind:
        | "consultant"
        | "phone"
        | "video"
        | "in_person"
        | "panel"
        | "final"
      interview_outcome:
        | "scheduled"
        | "passed"
        | "failed"
        | "cancelled"
        | "no_show"
      invoice_status: "draft" | "issued" | "paid" | "void"
      mandate_status: "open" | "on_hold" | "completed" | "cancelled"
      queue_status: "pending" | "approved" | "ignored" | "rejected"
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
      activity_type: [
        "email",
        "meeting",
        "call",
        "note",
        "linkedin_message",
        "linkedin_post",
        "event",
      ],
      candidacy_stage: [
        "identified",
        "approached",
        "screening",
        "shortlisted",
        "client_interview",
        "offer",
        "placed",
        "rejected",
        "withdrawn",
      ],
      company_status: ["prospect", "client", "target", "source"],
      deal_stage: [
        "lead",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      document_kind: ["cv", "spec", "terms", "other"],
      interview_kind: [
        "consultant",
        "phone",
        "video",
        "in_person",
        "panel",
        "final",
      ],
      interview_outcome: [
        "scheduled",
        "passed",
        "failed",
        "cancelled",
        "no_show",
      ],
      invoice_status: ["draft", "issued", "paid", "void"],
      mandate_status: ["open", "on_hold", "completed", "cancelled"],
      queue_status: ["pending", "approved", "ignored", "rejected"],
    },
  },
} as const
