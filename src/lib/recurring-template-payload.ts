// Pure helpers for building create / update payloads for the recurring
// template RPCs. Extracted from RecurringTemplateForm so the cadence-
// dependent key inclusion can be vitested without React.
//
// Why this matters: rpc_update_recurring_template treats absent keys as
// "leave the column alone" and present keys as "apply this value". A
// JSON null value for recurrence_dow used to crash the RPC (the old
// branch called jsonb_array_elements_text on the JSON null and raised
// 22023). Hardening landed in migration 20260607, but keeping the wire
// clean is still the right default — only send keys that apply to the
// chosen cadence.

import type {
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
} from './recurring-templates';
import type {
  RecurrenceCadence,
  TaskCategory,
  TaskPriority,
} from '@/types/database';

export interface RecurringTemplateFormValues {
  title: string;
  description?: string | null;
  branch: string;
  category: TaskCategory;
  priority: TaskPriority;
  assignment: 'me' | 'unassigned';
  recurrence: RecurrenceCadence;
  recurrence_time: string;       // already padded to HH:MM:SS by the caller
  recurrence_dow?: number[] | null;
  recurrence_dom?: string | number | null;
  recurrence_month?: string | number | null;
}

function descriptionField(d?: string | null): string | null {
  if (d === null || d === undefined) return null;
  const trimmed = String(d);
  return trimmed.length > 0 ? trimmed : null;
}

function intOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the cadence-dependent recurrence sub-shape. Only includes
 * keys that the current cadence uses; the RPC's "absent key = leave
 * alone" semantics then handle the swap to a new cadence cleanly.
 *
 * Daily   → no extra keys
 * Weekly  → recurrence_dow only
 * Monthly → recurrence_dom only
 * Yearly  → recurrence_dom + recurrence_month
 */
export function cadenceFields(
  recurrence: RecurrenceCadence,
  values: Pick<
    RecurringTemplateFormValues,
    'recurrence_dow' | 'recurrence_dom' | 'recurrence_month'
  >,
): {
  recurrence_dow?: number[];
  recurrence_dom?: number;
  recurrence_month?: number;
} {
  if (recurrence === 'weekly') {
    return { recurrence_dow: values.recurrence_dow ?? [] };
  }
  if (recurrence === 'monthly') {
    const dom = intOrNull(values.recurrence_dom);
    return dom != null ? { recurrence_dom: dom } : {};
  }
  if (recurrence === 'yearly') {
    const dom = intOrNull(values.recurrence_dom);
    const month = intOrNull(values.recurrence_month);
    const out: { recurrence_dom?: number; recurrence_month?: number } = {};
    if (dom != null) out.recurrence_dom = dom;
    if (month != null) out.recurrence_month = month;
    return out;
  }
  return {}; // daily
}

export function buildCreatePayload(
  values: RecurringTemplateFormValues,
  currentUserId: string | null,
): CreateRecurringTemplateInput {
  const cadence = cadenceFields(values.recurrence, values);
  return {
    title:           values.title,
    description:     descriptionField(values.description),
    branch:          values.branch,
    category:        values.category,
    priority:        values.priority,
    assigned_to:     values.assignment === 'me' ? currentUserId : null,
    recurrence:      values.recurrence,
    recurrence_time: values.recurrence_time,
    // CreateRecurringTemplateInput accepts nulls; we explicitly null
    // the inapplicable ones at create time because the row is new and
    // the columns default to null anyway — same effect as omitting.
    recurrence_dow:   cadence.recurrence_dow ?? null,
    recurrence_dom:   cadence.recurrence_dom ?? null,
    recurrence_month: cadence.recurrence_month ?? null,
  };
}

export function buildUpdatePayload(
  values: RecurringTemplateFormValues,
  currentUserId: string | null,
): UpdateRecurringTemplateInput {
  // For UPDATE, only include cadence keys that apply. The RPC treats
  // absent keys as "leave the column alone"; that's the right semantic
  // here — the column may already be null and re-asserting null on
  // every save costs us nothing, but sending the wrong shape (JSON
  // null for recurrence_dow under the old RPC) used to crash.
  const cadence = cadenceFields(values.recurrence, values);
  const payload: UpdateRecurringTemplateInput = {
    title:           values.title,
    description:     descriptionField(values.description),
    branch:          values.branch,
    category:        values.category,
    priority:        values.priority,
    assigned_to:     values.assignment === 'me' ? currentUserId : null,
    recurrence:      values.recurrence,
    recurrence_time: values.recurrence_time,
  };
  if (cadence.recurrence_dow !== undefined) {
    payload.recurrence_dow = cadence.recurrence_dow;
  }
  if (cadence.recurrence_dom !== undefined) {
    payload.recurrence_dom = cadence.recurrence_dom;
  }
  if (cadence.recurrence_month !== undefined) {
    payload.recurrence_month = cadence.recurrence_month;
  }
  return payload;
}
