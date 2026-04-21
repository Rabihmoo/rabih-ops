// Hand-written types mirroring supabase/migrations. Replace with
// `supabase gen types typescript` output once DB is deployed.

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

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  branches: string[];
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchRow {
  code: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  branch: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
  completion_note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRow {
  id: string;
  title: string;
  person: string;
  branch: string | null;
  category: FollowUpCategory;
  due_date: string;
  priority: TaskPriority;
  status: FollowUpStatus;
  notes: string | null;
  outcome: string | null;
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionRow {
  id: string;
  branch: string;
  area: InspectionArea;
  inspection_date: string;
  result: InspectionResult;
  general_notes: string | null;
  inspected_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionFindingRow {
  id: string;
  inspection_id: string;
  severity: FindingSeverity;
  description: string;
  action_required: string | null;
  responsible: string | null;
  follow_up_date: string | null;
  status: FindingStatus;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  ip_address: string | null;
  source: 'web' | 'whatsapp' | 'api' | null;
  created_at: string;
}

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: TableDef<UserRow>;
      branches: TableDef<BranchRow>;
      tasks: TableDef<TaskRow>;
      follow_ups: TableDef<FollowUpRow>;
      inspections: TableDef<InspectionRow>;
      inspection_findings: TableDef<InspectionFindingRow>;
      audit_log: TableDef<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
