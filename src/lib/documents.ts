import { callRpc } from './rpc';
import type {
  AttachmentRow,
  CommentRow,
  DocumentCategory,
  DocumentLinkEntityType,
  DocumentRow,
  DocumentStatus,
  DocumentVisibility,
} from '@/types/database';

// =========================================================
// Read RPCs
// =========================================================

export interface DocumentListFilters {
  category?: DocumentCategory | null;
  branch?: string | null;
  status?: DocumentStatus | null;
  visibility?: DocumentVisibility | null;
  search?: string | null;
  limit?: number;
}

// rpc_list_documents returns the row plus a `snippet` field when search is
// active. We narrow the type so callers can read it.
export interface DocumentListItem extends DocumentRow {
  snippet?: string | null;
}

export async function listDocuments(
  filters: DocumentListFilters = {},
): Promise<DocumentListItem[]> {
  const result = await callRpc<DocumentListItem[] | null>('rpc_list_documents', {
    p_category: filters.category ?? null,
    p_branch: filters.branch ?? null,
    p_status: filters.status ?? null,
    p_visibility: filters.visibility ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export interface DocumentVersionSummary {
  id: number;
  version_no: number;
  title: string;
  category: DocumentCategory;
  branch: string | null;
  status: DocumentStatus;
  visibility: DocumentVisibility;
  change_note: string | null;
  created_at: string;
  changed_by_name: string;
}

export interface DocumentLinkOut {
  id: number;
  entity_type: DocumentLinkEntityType;
  entity_id: string;
  entity_title: string | null;
  created_at: string;
}

export interface DocumentCommentOut extends CommentRow {
  author_name: string;
}
export interface DocumentAttachmentOut extends AttachmentRow {
  uploader_name: string;
}
export interface DocumentAuditOut {
  id: number;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string;
}

export interface DocumentDetailPayload {
  document: DocumentRow;
  versions: DocumentVersionSummary[];
  links: DocumentLinkOut[];
  comments: DocumentCommentOut[];
  attachments: DocumentAttachmentOut[];
  audit: DocumentAuditOut[];
}

export async function getDocument(docId: string): Promise<DocumentDetailPayload> {
  return callRpc<DocumentDetailPayload>('rpc_get_document', { p_doc_id: docId });
}

// =========================================================
// Write RPCs
// =========================================================

export interface CreateDocumentInput {
  title: string;
  category: DocumentCategory;
  visibility?: DocumentVisibility;
  branch?: string | null;
  body_md?: string | null;
  status?: DocumentStatus;
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_create_document', {
    p_title: input.title,
    p_category: input.category,
    p_visibility: input.visibility ?? 'work',
    p_branch: input.branch ?? null,
    p_body_md: input.body_md ?? null,
    p_status: input.status ?? 'draft',
  });
}

export interface UpdateDocumentInput {
  title?: string;
  category?: DocumentCategory;
  branch?: string | null;
  status?: DocumentStatus;
  visibility?: DocumentVisibility;
  body_md?: string | null;
}

export async function updateDocument(
  docId: string,
  updates: UpdateDocumentInput,
  changeNote?: string | null,
): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_update_document', {
    p_doc_id: docId,
    p_updates: updates,
    p_change_note: changeNote ?? null,
  });
}

export async function archiveDocument(docId: string): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_archive_document', { p_doc_id: docId });
}

export async function unarchiveDocument(docId: string): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_unarchive_document', { p_doc_id: docId });
}

export async function softDeleteDocument(docId: string): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_soft_delete_document', { p_doc_id: docId });
}

export async function revertDocument(
  docId: string,
  versionNo: number,
): Promise<DocumentRow> {
  return callRpc<DocumentRow>('rpc_revert_document', {
    p_doc_id: docId,
    p_version_no: versionNo,
  });
}

// =========================================================
// Linking
// =========================================================

export async function linkDocument(
  docId: string,
  entityType: DocumentLinkEntityType,
  entityId: string,
): Promise<{ id: number }> {
  return callRpc<{ id: number }>('rpc_link_document', {
    p_doc_id: docId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
}

export async function unlinkDocument(linkId: number): Promise<{ success: boolean }> {
  return callRpc<{ success: boolean }>('rpc_unlink_document', { p_link_id: linkId });
}

export interface DocumentForEntity {
  link_id: number;
  document_id: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  visibility: DocumentVisibility;
  updated_at: string;
}

export async function listDocumentsForEntity(
  entityType: DocumentLinkEntityType,
  entityId: string,
): Promise<DocumentForEntity[]> {
  return callRpc<DocumentForEntity[]>('rpc_documents_for_entity', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
}

// =========================================================
// Comments / attachments — document-scoped
// =========================================================

export async function addDocumentComment(docId: string, body: string): Promise<CommentRow> {
  return callRpc<CommentRow>('rpc_add_document_comment', { p_doc_id: docId, p_body: body });
}

export async function deleteDocumentComment(
  commentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_document_comment', {
    p_comment_id: commentId,
  });
}

export interface AttachDocumentFileInput {
  docId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}
export async function attachFileToDocument(
  input: AttachDocumentFileInput,
): Promise<AttachmentRow> {
  return callRpc<AttachmentRow>('rpc_attach_file_to_document', {
    p_doc_id: input.docId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_file_size: input.fileSize,
  });
}

export async function removeDocumentAttachment(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_remove_document_attachment', {
    p_attachment_id: attachmentId,
  });
}

// =========================================================
// Display helpers
// =========================================================

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  sop: 'SOP',
  policy: 'Policy',
  checklist: 'Checklist',
  note: 'Note',
  reference: 'Reference',
  personal: 'Personal',
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};
