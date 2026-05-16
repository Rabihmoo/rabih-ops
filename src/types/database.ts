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
      attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          ip_address?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          ip_address?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          color: string
          created_at: string
          name: string
        }
        Insert: {
          code: string
          color: string
          created_at?: string
          name: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      calendar_event_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          event_end: string | null
          event_html_link: string | null
          event_start: string | null
          event_title: string | null
          google_calendar_id: string
          google_event_id: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          event_end?: string | null
          event_html_link?: string | null
          event_start?: string | null
          event_title?: string | null
          google_calendar_id?: string
          google_event_id: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          event_end?: string | null
          event_html_link?: string | null
          event_start?: string | null
          event_title?: string | null
          google_calendar_id?: string
          google_event_id?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          updated_by: string
          website: string | null
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by: string
          website?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_branches: {
        Row: {
          branch: string
          company_id: string
        }
        Insert: {
          branch: string
          company_id: string
        }
        Update: {
          branch?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_branches_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_branches: {
        Row: {
          branch: string
          contact_id: string
        }
        Insert: {
          branch: string
          contact_id: string
        }
        Update: {
          branch?: string
          contact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_branches_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contact_branches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: string | null
          telegram_handle: string | null
          updated_at: string
          updated_by: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          telegram_handle?: string | null
          updated_at?: string
          updated_by: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          telegram_handle?: string | null
          updated_at?: string
          updated_by?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          document_id: string
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          document_id: string
          entity_id: string
          entity_type: string
          id?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          document_id?: string
          entity_id?: string
          entity_type?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          body_md: string | null
          branch: string | null
          category: string
          change_note: string | null
          changed_by: string
          created_at: string
          document_id: string
          id: number
          status: string
          title: string
          version_no: number
          visibility: string
        }
        Insert: {
          body_md?: string | null
          branch?: string | null
          category: string
          change_note?: string | null
          changed_by: string
          created_at?: string
          document_id: string
          id?: number
          status: string
          title: string
          version_no: number
          visibility: string
        }
        Update: {
          body_md?: string | null
          branch?: string | null
          category?: string
          change_note?: string | null
          changed_by?: string
          created_at?: string
          document_id?: string
          id?: number
          status?: string
          title?: string
          version_no?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          body_md: string | null
          branch: string | null
          category: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          module: string | null
          status: string
          title: string
          tsv: unknown
          updated_at: string
          updated_by: string
          visibility: string
        }
        Insert: {
          body_md?: string | null
          branch?: string | null
          category: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          module?: string | null
          status?: string
          title: string
          tsv?: unknown
          updated_at?: string
          updated_by: string
          visibility?: string
        }
        Update: {
          body_md?: string | null
          branch?: string | null
          category?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          module?: string | null
          status?: string
          title?: string
          tsv?: unknown
          updated_at?: string
          updated_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          from_address: string | null
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string
          html_link: string | null
          id: number
          internal_date: string | null
          snippet: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          from_address?: string | null
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          html_link?: string | null
          id?: number
          internal_date?: string | null
          snippet?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          from_address?: string | null
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          html_link?: string | null
          id?: number
          internal_date?: string | null
          snippet?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          branch: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string
          id: string
          module: string | null
          outcome: string | null
          person: string | null
          priority: string
          snoozed_until: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          module?: string | null
          outcome?: string | null
          person?: string | null
          priority?: string
          snoozed_until?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          module?: string | null
          outcome?: string | null
          person?: string | null
          priority?: string
          snoozed_until?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_at: string
          created_at: string
          disconnected_at: string | null
          google_account_id: string
          google_email: string
          is_active: boolean
          last_used_at: string | null
          refresh_token_secret_id: string
          scope: string
          service: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          google_account_id: string
          google_email: string
          is_active?: boolean
          last_used_at?: string | null
          refresh_token_secret_id: string
          scope: string
          service?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          google_account_id?: string
          google_email?: string
          is_active?: boolean
          last_used_at?: string | null
          refresh_token_secret_id?: string
          scope?: string
          service?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_findings: {
        Row: {
          action_required: string | null
          created_at: string
          description: string
          follow_up_date: string | null
          id: string
          inspection_id: string
          resolution_note: string | null
          resolved_at: string | null
          responsible: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          action_required?: string | null
          created_at?: string
          description: string
          follow_up_date?: string | null
          id?: string
          inspection_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          responsible?: string | null
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_required?: string | null
          created_at?: string
          description?: string
          follow_up_date?: string | null
          id?: string
          inspection_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          responsible?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_findings_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          area: string
          branch: string
          created_at: string
          deleted_at: string | null
          general_notes: string | null
          id: string
          inspected_by: string
          inspection_date: string
          result: string
          updated_at: string
        }
        Insert: {
          area: string
          branch: string
          created_at?: string
          deleted_at?: string | null
          general_notes?: string | null
          id?: string
          inspected_by: string
          inspection_date: string
          result?: string
          updated_at?: string
        }
        Update: {
          area?: string
          branch?: string
          created_at?: string
          deleted_at?: string | null
          general_notes?: string | null
          id?: string
          inspected_by?: string
          inspection_date?: string
          result?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "inspections_inspected_by_fkey"
            columns: ["inspected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          archived_at: string | null
          body_md: string
          branch: string | null
          created_at: string
          created_by: string
          decided_at: string | null
          decision_impact: string | null
          decision_reason: string | null
          decision_status: string | null
          deleted_at: string | null
          id: string
          kind: string
          module: string
          title: string | null
          updated_at: string
          updated_by: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          body_md: string
          branch?: string | null
          created_at?: string
          created_by: string
          decided_at?: string | null
          decision_impact?: string | null
          decision_reason?: string | null
          decision_status?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          module?: string
          title?: string | null
          updated_at?: string
          updated_by: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          body_md?: string
          branch?: string | null
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decision_impact?: string | null
          decision_reason?: string | null
          decision_status?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          module?: string
          title?: string | null
          updated_at?: string
          updated_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          error: string | null
          fired_at: string
          id: number
          provider_msg_id: string | null
          queue_id: number | null
          recipient_id: string
          status: string
        }
        Insert: {
          channel: string
          error?: string | null
          fired_at?: string
          id?: number
          provider_msg_id?: string | null
          queue_id?: number | null
          recipient_id: string
          status: string
        }
        Update: {
          channel?: string
          error?: string | null
          fired_at?: string
          id?: number
          provider_msg_id?: string | null
          queue_id?: number | null
          recipient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notifications_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_queue: {
        Row: {
          attempts: number
          cancel_reason: string | null
          cancelled_at: string | null
          channel: string
          created_at: string
          dismissed_at: string | null
          entity_id: string
          entity_type: string
          fire_at: string
          fired_at: string | null
          id: number
          kind: string
          last_error: string | null
          payload: Json | null
          recipient_id: string
          status: string
        }
        Insert: {
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          dismissed_at?: string | null
          entity_id: string
          entity_type: string
          fire_at: string
          fired_at?: string | null
          id?: number
          kind: string
          last_error?: string | null
          payload?: Json | null
          recipient_id: string
          status?: string
        }
        Update: {
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string
          entity_type?: string
          fire_at?: string
          fired_at?: string | null
          id?: number
          kind?: string
          last_error?: string | null
          payload?: Json | null
          recipient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_queue_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_state: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          redirect_to: string | null
          service: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider: string
          redirect_to?: string | null
          service?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          service?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          actual_delivery_date: string | null
          amount_paid: number | null
          branch: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          expected_delivery_date: string | null
          id: string
          module: string | null
          notes: string | null
          order_date: string | null
          payment_method: string | null
          payment_status: string
          priority: string
          qty_ordered: number | null
          qty_received: number | null
          reminder_date: string | null
          requested_by: string
          status: string
          submitted_at: string | null
          supplier_name: string
          supplier_website: string | null
          title: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          amount_paid?: number | null
          branch: string
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          module?: string | null
          notes?: string | null
          order_date?: string | null
          payment_method?: string | null
          payment_status?: string
          priority?: string
          qty_ordered?: number | null
          qty_received?: number | null
          reminder_date?: string | null
          requested_by: string
          status?: string
          submitted_at?: string | null
          supplier_name: string
          supplier_website?: string | null
          title: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          amount_paid?: number | null
          branch?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          module?: string | null
          notes?: string | null
          order_date?: string | null
          payment_method?: string | null
          payment_status?: string
          priority?: string
          qty_ordered?: number | null
          qty_received?: number | null
          reminder_date?: string | null
          requested_by?: string
          status?: string
          submitted_at?: string | null
          supplier_name?: string
          supplier_website?: string | null
          title?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "purchase_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      record_links: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          external_app: string | null
          external_label: string | null
          external_record_id: string | null
          external_record_type: string | null
          external_snapshot: Json
          external_url: string | null
          from_entity_id: string
          from_entity_type: string
          id: number
          relationship: string
          to_entity_id: string | null
          to_entity_type: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          external_app?: string | null
          external_label?: string | null
          external_record_id?: string | null
          external_record_type?: string | null
          external_snapshot?: Json
          external_url?: string | null
          from_entity_id: string
          from_entity_type: string
          id?: number
          relationship?: string
          to_entity_id?: string | null
          to_entity_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          external_app?: string | null
          external_label?: string | null
          external_record_id?: string | null
          external_record_type?: string | null
          external_snapshot?: Json
          external_url?: string | null
          from_entity_id?: string
          from_entity_type?: string
          id?: number
          relationship?: string
          to_entity_id?: string | null
          to_entity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          branch: string
          category: string
          completed_at: string | null
          completion_note: string | null
          created_at: string
          created_by: string
          deadline_reminder_at: string | null
          delay_reason: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          follow_up_reminder_at: string | null
          id: string
          is_template: boolean
          module: string | null
          next_spawn_at: string | null
          outcome: string | null
          priority: string
          recurrence: string | null
          recurrence_dom: number | null
          recurrence_dow: number[] | null
          recurrence_month: number | null
          recurrence_time: string | null
          repeat_reason: string | null
          start_reminder_at: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          waiting_on_label: string | null
          waiting_on_user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          branch: string
          category: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by: string
          deadline_reminder_at?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_reminder_at?: string | null
          id?: string
          is_template?: boolean
          module?: string | null
          next_spawn_at?: string | null
          outcome?: string | null
          priority?: string
          recurrence?: string | null
          recurrence_dom?: number | null
          recurrence_dow?: number[] | null
          recurrence_month?: number | null
          recurrence_time?: string | null
          repeat_reason?: string | null
          start_reminder_at?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          waiting_on_label?: string | null
          waiting_on_user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          branch?: string
          category?: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string
          deadline_reminder_at?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_reminder_at?: string | null
          id?: string
          is_template?: boolean
          module?: string | null
          next_spawn_at?: string | null
          outcome?: string | null
          priority?: string
          recurrence?: string | null
          recurrence_dom?: number | null
          recurrence_dow?: number[] | null
          recurrence_month?: number | null
          recurrence_time?: string | null
          repeat_reason?: string | null
          start_reminder_at?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          waiting_on_label?: string | null
          waiting_on_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_branch_fkey"
            columns: ["branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_waiting_on_user_id_fkey"
            columns: ["waiting_on_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chats: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          last_list_at: string | null
          last_list_ids: string[] | null
          last_seen_at: string | null
          link_token: string | null
          link_token_expires_at: string | null
          linked_at: string | null
          tg_chat_id: number | null
          tg_first_name: string | null
          tg_username: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          last_list_at?: string | null
          last_list_ids?: string[] | null
          last_seen_at?: string | null
          link_token?: string | null
          link_token_expires_at?: string | null
          linked_at?: string | null
          tg_chat_id?: number | null
          tg_first_name?: string | null
          tg_username?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          last_list_at?: string | null
          last_list_ids?: string[] | null
          last_seen_at?: string | null
          link_token?: string | null
          link_token_expires_at?: string | null
          linked_at?: string | null
          tg_chat_id?: number | null
          tg_first_name?: string | null
          tg_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_messages: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          id: number
          message_text: string
          parsed_command: string | null
          parsed_params: Json | null
          response_text: string | null
          tg_chat_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          error?: string | null
          id?: number
          message_text: string
          parsed_command?: string | null
          parsed_params?: Json | null
          response_text?: string | null
          tg_chat_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          id?: number
          message_text?: string
          parsed_command?: string | null
          parsed_params?: Json | null
          response_text?: string | null
          tg_chat_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branches: string[]
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          branches?: string[]
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          branches?: string[]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          id: string
          message_text: string
          parsed_command: string | null
          parsed_params: Json | null
          phone: string
          response_text: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          message_text: string
          parsed_command?: string | null
          parsed_params?: Json | null
          phone: string
          response_text?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          message_text?: string
          parsed_command?: string | null
          parsed_params?: Json | null
          phone?: string
          response_text?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _activity_severity_rank: { Args: { p_severity: string }; Returns: number }
      _add_attachment: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      _add_comment: {
        Args: { p_body: string; p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      _audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_entity_id: string
          p_entity_type: string
          p_source?: string
        }
        Returns: undefined
      }
      _can_access_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      _can_admin_inspect: { Args: never; Returns: boolean }
      _can_admin_purchases: { Args: never; Returns: boolean }
      _can_mutate: { Args: never; Returns: boolean }
      _company_visible: { Args: { p_id: string }; Returns: boolean }
      _contact_visible: { Args: { p_id: string }; Returns: boolean }
      _delete_comment: { Args: { p_comment_id: string }; Returns: Json }
      _drain_reminders: { Args: never; Returns: number }
      _enqueue_followup_due_today: { Args: never; Returns: number }
      _next_spawn_at: {
        Args: {
          p_from?: string
          p_recurrence: string
          p_recurrence_dom: number
          p_recurrence_dow: number[]
          p_recurrence_month: number
          p_recurrence_time: string
        }
        Returns: string
      }
      _note_visible: { Args: { p_id: string }; Returns: boolean }
      _note_writable: { Args: { p_id: string }; Returns: boolean }
      _remove_attachment: { Args: { p_attachment_id: string }; Returns: Json }
      _require_auth: { Args: never; Returns: string }
      _require_branch_access: { Args: { p_branch: string }; Returns: undefined }
      _require_branches_assignable: {
        Args: { p_branches: string[] }
        Returns: undefined
      }
      _resolve_task_id: {
        Args: { p_chat_id: number; p_input: string; p_user_id: string }
        Returns: string
      }
      _resolve_task_short_id: {
        Args: { p_prefix: string; p_user_id: string }
        Returns: string
      }
      _spawn_due_recurring: { Args: never; Returns: number }
      _sync_task_reminder_kind: {
        Args: {
          p_fire_at: string
          p_kind: string
          p_payload: Json
          p_recipient: string
          p_task_id: string
        }
        Returns: undefined
      }
      _task_short_id: { Args: { p_id: string }; Returns: string }
      _telegram_remember_list: {
        Args: { p_chat_id: number; p_ids: string[] }
        Returns: undefined
      }
      _telegram_task_block: { Args: { p_task_id: string }; Returns: string }
      _telegram_task_line: {
        Args: { p_n: number; p_task_id: string }
        Returns: string
      }
      _telegram_user: { Args: { p_chat_id: number }; Returns: string }
      current_user_can_access_branch: {
        Args: { p_branch: string }
        Returns: boolean
      }
      current_user_role: { Args: never; Returns: string }
      rpc_activity_inbox: {
        Args: { p_horizon_days?: number; p_limit_per_source?: number }
        Returns: Json
      }
      rpc_add_document_comment: {
        Args: { p_body: string; p_doc_id: string }
        Returns: Json
      }
      rpc_add_follow_up_comment: {
        Args: { p_body: string; p_follow_up_id: string }
        Returns: Json
      }
      rpc_add_inspection_comment: {
        Args: { p_body: string; p_inspection_id: string }
        Returns: Json
      }
      rpc_add_inspection_finding: {
        Args: {
          p_action_required?: string
          p_description: string
          p_follow_up_date?: string
          p_inspection_id: string
          p_responsible?: string
          p_severity: string
        }
        Returns: Json
      }
      rpc_add_purchase_comment: {
        Args: { p_body: string; p_id: string }
        Returns: Json
      }
      rpc_add_task_comment: {
        Args: { p_body: string; p_task_id: string }
        Returns: Json
      }
      rpc_approve_purchase_request: {
        Args: {
          p_id: string
          p_order_date?: string
          p_payment_method?: string
          p_total_amount?: number
        }
        Returns: Json
      }
      rpc_archive_company: { Args: { p_id: string }; Returns: Json }
      rpc_archive_contact: { Args: { p_id: string }; Returns: Json }
      rpc_archive_document: { Args: { p_doc_id: string }; Returns: Json }
      rpc_archive_note: { Args: { p_id: string }; Returns: Json }
      rpc_archive_recurring_template: {
        Args: { p_reason?: string; p_template_id: string }
        Returns: Json
      }
      rpc_archive_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: Json
      }
      rpc_attach_file_to_document: {
        Args: {
          p_doc_id: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      rpc_attach_file_to_follow_up: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_follow_up_id: string
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      rpc_attach_file_to_inspection: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_inspection_id: string
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      rpc_attach_file_to_purchase: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_id: string
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      rpc_attach_file_to_task: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
          p_task_id: string
        }
        Returns: Json
      }
      rpc_bootstrap_user: { Args: { p_full_name?: string }; Returns: Json }
      rpc_calendar_consume_state: { Args: { p_state: string }; Returns: Json }
      rpc_calendar_disconnect_self: { Args: never; Returns: Json }
      rpc_calendar_get_token: { Args: { p_user_id: string }; Returns: Json }
      rpc_calendar_link_status: { Args: never; Returns: Json }
      rpc_calendar_links_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      rpc_calendar_mark_disconnected: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      rpc_calendar_record_event: {
        Args: {
          p_calendar_id: string
          p_end: string
          p_entity_id: string
          p_entity_type: string
          p_event_id: string
          p_html_link: string
          p_start: string
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_calendar_remove_event: { Args: { p_link_id: number }; Returns: Json }
      rpc_calendar_request_authorize: {
        Args: { p_redirect_to?: string }
        Returns: Json
      }
      rpc_calendar_store_tokens: {
        Args: {
          p_access_expires_at: string
          p_access_token: string
          p_account_id: string
          p_email: string
          p_refresh_token: string
          p_scope: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_calendar_update_access_token: {
        Args: {
          p_access_expires_at: string
          p_access_token: string
          p_user_id: string
        }
        Returns: undefined
      }
      rpc_cancel_purchase_request: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_cancel_reminder: {
        Args: { p_queue_id: number; p_reason?: string }
        Returns: Json
      }
      rpc_claim_telegram_reminders: {
        Args: { p_limit?: number }
        Returns: Json
      }
      rpc_complete_inspection: {
        Args: { p_inspection_id: string; p_result: string }
        Returns: Json
      }
      rpc_complete_task: {
        Args: {
          p_completion_note?: string
          p_outcome?: string
          p_task_id: string
        }
        Returns: Json
      }
      rpc_create_company: {
        Args: {
          p_branches?: string[]
          p_category: string
          p_email?: string
          p_name: string
          p_notes?: string
          p_phone?: string
          p_website?: string
        }
        Returns: Json
      }
      rpc_create_contact: {
        Args: {
          p_branches?: string[]
          p_company_id?: string
          p_email?: string
          p_full_name: string
          p_notes?: string
          p_phone?: string
          p_role?: string
          p_telegram_handle?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      rpc_create_document: {
        Args: {
          p_body_md?: string
          p_branch?: string
          p_category: string
          p_status?: string
          p_title: string
          p_visibility?: string
        }
        Returns: Json
      }
      rpc_create_follow_up: {
        Args: {
          p_assigned_to?: string
          p_branch?: string
          p_category: string
          p_description?: string
          p_due_date: string
          p_person?: string
          p_priority?: string
          p_task_id?: string
          p_title: string
        }
        Returns: Json
      }
      rpc_create_inspection: {
        Args: {
          p_area: string
          p_branch: string
          p_date: string
          p_general_notes?: string
        }
        Returns: Json
      }
      rpc_create_note: {
        Args: {
          p_body_md: string
          p_branch?: string
          p_decided_at?: string
          p_decision_impact?: string
          p_decision_reason?: string
          p_decision_status?: string
          p_kind?: string
          p_module?: string
          p_title?: string
          p_visibility?: string
        }
        Returns: Json
      }
      rpc_create_purchase_request: {
        Args: {
          p_branch: string
          p_currency?: string
          p_expected_delivery_date?: string
          p_notes?: string
          p_payment_method?: string
          p_priority?: string
          p_qty_ordered?: number
          p_reminder_date?: string
          p_requested_by?: string
          p_supplier_name: string
          p_supplier_website?: string
          p_title: string
          p_total_amount?: number
        }
        Returns: Json
      }
      rpc_create_recurring_task: {
        Args: {
          p_assigned_to?: string
          p_branch: string
          p_category: string
          p_description?: string
          p_priority?: string
          p_recurrence: string
          p_recurrence_dom?: number
          p_recurrence_dow?: number[]
          p_recurrence_month?: number
          p_recurrence_time: string
          p_title: string
        }
        Returns: Json
      }
      rpc_create_task: {
        Args: {
          p_assigned_to?: string
          p_branch: string
          p_category: string
          p_deadline_reminder_at?: string
          p_description?: string
          p_due_date?: string
          p_follow_up_reminder_at?: string
          p_priority?: string
          p_start_reminder_at?: string
          p_status?: string
          p_title: string
        }
        Returns: Json
      }
      rpc_delete_document_comment: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      rpc_delete_follow_up_comment: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      rpc_delete_inspection_comment: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      rpc_delete_purchase_comment: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      rpc_delete_task: { Args: { p_task_id: string }; Returns: Json }
      rpc_delete_task_comment: { Args: { p_comment_id: string }; Returns: Json }
      rpc_dismiss_reminder: { Args: { p_queue_id: number }; Returns: Json }
      rpc_documents_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      rpc_email_link_create: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_from_address: string
          p_from_name: string
          p_html_link: string
          p_internal_date: string
          p_message_id: string
          p_snippet: string
          p_subject: string
          p_thread_id: string
        }
        Returns: Json
      }
      rpc_email_link_remove: { Args: { p_link_id: number }; Returns: Json }
      rpc_email_links_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      rpc_get_company: { Args: { p_id: string }; Returns: Json }
      rpc_get_contact: { Args: { p_id: string }; Returns: Json }
      rpc_get_document: { Args: { p_doc_id: string }; Returns: Json }
      rpc_get_follow_up: { Args: { p_follow_up_id: string }; Returns: Json }
      rpc_get_inspection: { Args: { p_inspection_id: string }; Returns: Json }
      rpc_get_note: { Args: { p_id: string }; Returns: Json }
      rpc_get_purchase_request: { Args: { p_id: string }; Returns: Json }
      rpc_get_task: { Args: { p_task_id: string }; Returns: Json }
      rpc_get_user_dashboard: { Args: { p_user_id?: string }; Returns: Json }
      rpc_gmail_consume_state: { Args: { p_state: string }; Returns: Json }
      rpc_gmail_disconnect_self: { Args: never; Returns: Json }
      rpc_gmail_get_token: { Args: { p_user_id: string }; Returns: Json }
      rpc_gmail_link_status: { Args: never; Returns: Json }
      rpc_gmail_mark_disconnected: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      rpc_gmail_request_authorize: {
        Args: { p_redirect_to?: string }
        Returns: Json
      }
      rpc_gmail_store_tokens: {
        Args: {
          p_access_expires_at: string
          p_access_token: string
          p_account_id: string
          p_email: string
          p_refresh_token: string
          p_scope: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_gmail_update_access_token: {
        Args: {
          p_access_expires_at: string
          p_access_token: string
          p_user_id: string
        }
        Returns: undefined
      }
      rpc_link_document: {
        Args: { p_doc_id: string; p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      rpc_list_active_telegram_chats: { Args: never; Returns: Json }
      rpc_list_companies: {
        Args: {
          p_branch?: string
          p_category?: string
          p_include_inactive?: boolean
          p_limit?: number
          p_search?: string
        }
        Returns: Json
      }
      rpc_list_contacts: {
        Args: {
          p_branch?: string
          p_company_id?: string
          p_include_inactive?: boolean
          p_limit?: number
          p_search?: string
        }
        Returns: Json
      }
      rpc_list_critical_findings: { Args: { p_limit?: number }; Returns: Json }
      rpc_list_documents: {
        Args: {
          p_branch?: string
          p_category?: string
          p_limit?: number
          p_search?: string
          p_status?: string
          p_visibility?: string
        }
        Returns: Json
      }
      rpc_list_follow_ups: {
        Args: {
          p_assigned_to?: string
          p_branch?: string
          p_category?: string
          p_due_after?: string
          p_due_before?: string
          p_include_done?: boolean
          p_limit?: number
          p_search?: string
          p_status?: string
          p_task_id?: string
        }
        Returns: Json
      }
      rpc_list_inspections: {
        Args: {
          p_area?: string
          p_branch?: string
          p_date_after?: string
          p_date_before?: string
          p_inspected_by?: string
          p_limit?: number
          p_result?: string
          p_search?: string
        }
        Returns: Json
      }
      rpc_list_my_reminders: {
        Args: { p_limit?: number; p_unread_only?: boolean }
        Returns: Json
      }
      rpc_list_notes: {
        Args: {
          p_branch?: string
          p_include_archived?: boolean
          p_kind?: string
          p_limit?: number
          p_module?: string
          p_search?: string
          p_visibility?: string
        }
        Returns: Json
      }
      rpc_list_purchase_dashboard: { Args: { p_limit?: number }; Returns: Json }
      rpc_list_purchase_requests: {
        Args: {
          p_branch?: string
          p_date_after?: string
          p_date_before?: string
          p_include_done?: boolean
          p_limit?: number
          p_payment_status?: string
          p_priority?: string
          p_requested_by?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      rpc_list_tasks: {
        Args: {
          p_assigned_to?: string
          p_branch?: string
          p_due_after?: string
          p_due_before?: string
          p_include_archived?: boolean
          p_include_done?: boolean
          p_include_templates?: boolean
          p_limit?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      rpc_mark_delayed: {
        Args: { p_reason: string; p_task_id: string }
        Returns: Json
      }
      rpc_mark_follow_up_done: {
        Args: { p_follow_up_id: string; p_outcome?: string }
        Returns: Json
      }
      rpc_mark_telegram_reminder_failed: {
        Args: { p_error: string; p_queue_id: number }
        Returns: undefined
      }
      rpc_mark_telegram_reminder_sent: {
        Args: { p_provider_msg_id?: string; p_queue_id: number }
        Returns: undefined
      }
      rpc_mark_waiting: {
        Args: {
          p_label?: string
          p_note?: string
          p_task_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      rpc_process_whatsapp_command: {
        Args: { p_command: string; p_params?: Json; p_phone: string }
        Returns: string
      }
      rpc_record_delivery: {
        Args: {
          p_delivery_date?: string
          p_id: string
          p_qty_received: number
          p_status?: string
        }
        Returns: Json
      }
      rpc_record_link_external: {
        Args: {
          p_external_app: string
          p_external_label: string
          p_external_record_id: string
          p_external_record_type: string
          p_external_snapshot?: Json
          p_external_url: string
          p_from_id: string
          p_from_type: string
          p_relationship?: string
        }
        Returns: Json
      }
      rpc_record_link_internal: {
        Args: {
          p_from_id: string
          p_from_type: string
          p_relationship?: string
          p_to_id: string
          p_to_type: string
        }
        Returns: Json
      }
      rpc_record_link_remove: { Args: { p_link_id: number }; Returns: Json }
      rpc_record_payment: {
        Args: {
          p_amount_paid: number
          p_id: string
          p_payment_method?: string
          p_payment_status?: string
        }
        Returns: Json
      }
      rpc_record_relations: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_limit_per_source?: number
        }
        Returns: Json
      }
      rpc_remove_document_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_remove_follow_up_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_remove_inspection_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_remove_purchase_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_remove_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_request_repeat: {
        Args: { p_reason: string; p_task_id: string }
        Returns: Json
      }
      rpc_resolve_finding: {
        Args: { p_finding_id: string; p_resolution_note?: string }
        Returns: Json
      }
      rpc_resume_waiting: {
        Args: { p_note?: string; p_task_id: string }
        Returns: Json
      }
      rpc_revert_document: {
        Args: { p_doc_id: string; p_version_no: number }
        Returns: Json
      }
      rpc_set_company_branches: {
        Args: { p_branches: string[]; p_id: string }
        Returns: Json
      }
      rpc_set_contact_branches: {
        Args: { p_branches: string[]; p_id: string }
        Returns: Json
      }
      rpc_set_purchase_reminder: {
        Args: { p_id: string; p_reminder_date: string }
        Returns: Json
      }
      rpc_set_task_reminders: {
        Args: {
          p_clear?: boolean
          p_deadline_reminder_at?: string
          p_follow_up_reminder_at?: string
          p_start_reminder_at?: string
          p_task_id: string
        }
        Returns: Json
      }
      rpc_set_task_status: {
        Args: { p_status: string; p_task_id: string }
        Returns: Json
      }
      rpc_snooze_follow_up: {
        Args: {
          p_follow_up_id: string
          p_new_due_date: string
          p_reason?: string
        }
        Returns: Json
      }
      rpc_soft_delete_document: { Args: { p_doc_id: string }; Returns: Json }
      rpc_soft_delete_purchase_request: {
        Args: { p_id: string }
        Returns: Json
      }
      rpc_spawn_recurring_instance: {
        Args: { p_target_date?: string; p_template_id: string }
        Returns: Json
      }
      rpc_submit_purchase_request: { Args: { p_id: string }; Returns: Json }
      rpc_telegram_add_note: {
        Args: { p_body: string; p_chat_id: number; p_id_or_prefix: string }
        Returns: string
      }
      rpc_telegram_complete_link: {
        Args: {
          p_chat_id: number
          p_first_name?: string
          p_token: string
          p_username?: string
        }
        Returns: Json
      }
      rpc_telegram_complete_task: {
        Args: { p_chat_id: number; p_id_or_prefix: string; p_outcome?: string }
        Returns: string
      }
      rpc_telegram_create_task: {
        Args: {
          p_branch: string
          p_chat_id: number
          p_due_date?: string
          p_priority?: string
          p_title: string
        }
        Returns: string
      }
      rpc_telegram_daily_summary: {
        Args: { p_chat_id: number }
        Returns: string
      }
      rpc_telegram_link_status: { Args: never; Returns: Json }
      rpc_telegram_log: {
        Args: {
          p_chat_id: number
          p_direction?: string
          p_error?: string
          p_message_text?: string
          p_parsed_command?: string
          p_parsed_params?: Json
          p_response_text?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      rpc_telegram_overdue: { Args: { p_chat_id: number }; Returns: string }
      rpc_telegram_purchases: { Args: { p_chat_id: number }; Returns: string }
      rpc_telegram_request_link: { Args: never; Returns: Json }
      rpc_telegram_today: { Args: { p_chat_id: number }; Returns: string }
      rpc_telegram_unlink: { Args: { p_chat_id: number }; Returns: Json }
      rpc_telegram_unlink_self: { Args: never; Returns: Json }
      rpc_telegram_waiting: { Args: { p_chat_id: number }; Returns: string }
      rpc_unarchive_company: { Args: { p_id: string }; Returns: Json }
      rpc_unarchive_contact: { Args: { p_id: string }; Returns: Json }
      rpc_unarchive_document: { Args: { p_doc_id: string }; Returns: Json }
      rpc_unarchive_note: { Args: { p_id: string }; Returns: Json }
      rpc_unarchive_recurring_template: {
        Args: { p_template_id: string }
        Returns: Json
      }
      rpc_unlink_document: { Args: { p_link_id: number }; Returns: Json }
      rpc_update_company: {
        Args: { p_id: string; p_patches: Json }
        Returns: Json
      }
      rpc_update_contact: {
        Args: { p_id: string; p_patches: Json }
        Returns: Json
      }
      rpc_update_document: {
        Args: { p_change_note?: string; p_doc_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_finding: {
        Args: { p_finding_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_follow_up: {
        Args: { p_follow_up_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_inspection: {
        Args: { p_inspection_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_note: {
        Args: { p_id: string; p_patches: Json }
        Returns: Json
      }
      rpc_update_purchase_request: {
        Args: { p_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_recurring_template: {
        Args: { p_template_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_task: {
        Args: { p_task_id: string; p_updates: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

// =========================================================
// Convenience aliases — hand-maintained, safe to edit
// =========================================================
// Strict union types: Postgres CHECK constraints aren't reflected by
// `gen types`, so the generated rows widen these to `string`. Keep these
// unions in sync with the migrations and use them in forms/dropdowns.

export type Role = 'admin' | 'ceo' | 'manager' | 'viewer';

export type TaskStatus =
  | 'not_started'
  | 'started'
  | 'working'
  | 'waiting_for_someone'
  | 'delayed'
  | 'finished'
  | 'needs_repeat'
  | 'archived';
// Statuses callable through rpc_set_task_status (simple transitions).
// Special states (waiting/delayed/needs_repeat) require dedicated RPCs.
export type SimpleTaskStatus = Extract<
  TaskStatus,
  'not_started' | 'started' | 'working' | 'finished' | 'archived'
>;
export type RecurrenceCadence = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type TaskPriority = 'urgent' | 'normal' | 'low';
export type TaskCategory =
  | 'operations'
  | 'hr'
  | 'training'
  | 'maintenance'
  | 'social_media'
  | 'follow_up'
  | 'other';

// F1.1: widened to 7 values. 'snoozed' was migrated to 'postponed' at the
// DB level — same semantics, distinct kept only in the snoozed_until column.
export type FollowUpStatus =
  | 'pending'
  | 'working'
  | 'waiting'
  | 'no_answer'
  | 'postponed'
  | 'done'
  | 'cancelled';

// F1.1: append-only history log on follow_up_events. UI feed lands in F1.2.
export type FollowUpEventKind =
  | 'note'
  | 'status_change'
  | 'reminder_set'
  | 'reminder_cleared'
  | 'calendar_added'
  | 'calendar_removed'
  | 'invitee_added'
  | 'postponed'
  | 'snoozed';

export interface FollowUpEvent {
  id: number;
  follow_up_id: string;
  kind: FollowUpEventKind;
  from_status: FollowUpStatus | null;
  to_status: FollowUpStatus | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

// F1.2: rpc_get_follow_up joins events with users.full_name so the feed
// can render "Rabih marked it Done" without a second lookup. actor_name
// falls back to 'system' on the server side when the user row is missing
// (matches the audit list pattern).
export interface FollowUpEventWithActor extends FollowUpEvent {
  actor_name: string;
}
export type FollowUpCategory = 'call' | 'whatsapp' | 'email' | 'meeting' | 'check_in_person';

export type InspectionArea =
  | 'kitchen'
  | 'storage'
  | 'service_area'
  | 'cold_room'
  | 'dry_store'
  | 'staff_area'
  | 'full_branch';
export type InspectionResult = 'pending' | 'pass' | 'issues_found' | 'failed';
export type FindingSeverity = 'minor' | 'major' | 'critical';
export type FindingStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';

export type PurchaseStatus =
  | 'draft'
  | 'submitted'
  | 'ordered'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'mpesa'
  | 'card'
  | 'invoice'
  | 'other';
export type Currency = 'MZN' | 'USD' | 'LBP';

// Polymorphic entity_type literal — extend as new modules ship.
export type EntityType = 'task' | 'follow_up' | 'inspection' | 'purchase_request' | 'document';

// Documents (Phase E).
export type DocumentCategory =
  | 'sop'
  | 'policy'
  | 'checklist'
  | 'note'
  | 'reference'
  | 'personal';
export type DocumentVisibility = 'work' | 'personal';
export type DocumentStatus = 'draft' | 'active' | 'archived';
export type DocumentLinkEntityType =
  | 'task'
  | 'follow_up'
  | 'inspection'
  | 'purchase_request';

export type DocumentRow = Database['public']['Tables']['documents']['Row'];
export type DocumentVersionRow = Database['public']['Tables']['document_versions']['Row'];
export type DocumentLinkRow = Database['public']['Tables']['document_links']['Row'];

// Named row aliases — keep existing imports stable.
export type UserRow = Database['public']['Tables']['users']['Row'];
export type BranchRow = Database['public']['Tables']['branches']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type FollowUpRow = Database['public']['Tables']['follow_ups']['Row'];
export type InspectionRow = Database['public']['Tables']['inspections']['Row'];
export type InspectionFindingRow = Database['public']['Tables']['inspection_findings']['Row'];
export type PurchaseRequestRow = Database['public']['Tables']['purchase_requests']['Row'];
export type CommentRow = Database['public']['Tables']['comments']['Row'];
export type AttachmentRow = Database['public']['Tables']['attachments']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type WhatsappMessageRow = Database['public']['Tables']['whatsapp_messages']['Row'];

// Reminder engine (Phase B).
export type ReminderKind =
  | 'start_reminder'
  | 'follow_up_reminder'
  | 'deadline_reminder'
  | 'recurring_spawn'
  | 'followup_due';
export type ReminderChannel = 'in_app' | 'telegram' | 'email' | 'calendar';
export type ReminderStatus =
  | 'pending'
  | 'sent'
  | 'dismissed'
  | 'cancelled'
  | 'failed';
export type NotificationsQueueRow =
  Database['public']['Tables']['notifications_queue']['Row'];
export type NotificationLogRow =
  Database['public']['Tables']['notification_log']['Row'];

// Gmail / email_links (Phase F).
export type EmailLinkEntityType = 'task' | 'follow_up';
export type EmailLinkRow = Database['public']['Tables']['email_links']['Row'];
export type GoogleOAuthService = 'calendar' | 'gmail';

// Companies + Contacts (Phase H2.1).
export type CompanyRow  = Database['public']['Tables']['companies']['Row'];
export type ContactRow  = Database['public']['Tables']['contacts']['Row'];
export type CompanyBranchRow = Database['public']['Tables']['company_branches']['Row'];
export type ContactBranchRow = Database['public']['Tables']['contact_branches']['Row'];
export type CompanyCategory =
  | 'supplier' | 'contractor' | 'landlord' | 'government'
  | 'agency' | 'partner' | 'customer' | 'other';

// record_links (Phase H1).
export type RecordLinkRow = Database['public']['Tables']['record_links']['Row'];
export type RecordLinkEntityType =
  | 'task' | 'follow_up' | 'purchase_request' | 'inspection' | 'document';
export type RecordLinkExternalApp =
  | 'gmail' | 'calendar' | 'drive' | 'cater_co' | 'teamlink' | 'salt_reservation' | 'url';

// Notes (Phase H3.1).
export type NoteRow = Database['public']['Tables']['notes']['Row'];
export type NoteKind =
  | 'note' | 'decision' | 'meeting' | 'idea' | 'lesson' | 'incident';
export type NoteVisibility = 'work' | 'personal';
export type NoteModule =
  | 'general' | 'personal' | 'finance' | 'supplier' | 'maintenance' | 'hr'
  | 'operations' | 'marketing' | 'catering' | 'knowledge';
export type DecisionStatus =
  | 'proposed' | 'accepted' | 'rejected' | 'revisited' | 'superseded';
