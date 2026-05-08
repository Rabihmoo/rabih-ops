import { callRpc } from './rpc';
import type {
  FollowUpRow,
  CommentRow,
  AttachmentRow,
  FollowUpStatus,
  FollowUpCategory,
  TaskPriority,
} from '@/types/database';

// =========================================================
// Read RPCs
// =========================================================

export interface FollowUpListFilters {
  branch?: string | null;
  status?: FollowUpStatus | null;
  category?: FollowUpCategory | null;
  assignedTo?: string | null;
  dueBefore?: string | null;
  dueAfter?: string | null;
  taskId?: string | null;
  search?: string | null;
  includeDone?: boolean;
  limit?: number;
}

export async function listFollowUps(filters: FollowUpListFilters = {}): Promise<FollowUpRow[]> {
  const result = await callRpc<FollowUpRow[] | null>('rpc_list_follow_ups', {
    p_branch: filters.branch ?? null,
    p_status: filters.status ?? null,
    p_category: filters.category ?? null,
    p_assigned_to: filters.assignedTo ?? null,
    p_due_before: filters.dueBefore ?? null,
    p_due_after: filters.dueAfter ?? null,
    p_task_id: filters.taskId ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_include_done: filters.includeDone ?? false,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export interface FollowUpAuditEntry {
  id: number;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string;
}

export interface CommentWithAuthor extends CommentRow {
  author_name: string;
}

export interface AttachmentWithUploader extends AttachmentRow {
  uploader_name: string;
}

export interface FollowUpDetailPayload {
  follow_up: FollowUpRow;
  comments: CommentWithAuthor[];
  attachments: AttachmentWithUploader[];
  audit: FollowUpAuditEntry[];
}

export async function getFollowUp(id: string): Promise<FollowUpDetailPayload> {
  return callRpc<FollowUpDetailPayload>('rpc_get_follow_up', { p_follow_up_id: id });
}

// =========================================================
// Write RPCs
// =========================================================

export interface CreateFollowUpInput {
  category: FollowUpCategory;
  title: string;
  due_date: string;
  branch?: string | null;
  priority?: TaskPriority;
  description?: string | null;
  person?: string | null;
  assigned_to?: string | null;
  task_id?: string | null;
}

export async function createFollowUp(input: CreateFollowUpInput): Promise<FollowUpRow> {
  return callRpc<FollowUpRow>('rpc_create_follow_up', {
    p_category: input.category,
    p_title: input.title,
    p_due_date: input.due_date,
    p_branch: input.branch ?? null,
    p_priority: input.priority ?? 'normal',
    p_description: input.description ?? null,
    p_person: input.person ?? null,
    p_assigned_to: input.assigned_to ?? null,
    p_task_id: input.task_id ?? null,
  });
}

export interface UpdateFollowUpInput {
  title?: string;
  description?: string | null;
  person?: string | null;
  branch?: string | null;
  category?: FollowUpCategory;
  priority?: TaskPriority;
  status?: FollowUpStatus;
  due_date?: string | null;
  snoozed_until?: string | null;
  assigned_to?: string | null;
  task_id?: string | null;
  outcome?: string | null;
}

export async function updateFollowUp(
  id: string,
  updates: UpdateFollowUpInput,
): Promise<FollowUpRow> {
  return callRpc<FollowUpRow>('rpc_update_follow_up', {
    p_follow_up_id: id,
    p_updates: updates,
  });
}

export async function markFollowUpDone(id: string, outcome?: string): Promise<FollowUpRow> {
  return callRpc<FollowUpRow>('rpc_mark_follow_up_done', {
    p_follow_up_id: id,
    p_outcome: outcome ?? null,
  });
}

export async function snoozeFollowUp(
  id: string,
  newDueDate: string,
  reason?: string,
): Promise<FollowUpRow> {
  return callRpc<FollowUpRow>('rpc_snooze_follow_up', {
    p_follow_up_id: id,
    p_new_due_date: newDueDate,
    p_reason: reason ?? null,
  });
}

export async function addFollowUpComment(id: string, body: string): Promise<CommentRow> {
  return callRpc<CommentRow>('rpc_add_follow_up_comment', {
    p_follow_up_id: id,
    p_body: body,
  });
}

export async function deleteFollowUpComment(
  commentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_follow_up_comment', {
    p_comment_id: commentId,
  });
}

export interface AttachFileToFollowUpInput {
  followUpId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export async function attachFileToFollowUp(
  input: AttachFileToFollowUpInput,
): Promise<AttachmentRow> {
  return callRpc<AttachmentRow>('rpc_attach_file_to_follow_up', {
    p_follow_up_id: input.followUpId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_file_size: input.fileSize,
  });
}

export async function removeFollowUpAttachment(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_remove_follow_up_attachment', {
    p_attachment_id: attachmentId,
  });
}

// Effective due date for sorting/filtering. snoozed_until takes precedence
// when set; otherwise due_date.
export function effectiveDueDate(row: FollowUpRow): string {
  return row.snoozed_until ?? row.due_date;
}
