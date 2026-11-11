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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_call_log: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          path: string | null
          row_count: number | null
          status: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          path?: string | null
          row_count?: number | null
          status?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          path?: string | null
          row_count?: number | null
          status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_call_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clients: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          level: string
          name: string
          revoked_at: string | null
          site_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          level: string
          name: string
          revoked_at?: string | null
          site_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          level?: string
          name?: string
          revoked_at?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          job_title_id: string | null
          org_unit_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["employee_status"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          job_title_id?: string | null
          org_unit_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["employee_status"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          job_title_id?: string | null
          org_unit_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "assignments_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          default_status: Database["public"]["Enums"]["employee_status"]
          id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          default_status: Database["public"]["Enums"]["employee_status"]
          id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          default_status?: Database["public"]["Enums"]["employee_status"]
          id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      compensation: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          id: string
          net_monthly_salary_fcfa: number
          updated_at: string
          updated_by: string | null
          contract_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          effective_date: string
          employee_id: string
          id?: string
          net_monthly_salary_fcfa: number
          updated_at?: string
          updated_by?: string | null
          contract_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          net_monthly_salary_fcfa?: number
          updated_at?: string
          updated_by?: string | null
          contract_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      contracts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          duration_months: number | null
          employee_id: string
          end_date: string | null
          id: string
          previous_contract_id: string | null
          start_date: string
          terminated_on: string | null
          type: Database["public"]["Enums"]["contract_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_months?: number | null
          employee_id: string
          end_date?: string | null
          id?: string
          previous_contract_id?: string | null
          start_date: string
          terminated_on?: string | null
          type: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_months?: number | null
          employee_id?: string
          end_date?: string | null
          id?: string
          previous_contract_id?: string | null
          start_date?: string
          terminated_on?: string | null
          type?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contracts_previous_contract_id_fkey"
            columns: ["previous_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_previous_contract_id_fkey"
            columns: ["previous_contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contracts_previous_contract_id_fkey"
            columns: ["previous_contract_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          action: string
          at: string
          document_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          at?: string
          document_id: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          at?: string
          document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          archived_at: string | null
          confidentiality: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          retention_months: number | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          confidentiality?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          retention_months?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          confidentiality?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          retention_months?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          archived_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          document_date: string | null
          document_type_id: string
          employee_id: string
          expires_on: string | null
          file_name: string
          id: string
          mime_type: string | null
          replaces_document_id: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          updated_by: string | null
          version: number
          description: string | null
        }
        Insert: {
          archived_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          document_date?: string | null
          document_type_id: string
          employee_id: string
          expires_on?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          replaces_document_id?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          description?: string | null
        }
        Update: {
          archived_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          document_date?: string | null
          document_type_id?: string
          employee_id?: string
          expires_on?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          replaces_document_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_replaces_document_id_fkey"
            columns: ["replaces_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_sensitive: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string
          id: string
          id_document_number: string | null
          id_document_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          id?: string
          id_document_number?: string | null
          id_document_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          id?: string
          id_document_number?: string | null
          id_document_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_sensitive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sensitive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_sensitive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_sensitive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      employee_sites: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_primary: boolean
          site_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean
          site_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean
          site_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_sites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_sites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_sites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          archived_at: string | null
          birth_date: string | null
          birth_place: string | null
          children_count: number
          created_at: string
          created_by: string | null
          email: string | null
          first_names: string
          id: string
          last_name: string
          manager_id: string | null
          marital_status: string | null
          matricule: string
          phone: string | null
          updated_at: string
          updated_by: string | null
          professional_email: string | null
          nationality_code: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          birth_date?: string | null
          birth_place?: string | null
          children_count?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_names: string
          id?: string
          last_name: string
          manager_id?: string | null
          marital_status?: string | null
          matricule: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
          professional_email?: string | null
          nationality_code?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          birth_date?: string | null
          birth_place?: string | null
          children_count?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_names?: string
          id?: string
          last_name?: string
          manager_id?: string | null
          marital_status?: string | null
          matricule?: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
          professional_email?: string | null
          nationality_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      employee_reviews: {
        Row: {
          archived_at: string | null
          comment: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          kind: string
          rating: number | null
          review_date: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          comment: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          kind: string
          rating?: number | null
          review_date: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          comment?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          kind?: string
          rating?: number | null
          review_date?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      exit_reasons: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_confidential: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_confidential?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_confidential?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      exits: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          exit_date: string
          id: string
          notes: string | null
          reason_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          exit_date: string
          id?: string
          notes?: string | null
          reason_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          exit_date?: string
          id?: string
          notes?: string | null
          reason_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "exits_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "exit_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_aliases: {
        Row: {
          alias: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          job_title_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alias: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_title_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alias?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_title_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_aliases_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          archived_at: string | null
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          notification_id: string
          recipient_email: string
          sent_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          attempts?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          notification_id: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          attempts?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          notification_id?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_units: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          type: Database["public"]["Enums"]["org_unit_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          type: Database["public"]["Enums"]["org_unit_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: Database["public"]["Enums"]["org_unit_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          resource: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          resource: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          resource?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          email: string
          employee_id: string | null
          full_name: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          employee_id?: string | null
          full_name?: string
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          permission_id: string
          role_id: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          permission_id: string
          role_id: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          permission_id?: string
          role_id?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          archived_at: string | null
          code: Database["public"]["Enums"]["app_role"]
          created_at: string
          created_by: string | null
          id: string
          label: string
          requires_mfa: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          code: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          requires_mfa?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          code?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          requires_mfa?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string
          label: string
          sort_order: number
          unit: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          label: string
          sort_order?: number
          unit: string
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          label?: string
          sort_order?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      sites: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_scopes: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          org_unit_id: string | null
          site_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_unit_id?: string | null
          site_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_unit_id?: string | null
          site_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_scopes_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_contract_alerts: {
        Row: {
          contract_end: string | null
          contract_id: string | null
          contract_start: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          days_remaining: number | null
          employee_id: string | null
          first_names: string | null
          last_name: string | null
          matricule: string | null
          notice_days: number | null
          org_unit_id: string | null
          primary_site_id: string | null
          reference_date: string | null
          retirement_date: string | null
          to_notify: boolean | null
          to_regularize: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sites_site_id_fkey"
            columns: ["primary_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      v_employee_current: {
        Row: {
          archived_at: string | null
          assignment_id: string | null
          assignment_start: string | null
          birth_date: string | null
          category_code: string | null
          category_id: string | null
          contract_end: string | null
          contract_id: string | null
          contract_start: string | null
          contract_terminated_on: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          email: string | null
          employee_id: string | null
          exit_date: string | null
          first_names: string | null
          is_active: boolean | null
          job_title_id: string | null
          job_title_name: string | null
          last_name: string | null
          manager_id: string | null
          matricule: string | null
          org_unit_id: string | null
          org_unit_name: string | null
          org_unit_path: string[] | null
          phone: string | null
          primary_site_id: string | null
          primary_site_name: string | null
          site_ids: string[] | null
          status: Database["public"]["Enums"]["employee_status"] | null
          professional_email: string | null
          nationality_code: string | null
          last_change: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sites_site_id_fkey"
            columns: ["primary_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_employee_metrics: {
        Row: {
          age_years: number | null
          employee_id: string | null
          hire_date: string | null
          retirement_date: string | null
          seniority_months: number | null
        }
        Relationships: []
      }
      v_exit_details: {
        Row: {
          archived_at: string | null
          created_at: string | null
          employee_id: string | null
          exit_date: string | null
          id: string | null
          is_confidential: boolean | null
          notes: string | null
          reason_id: string | null
          reason_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_contract_alerts"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_current"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "exits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_metrics"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_kpis: {
        Row: {
          active_headcount: number | null
          average_age: number | null
          average_seniority_months: number | null
          by_contract_type: Json | null
          by_department: Json | null
          by_site: Json | null
          by_status: Json | null
          median_age: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_read_audit_table: {
        Args: { _employee_id: string; _table: string }
        Returns: boolean
      }
      generate_contract_notifications: { Args: never; Returns: number }
      generate_document_notifications: { Args: never; Returns: number }
      purge_api_call_log: { Args: { _days?: number }; Returns: number }
      review_is_mine: { Args: { _employee_id: string }; Returns: boolean }
      get_my_permissions: {
        Args: never
        Returns: {
          action: string
          resource: string
          scope: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_user_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _resource: string }
        Returns: boolean
      }
      has_permission_on: {
        Args: { _action: string; _employee_id: string; _resource: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_scope: { Args: { _employee_id: string }; Returns: boolean }
      in_scope_for: {
        Args: { _employee_id: string; _user_id: string }
        Returns: boolean
      }
      is_confidential_document_type: {
        Args: { _type_id: string }
        Returns: boolean
      }
      is_confidential_exit_reason: {
        Args: { _reason_id: string }
        Returns: boolean
      }
      is_subordinate: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      mfa_ok: { Args: never; Returns: boolean }
      my_mfa_required: { Args: never; Returns: boolean }
      org_unit_ancestor_of_type: {
        Args: {
          _type: Database["public"]["Enums"]["org_unit_type"]
          _unit_id: string
        }
        Returns: string
      }
      org_unit_ancestors: { Args: { _unit_id: string }; Returns: string[] }
      user_has_permission_on: {
        Args: {
          _action: string
          _employee_id: string
          _resource: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin_rh"
        | "gestionnaire_rh"
        | "direction"
        | "admin_it"
        | "drh"
        | "paie"
        | "manager"
        | "auditeur"
      contract_type: "cdi" | "cdd" | "stage" | "consultant"
      employee_status:
        | "cadre"
        | "agent_maitrise"
        | "employe"
        | "ouvrier"
        | "stagiaire"
      org_unit_type: "direction" | "departement" | "service" | "equipe"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin_rh",
        "gestionnaire_rh",
        "direction",
        "admin_it",
        "drh",
        "paie",
        "manager",
        "auditeur",
      ],
      contract_type: ["cdi", "cdd", "stage", "consultant"],
      employee_status: [
        "cadre",
        "agent_maitrise",
        "employe",
        "ouvrier",
        "stagiaire",
      ],
      org_unit_type: ["direction", "departement", "service", "equipe"],
    },
  },
} as const
