import { callRpc } from './rpc';
import type {
  TaskRow,
  CommentRow,
  AttachmentRow,
  TaskStatus,
  SimpleTaskStatus,
  TaskPriority,
  TaskCategory,
  RecurrenceCadence,
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
  includeArchived?: boolean;
  includeTemplates?: boolean;
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
    p_include_archived: filters.includeArchived ?? false,
    p_include_templates: filters.includeTemplates ?? false,
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

export interface TaskCommentWithAuthor extends CommentRow {
  author_name: string;
}

export interface TaskAttachmentWithUploader extends AttachmentRow {
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
// Write RPCs — create / update / complete
// =========================================================

export interface CreateTaskInput {
  branch: string;
  category: TaskCategory;
  title: string;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  description?: string | null;
  status?: SimpleTaskStatus;
  start_reminder_at?: string | null;
  follow_up_reminder_at?: string | null;
  deadline_reminder_at?: string | null;
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
    p_status: input.status ?? 'not_started',
    p_start_reminder_at: input.start_reminder_at ?? null,
    p_follow_up_reminder_at: input.follow_up_reminder_at ?? null,
    p_deadline_reminder_at: input.deadline_reminder_at ?? null,
  });
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  branch?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  start_reminder_at?: string | null;
  follow_up_reminder_at?: string | null;
  deadline_reminder_at?: string | null;
}

export async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_update_task', {
    p_task_id: taskId,
    p_updates: updates,
  });
}

export async function completeTask(
  taskId: string,
  args: { completionNote?: string | null; outcome?: string | null } = {},
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_complete_task', {
    p_task_id: taskId,
    p_completion_note: args.completionNote ?? null,
    p_outcome: args.outcome ?? null,
  });
}

// =========================================================
// Lifecycle RPCs
// =========================================================

export async function setTaskStatus(taskId: string, status: SimpleTaskStatus): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_set_task_status', {
    p_task_id: taskId,
    p_status: status,
  });
}

export async function markTaskWaiting(args: {
  taskId: string;
  userId?: string | null;
  label?: string | null;
  note?: string | null;
}): Promise<TaskRow> {
  if (!args.userId && !(args.label && args.label.trim())) {
    throw new Error('Either a user or a label is required to mark a task waiting.');
  }
  return callRpc<TaskRow>('rpc_mark_waiting', {
    p_task_id: args.taskId,
    p_user_id: args.userId ?? null,
    p_label: args.label ?? null,
    p_note: args.note ?? null,
  });
}

export async function resumeWaitingTask(taskId: string, note?: string | null): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_resume_waiting', {
    p_task_id: taskId,
    p_note: note ?? null,
  });
}

export async function markTaskDelayed(taskId: string, reason: string): Promise<TaskRow> {
  if (!reason || !reason.trim()) {
    throw new Error('A delay reason is required.');
  }
  return callRpc<TaskRow>('rpc_mark_delayed', {
    p_task_id: taskId,
    p_reason: reason,
  });
}

export async function requestTaskRepeat(taskId: string, reason: string): Promise<TaskRow> {
  if (!reason || !reason.trim()) {
    throw new Error('A repeat reason is required.');
  }
  return callRpc<TaskRow>('rpc_request_repeat', {
    p_task_id: taskId,
    p_reason: reason,
  });
}

export async function archiveTask(taskId: string, reason?: string | null): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_archive_task', {
    p_task_id: taskId,
    p_reason: reason ?? null,
  });
}

export interface SetTaskRemindersInput {
  taskId: string;
  startReminderAt?: string | null;
  followUpReminderAt?: string | null;
  deadlineReminderAt?: string | null;
  clear?: boolean;
}

export async function setTaskReminders(input: SetTaskRemindersInput): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_set_task_reminders', {
    p_task_id: input.taskId,
    p_start_reminder_at: input.startReminderAt ?? null,
    p_follow_up_reminder_at: input.followUpReminderAt ?? null,
    p_deadline_reminder_at: input.deadlineReminderAt ?? null,
    p_clear: input.clear ?? false,
  });
}

// =========================================================
// Recurring templates
// =========================================================

export interface CreateRecurringTaskInput {
  branch: string;
  category: TaskCategory;
  title: string;
  recurrence: RecurrenceCadence;
  recurrence_time: string; // 'HH:MM' or 'HH:MM:SS' — Africa/Maputo
  priority?: TaskPriority;
  assigned_to?: string | null;
  description?: string | null;
  recurrence_dow?: number[] | null;
  recurrence_dom?: number | null;
  recurrence_month?: number | null;
}

export async function createRecurringTask(
  input: CreateRecurringTaskInput,
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_create_recurring_task', {
    p_branch: input.branch,
    p_category: input.category,
    p_title: input.title,
    p_recurrence: input.recurrence,
    p_recurrence_time: input.recurrence_time,
    p_priority: input.priority ?? 'normal',
    p_assigned_to: input.assigned_to ?? null,
    p_description: input.description ?? null,
    p_recurrence_dow: input.recurrence_dow ?? null,
    p_recurrence_dom: input.recurrence_dom ?? null,
    p_recurrence_month: input.recurrence_month ?? null,
  });
}

export async function spawnRecurringInstance(
  templateId: string,
  targetDate?: string | null,
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_spawn_recurring_instance', {
    p_template_id: templateId,
    p_target_date: targetDate ?? null,
  });
}

// =========================================================
// Other (unchanged)
// =========================================================

export async function deleteTask(taskId: string): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_task', { p_task_id: taskId });
}

export async function addTaskComment(taskId: string, body: string): Promise<CommentRow> {
  return callRpc<CommentRow>('rpc_add_task_comment', { p_task_id: taskId, p_body: body });
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

export async function attachFileToTask(input: AttachFileInput): Promise<AttachmentRow> {
  return callRpc<AttachmentRow>('rpc_attach_file_to_task', {
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

// =========================================================
// Status display helpers (used in UI)
// =========================================================

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  started: 'Started',
  working: 'Working',
  waiting_for_someone: 'Waiting',
  delayed: 'Delayed',
  finished: 'Finished',
  needs_repeat: 'Needs repeat',
  archived: 'Archived',
};

// "Active" = on the operational radar; excludes finished + archived.
export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status !== 'finished' && status !== 'archived';
}

export function isClosedTaskStatus(status: TaskStatus): boolean {
  return status === 'finished' || status === 'archived';
}
