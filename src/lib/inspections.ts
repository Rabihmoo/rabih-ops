import { callRpc } from './rpc';
import type {
  InspectionRow,
  InspectionFindingRow,
  CommentRow,
  AttachmentRow,
  InspectionArea,
  InspectionResult,
  FindingSeverity,
  FindingStatus,
} from '@/types/database';

// =========================================================
// Read RPCs
// =========================================================

export interface InspectionListFilters {
  branch?: string | null;
  result?: InspectionResult | null;
  area?: InspectionArea | null;
  inspectedBy?: string | null;
  dateBefore?: string | null;
  dateAfter?: string | null;
  search?: string | null;
  limit?: number;
}

export interface InspectionListItem extends InspectionRow {
  inspector_name: string;
  open_critical_count: number;
  open_finding_count: number;
}

export async function listInspections(
  filters: InspectionListFilters = {},
): Promise<InspectionListItem[]> {
  const result = await callRpc<InspectionListItem[] | null>('rpc_list_inspections', {
    p_branch: filters.branch ?? null,
    p_result: filters.result ?? null,
    p_area: filters.area ?? null,
    p_inspected_by: filters.inspectedBy ?? null,
    p_date_before: filters.dateBefore ?? null,
    p_date_after: filters.dateAfter ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export interface InspectionAuditEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
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

export interface InspectionDetailPayload {
  inspection: InspectionRow & { inspector_name: string };
  findings: InspectionFindingRow[];
  comments: CommentWithAuthor[];
  attachments: AttachmentWithUploader[];
  audit: InspectionAuditEntry[];
}

export async function getInspection(id: string): Promise<InspectionDetailPayload> {
  return callRpc<InspectionDetailPayload>('rpc_get_inspection', { p_inspection_id: id });
}

export interface CriticalFinding {
  id: string;
  inspection_id: string;
  severity: FindingSeverity;
  description: string;
  action_required: string | null;
  responsible: string | null;
  follow_up_date: string | null;
  status: FindingStatus;
  created_at: string;
  inspection_branch: string;
  inspection_area: string;
  inspection_date: string;
}

export async function listCriticalFindings(limit = 20): Promise<CriticalFinding[]> {
  const result = await callRpc<CriticalFinding[] | null>('rpc_list_critical_findings', {
    p_limit: limit,
  });
  return result ?? [];
}

// =========================================================
// Write RPCs
// =========================================================

export interface CreateInspectionInput {
  branch: string;
  area: InspectionArea;
  date: string;
  general_notes?: string | null;
}

export async function createInspection(
  input: CreateInspectionInput,
): Promise<InspectionRow> {
  return callRpc<InspectionRow>('rpc_create_inspection', {
    p_branch: input.branch,
    p_area: input.area,
    p_date: input.date,
    p_general_notes: input.general_notes ?? null,
  });
}

export interface UpdateInspectionInput {
  branch?: string;
  area?: InspectionArea;
  inspection_date?: string;
  general_notes?: string | null;
  result?: InspectionResult;
}

export async function updateInspection(
  id: string,
  updates: UpdateInspectionInput,
): Promise<InspectionRow> {
  return callRpc<InspectionRow>('rpc_update_inspection', {
    p_inspection_id: id,
    p_updates: updates,
  });
}

export async function completeInspection(
  id: string,
  result: InspectionResult,
): Promise<InspectionRow> {
  return callRpc<InspectionRow>('rpc_complete_inspection', {
    p_inspection_id: id,
    p_result: result,
  });
}

export interface AddFindingInput {
  inspectionId: string;
  severity: FindingSeverity;
  description: string;
  action_required?: string | null;
  responsible?: string | null;
  follow_up_date?: string | null;
}

export async function addFinding(input: AddFindingInput): Promise<InspectionFindingRow> {
  return callRpc<InspectionFindingRow>('rpc_add_inspection_finding', {
    p_inspection_id: input.inspectionId,
    p_severity: input.severity,
    p_description: input.description,
    p_action_required: input.action_required ?? null,
    p_responsible: input.responsible ?? null,
    p_follow_up_date: input.follow_up_date ?? null,
  });
}

export interface UpdateFindingInput {
  severity?: FindingSeverity;
  description?: string;
  action_required?: string | null;
  responsible?: string | null;
  follow_up_date?: string | null;
  status?: FindingStatus;
}

export async function updateFinding(
  id: string,
  updates: UpdateFindingInput,
): Promise<InspectionFindingRow> {
  return callRpc<InspectionFindingRow>('rpc_update_finding', {
    p_finding_id: id,
    p_updates: updates,
  });
}

export async function resolveFinding(
  id: string,
  resolutionNote?: string,
): Promise<InspectionFindingRow> {
  return callRpc<InspectionFindingRow>('rpc_resolve_finding', {
    p_finding_id: id,
    p_resolution_note: resolutionNote ?? null,
  });
}

export async function addInspectionComment(
  id: string,
  body: string,
): Promise<CommentRow> {
  return callRpc<CommentRow>('rpc_add_inspection_comment', {
    p_inspection_id: id,
    p_body: body,
  });
}

export async function deleteInspectionComment(
  commentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_inspection_comment', {
    p_comment_id: commentId,
  });
}

export interface AttachFileInput {
  inspectionId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export async function attachFileToInspection(
  input: AttachFileInput,
): Promise<AttachmentRow> {
  return callRpc<AttachmentRow>('rpc_attach_file_to_inspection', {
    p_inspection_id: input.inspectionId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_file_size: input.fileSize,
  });
}

export async function removeInspectionAttachment(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_remove_inspection_attachment', {
    p_attachment_id: attachmentId,
  });
}
