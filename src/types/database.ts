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
          due_date: string
          id: string
          notes: string | null
          outcome: string | null
          person: string
          priority: string
          status: string
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
          due_date: string
          id?: string
          notes?: string | null
          outcome?: string | null
          person: string
          priority?: string
          status?: string
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
          due_date?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          person?: string
          priority?: string
          status?: string
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
      tasks: {
        Row: {
          assigned_to: string | null
          branch: string
          category: string
          completed_at: string | null
          completion_note: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch: string
          category: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch?: string
          category?: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
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
      _can_mutate: { Args: never; Returns: boolean }
      _delete_comment: { Args: { p_comment_id: string }; Returns: Json }
      _remove_attachment: { Args: { p_attachment_id: string }; Returns: Json }
      _require_auth: { Args: never; Returns: string }
      _require_branch_access: { Args: { p_branch: string }; Returns: undefined }
      current_user_can_access_branch: {
        Args: { p_branch: string }
        Returns: boolean
      }
      current_user_role: { Args: never; Returns: string }
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
      rpc_add_task_comment: {
        Args: { p_body: string; p_task_id: string }
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
      rpc_complete_inspection: {
        Args: { p_inspection_id: string; p_result: string }
        Returns: Json
      }
      rpc_complete_task: {
        Args: { p_completion_note?: string; p_task_id: string }
        Returns: Json
      }
      rpc_create_follow_up: {
        Args: {
          p_branch: string
          p_category: string
          p_due_date: string
          p_notes?: string
          p_person: string
          p_priority?: string
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
      rpc_create_task: {
        Args: {
          p_assigned_to?: string
          p_branch: string
          p_category: string
          p_description?: string
          p_due_date?: string
          p_priority?: string
          p_title: string
        }
        Returns: Json
      }
      rpc_delete_task: { Args: { p_task_id: string }; Returns: Json }
      rpc_delete_task_comment: { Args: { p_comment_id: string }; Returns: Json }
      rpc_get_task: { Args: { p_task_id: string }; Returns: Json }
      rpc_get_user_dashboard: { Args: { p_user_id?: string }; Returns: Json }
      rpc_list_tasks: {
        Args: {
          p_assigned_to?: string
          p_branch?: string
          p_due_after?: string
          p_due_before?: string
          p_include_done?: boolean
          p_limit?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      rpc_mark_follow_up_done: {
        Args: { p_follow_up_id: string; p_outcome?: string }
        Returns: Json
      }
      rpc_process_whatsapp_command: {
        Args: { p_command: string; p_params?: Json; p_phone: string }
        Returns: string
      }
      rpc_remove_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      rpc_resolve_finding: {
        Args: { p_finding_id: string; p_resolution_note?: string }
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

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
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

// Polymorphic entity_type literal — extend as new modules ship.
export type EntityType = 'task' | 'follow_up' | 'inspection';

// Named row aliases — keep existing imports stable.
export type UserRow = Database['public']['Tables']['users']['Row'];
export type BranchRow = Database['public']['Tables']['branches']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type FollowUpRow = Database['public']['Tables']['follow_ups']['Row'];
export type InspectionRow = Database['public']['Tables']['inspections']['Row'];
export type InspectionFindingRow = Database['public']['Tables']['inspection_findings']['Row'];
export type CommentRow = Database['public']['Tables']['comments']['Row'];
export type AttachmentRow = Database['public']['Tables']['attachments']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type WhatsappMessageRow = Database['public']['Tables']['whatsapp_messages']['Row'];
