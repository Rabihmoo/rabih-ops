import { callRpc } from './rpc';
import type {
  DecisionStatus,
  NoteKind,
  NoteModule,
  NoteRow,
  NoteVisibility,
} from '@/types/database';

// =========================================================
// Read RPCs (H3.1)
// =========================================================

export interface NoteListFilters {
  kind?: NoteKind | null;
  module?: NoteModule | null;
  visibility?: NoteVisibility | null;
  branch?: string | null;
  search?: string | null;
  includeArchived?: boolean;
  limit?: number;
}

export async function listNotes(filters: NoteListFilters = {}): Promise<NoteRow[]> {
  const result = await callRpc<NoteRow[] | null>('rpc_list_notes', {
    p_kind: filters.kind ?? null,
    p_module: filters.module ?? null,
    p_visibility: filters.visibility ?? null,
    p_branch: filters.branch ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_include_archived: filters.includeArchived ?? false,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export async function getNote(noteId: string): Promise<NoteRow | null> {
  return callRpc<NoteRow | null>('rpc_get_note', { p_id: noteId });
}

// =========================================================
// Write RPCs
// =========================================================

export interface CreateNoteInput {
  body_md: string;
  title?: string | null;
  kind?: NoteKind;
  module?: NoteModule;
  visibility?: NoteVisibility;
  branch?: string | null;
  decision_reason?: string | null;
  decision_impact?: string | null;
  decided_at?: string | null;
  decision_status?: DecisionStatus | null;
}

export async function createNote(input: CreateNoteInput): Promise<NoteRow> {
  return callRpc<NoteRow>('rpc_create_note', {
    p_body_md: input.body_md,
    p_title: input.title ?? null,
    p_kind: input.kind ?? 'note',
    p_module: input.module ?? 'general',
    p_visibility: input.visibility ?? 'work',
    p_branch: input.branch ?? null,
    p_decision_reason: input.decision_reason ?? null,
    p_decision_impact: input.decision_impact ?? null,
    p_decided_at: input.decided_at ?? null,
    p_decision_status: input.decision_status ?? null,
  });
}

// Patches mirror the JSONB merge the RPC performs. Only included keys are
// applied. Pass null for a key to clear (e.g. branch: null).
export interface UpdateNotePatches {
  title?: string | null;
  body_md?: string;
  kind?: NoteKind;
  module?: NoteModule;
  visibility?: NoteVisibility;
  branch?: string | null;
  decision_reason?: string | null;
  decision_impact?: string | null;
  decided_at?: string | null;
  decision_status?: DecisionStatus | null;
}

export async function updateNote(
  noteId: string,
  patches: UpdateNotePatches,
): Promise<NoteRow> {
  return callRpc<NoteRow>('rpc_update_note', {
    p_id: noteId,
    p_patches: patches,
  });
}

export async function archiveNote(noteId: string): Promise<NoteRow> {
  return callRpc<NoteRow>('rpc_archive_note', { p_id: noteId });
}

export async function unarchiveNote(noteId: string): Promise<NoteRow> {
  return callRpc<NoteRow>('rpc_unarchive_note', { p_id: noteId });
}

// =========================================================
// Display helpers
// =========================================================

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: 'Note',
  decision: 'Decision',
  meeting: 'Meeting',
  idea: 'Idea',
  lesson: 'Lesson',
  incident: 'Incident',
};

export const NOTE_KIND_ORDER: NoteKind[] = [
  'note',
  'decision',
  'meeting',
  'idea',
  'lesson',
  'incident',
];

export const NOTE_MODULE_LABEL: Record<NoteModule, string> = {
  general: 'General',
  personal: 'Personal',
  finance: 'Finance',
  supplier: 'Supplier',
  maintenance: 'Maintenance',
  hr: 'HR',
  operations: 'Operations',
  marketing: 'Marketing',
  catering: 'Catering',
  knowledge: 'Knowledge',
};

export const NOTE_MODULE_ORDER: NoteModule[] = [
  'general',
  'operations',
  'finance',
  'hr',
  'supplier',
  'maintenance',
  'marketing',
  'catering',
  'knowledge',
  'personal',
];

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  revisited: 'Revisited',
  superseded: 'Superseded',
};

export const DECISION_STATUS_ORDER: DecisionStatus[] = [
  'proposed',
  'accepted',
  'rejected',
  'revisited',
  'superseded',
];

// Strict-visibility predicate mirrored from the DB. Used by the UI to render
// a "personal" affordance and is independent of the RPC's own enforcement.
export function isPersonal(note: Pick<NoteRow, 'visibility'>): boolean {
  return note.visibility === 'personal';
}

export function isArchived(note: Pick<NoteRow, 'archived_at'>): boolean {
  return note.archived_at !== null;
}
