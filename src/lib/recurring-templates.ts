import { callRpc } from './rpc';
import { listTasks } from './tasks';
import type {
  RecurrenceCadence,
  TaskCategory,
  TaskPriority,
  TaskRow,
} from '@/types/database';

// =========================================================
// Read
// =========================================================

export async function listRecurringTemplates(): Promise<TaskRow[]> {
  const rows = await listTasks({
    includeTemplates: true,
    includeArchived: true,
    includeDone: true,
    limit: 200,
  });
  return rows.filter((t) => t.is_template === true);
}

export async function getRecurringTemplate(id: string): Promise<TaskRow | null> {
  const rows = await listTasks({
    includeTemplates: true,
    includeArchived: true,
    includeDone: true,
    limit: 500,
  });
  return rows.find((t) => t.id === id && t.is_template === true) ?? null;
}

// =========================================================
// Write
// =========================================================

export interface CreateRecurringTemplateInput {
  branch: string;
  category: TaskCategory;
  title: string;
  recurrence: RecurrenceCadence;
  recurrence_time: string; // "HH:MM" or "HH:MM:SS"
  priority?: TaskPriority;
  assigned_to?: string | null;
  description?: string | null;
  recurrence_dow?: number[] | null;
  recurrence_dom?: number | null;
  recurrence_month?: number | null;
}

export async function createRecurringTemplate(
  input: CreateRecurringTemplateInput,
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

export interface UpdateRecurringTemplateInput {
  title?: string;
  description?: string | null;
  branch?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  assigned_to?: string | null;
  recurrence?: RecurrenceCadence;
  recurrence_time?: string;
  recurrence_dow?: number[] | null;
  recurrence_dom?: number | null;
  recurrence_month?: number | null;
}

export async function updateRecurringTemplate(
  id: string,
  updates: UpdateRecurringTemplateInput,
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_update_recurring_template', {
    p_template_id: id,
    p_updates: updates,
  });
}

export async function archiveRecurringTemplate(
  id: string,
  reason?: string | null,
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_archive_recurring_template', {
    p_template_id: id,
    p_reason: reason ?? null,
  });
}

export async function unarchiveRecurringTemplate(id: string): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_unarchive_recurring_template', {
    p_template_id: id,
  });
}

export async function spawnInstanceNow(
  templateId: string,
  targetDate?: string | null,
): Promise<TaskRow> {
  return callRpc<TaskRow>('rpc_spawn_recurring_instance', {
    p_template_id: templateId,
    p_target_date: targetDate ?? null,
  });
}

// =========================================================
// Display helpers
// =========================================================

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABEL = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Postgres "time" comes back as "HH:MM:SS". Trim seconds for display.
export function displayTime(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.substring(0, 5) : t;
}

export function cadenceLabel(t: TaskRow): string {
  if (!t.recurrence) return '—';
  const time = displayTime(t.recurrence_time);
  switch (t.recurrence as RecurrenceCadence) {
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly': {
      const dows = (t.recurrence_dow ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DOW_LABEL[d] ?? d.toString())
        .join(', ');
      return `Weekly on ${dows} at ${time}`;
    }
    case 'monthly':
      return `Monthly on day ${t.recurrence_dom} at ${time}`;
    case 'yearly':
      return `Yearly on ${
        MONTH_LABEL[(t.recurrence_month ?? 1) - 1] ?? '?'
      } ${t.recurrence_dom} at ${time}`;
    default:
      return t.recurrence;
  }
}

export function nextSpawnLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  const minutes = Math.round(ms / 60000);
  if (minutes < 0) return 'Pending (cron will fire shortly)';
  if (minutes < 60) return `In ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `In ${days}d (${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
