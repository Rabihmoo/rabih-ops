import { callRpc } from './rpc';

// =========================================================
// Types (mirrors the H2.3 + H3.3 widened whitelists)
// =========================================================

export type RecordLinkEntityType =
  | 'task'
  | 'follow_up'
  | 'purchase_request'
  | 'inspection'
  | 'document'
  | 'company'
  | 'contact'
  | 'note';

export type RecordLinkExternalApp =
  | 'gmail'
  | 'calendar'
  | 'drive'
  | 'cater_co'
  | 'teamlink'
  | 'salt_reservation'
  | 'url';

export type RecordLinkRelationship =
  | 'relates_to'
  | 'follow_up_for'
  | 'caused_by'
  | 'blocks'
  | 'resolves'
  | 'email_for'
  | 'document_for'
  | 'supplier_for'
  | 'contractor_for'
  | 'staff_for'
  | 'decision_for'
  | 'calendar_for'
  | 'note_for'
  | 'attachment_for';

// Row shape returned by rpc_record_link_internal / _external / _remove.
// Generated TS types would land here once `supabase gen types` runs; until
// then we keep the hand-written shape narrow.
export interface RecordLinkRow {
  id: number;
  from_entity_type: RecordLinkEntityType;
  from_entity_id: string;
  to_entity_type: RecordLinkEntityType | null;
  to_entity_id: string | null;
  external_app: RecordLinkExternalApp | null;
  external_record_type: string | null;
  external_record_id: string | null;
  external_url: string | null;
  external_label: string | null;
  external_snapshot: Record<string, unknown>;
  relationship: RecordLinkRelationship;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
}

// =========================================================
// Write RPCs
// =========================================================

export interface LinkInternalInput {
  fromType: RecordLinkEntityType;
  fromId: string;
  toType: RecordLinkEntityType;
  toId: string;
  relationship?: RecordLinkRelationship;
}

// Idempotent on (from, to, relationship). Returns the existing row when
// re-linking. Requires _can_mutate AND _can_access_entity on BOTH ends.
export async function linkRecordInternal(
  input: LinkInternalInput,
): Promise<RecordLinkRow> {
  return callRpc<RecordLinkRow>('rpc_record_link_internal', {
    p_from_type: input.fromType,
    p_from_id: input.fromId,
    p_to_type: input.toType,
    p_to_id: input.toId,
    p_relationship: input.relationship ?? 'relates_to',
  });
}

export interface LinkExternalInput {
  fromType: RecordLinkEntityType;
  fromId: string;
  externalApp: RecordLinkExternalApp;
  externalRecordType: string | null;
  externalRecordId: string;
  externalUrl?: string | null;
  externalLabel?: string | null;
  externalSnapshot?: Record<string, unknown>;
  relationship?: RecordLinkRelationship;
}

// Idempotent on (from, external_app, external_record_id, relationship).
export async function linkRecordExternal(
  input: LinkExternalInput,
): Promise<RecordLinkRow> {
  return callRpc<RecordLinkRow>('rpc_record_link_external', {
    p_from_type: input.fromType,
    p_from_id: input.fromId,
    p_external_app: input.externalApp,
    p_external_record_type: input.externalRecordType,
    p_external_record_id: input.externalRecordId,
    p_external_url: input.externalUrl ?? null,
    p_external_label: input.externalLabel ?? null,
    p_external_snapshot: input.externalSnapshot ?? {},
    p_relationship: input.relationship ?? 'relates_to',
  });
}

// Soft-deletes the link. Caller must own the link OR be admin/CEO,
// AND must still have access to both endpoints (privacy re-check).
export async function unlinkRecord(linkId: number): Promise<RecordLinkRow> {
  return callRpc<RecordLinkRow>('rpc_record_link_remove', {
    p_link_id: linkId,
  });
}
