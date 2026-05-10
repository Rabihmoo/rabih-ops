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
      _remove_attachment: { Args: { p_attachment_id: string }; Returns: Json }
      _require_auth: { Args: never; Returns: string }
      _require_branch_access: { Args: { p_branch: string }; Returns: undefined }
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
      current_user_can_access_branch: {
        Args: { p_branch: string }
        Returns: boolean
      }
      current_user_role: { Args: never; Returns: string }
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
      rpc_archive_recurring_template: {
        Args: { p_reason?: string; p_template_id: string }
        Returns: Json
      }
      rpc_archive_task: {
        Args: { p_reason?: string; p_task_id: string }
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
      rpc_cancel_purchase_request: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_cancel_reminder: {
        Args: { p_queue_id: number; p_reason?: string }
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
      rpc_get_follow_up: { Args: { p_follow_up_id: string }; Returns: Json }
      rpc_get_inspection: { Args: { p_inspection_id: string }; Returns: Json }
      rpc_get_purchase_request: { Args: { p_id: string }; Returns: Json }
      rpc_get_task: { Args: { p_task_id: string }; Returns: Json }
      rpc_get_user_dashboard: { Args: { p_user_id?: string }; Returns: Json }
      rpc_list_critical_findings: { Args: { p_limit?: number }; Returns: Json }
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
      rpc_record_payment: {
        Args: {
          p_amount_paid: number
          p_id: string
          p_payment_method?: string
          p_payment_status?: string
        }
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
      rpc_soft_delete_purchase_request: {
        Args: { p_id: string }
        Returns: Json
      }
      rpc_spawn_recurring_instance: {
        Args: { p_target_date?: string; p_template_id: string }
        Returns: Json
      }
      rpc_submit_purchase_request: { Args: { p_id: string }; Returns: Json }
      rpc_unarchive_recurring_template: {
        Args: { p_template_id: string }
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

export type FollowUpStatus = 'pending' | 'done' | 'snoozed' | 'cancelled';
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
export type EntityType = 'task' | 'follow_up' | 'inspection' | 'purchase_request';

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
