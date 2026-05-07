import { callRpc } from './rpc';
import type {
  TaskRow,
  TaskCommentRow,
  TaskAttachmentRow,
  TaskStatus,
  TaskPriority,
  TaskCategory,
} from '@/types/database';

// =========================================================
// Read RPCs
// =========================================================

export interface TaskListFilters {
  branch?: string | null;
  status?: TaskStatus | null;
  assignedTo?: string | null;
  dueBefore?: string | null; // ISO date (YYYY-MM-DD)
  dueAfter?: string | null;
  search?: string | null;
  includeDone?: boolean;
  limit?: number;
}

export async function listTasks(filters: TaskListFilters = {}): Promise<TaskRow[]> {
  const result = await callRpc<TaskRow[] | null>('rpc_list_tasks', {
    p_branch: filters.branch ?? null,
    p_status: filters.status ?? null,
    p_assigned_to: filters.assignedTo ?? null,
    p_due_before: filters.dueBefore ?? null,
    p_due_after: filters.dueAfter ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_include_done: filters.includeDone ?? false,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export interface TaskAuditEntry {
  id: number;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string;
}

export interface TaskCommentWithAuthor extends TaskCommentRow {
  author_name: string;
}

export interface TaskAttachmentWithUploader extends TaskAttachmentRow {
  uploader_name: string;
}

export interface TaskDetailPayload {
  task: TaskRow;
  comments: TaskCommentWithAuthor[];
  attachments: TaskAttachmentWithUploader[];
  audit: TaskAuditEntry[];
}

export async function getTask(taskId: string): Promise<TaskDetailPayload> {
  return callRpc<TaskDetailPayload>('rpc_get_task', { p_task_id: taskId });
}

// =========================================================
// Write RPCs
// =========================================================

export interface CreateTaskInput {
  branch: string;
  category: TaskCategory;
  title: string;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  description?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_create_task', {
    p_branch: input.branch,
    p_category: input.category,
    p_title: input.title,
    p_priority: input.priority ?? 'normal',
    p_due_date: input.due_date ?? null,
    p_assigned_to: input.assigned_to ?? null,
    p_description: input.description ?? null,
  });
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  branch?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  assigned_to?: string | null;
}

export async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_update_task', {
    p_task_id: taskId,
    p_updates: updates,
  });
}

export async function completeTask(taskId: string, completionNote?: string): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_complete_task', {
    p_task_id: taskId,
    p_completion_note: completionNote ?? null,
  });
}

export async function deleteTask(taskId: string): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_task', { p_task_id: taskId });
}

export async function addTaskComment(taskId: string, body: string): Promise<TaskCommentRow> {
  return callRpc<TaskCommentRow>('rpc_add_task_comment', { p_task_id: taskId, p_body: body });
}

export async function deleteTaskComment(commentId: string): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_task_comment', {
    p_comment_id: commentId,
  });
}

export interface AttachFileInput {
  taskId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export async function attachFileToTask(input: AttachFileInput): Promise<TaskAttachmentRow> {
  return callRpc<TaskAttachmentRow>('rpc_attach_file_to_task', {
    p_task_id: input.taskId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_file_size: input.fileSize,
  });
}

export async function removeTaskAttachment(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_remove_task_attachment', {
    p_attachment_id: attachmentId,
  });
}
