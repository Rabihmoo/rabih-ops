import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDocumentComment,
  archiveDocument,
  attachFileToDocument,
  createDocument,
  deleteDocumentComment,
  getDocument,
  linkDocument,
  listDocuments,
  listDocumentsForEntity,
  removeDocumentAttachment,
  revertDocument,
  softDeleteDocument,
  unarchiveDocument,
  unlinkDocument,
  updateDocument,
  type AttachDocumentFileInput,
  type CreateDocumentInput,
  type DocumentListFilters,
  type UpdateDocumentInput,
} from '@/lib/documents';
import type { DocumentLinkEntityType } from '@/types/database';

const KEY = ['documents'] as const;

export function useDocuments(filters: DocumentListFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: () => listDocuments(filters),
  });
}

export function useDocument(docId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', docId],
    queryFn: () => getDocument(docId!),
    enabled: !!docId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (docId?: string) => {
    qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    if (docId) qc.invalidateQueries({ queryKey: [...KEY, 'detail', docId] });
  };
}

export function useCreateDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => createDocument(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      docId,
      updates,
      changeNote,
    }: {
      docId: string;
      updates: UpdateDocumentInput;
      changeNote?: string | null;
    }) => updateDocument(docId, updates, changeNote),
    onSuccess: (_, { docId }) => invalidate(docId),
  });
}

export function useArchiveDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => archiveDocument(docId),
    onSuccess: (_, docId) => invalidate(docId),
  });
}

export function useUnarchiveDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => unarchiveDocument(docId),
    onSuccess: (_, docId) => invalidate(docId),
  });
}

export function useSoftDeleteDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => softDeleteDocument(docId),
    onSuccess: () => invalidate(),
  });
}

export function useRevertDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ docId, versionNo }: { docId: string; versionNo: number }) =>
      revertDocument(docId, versionNo),
    onSuccess: (_, { docId }) => invalidate(docId),
  });
}

// =========================================================
// Linking
// =========================================================

export function useLinkDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      entityType,
      entityId,
    }: {
      docId: string;
      entityType: DocumentLinkEntityType;
      entityId: string;
    }) => linkDocument(docId, entityType, entityId),
    onSuccess: (_, { docId, entityType, entityId }) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'detail', docId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'forEntity', entityType, entityId] });
    },
  });
}

export function useUnlinkDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => unlinkDocument(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'detail'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'forEntity'] });
    },
  });
}

export function useDocumentsForEntity(
  entityType: DocumentLinkEntityType | null,
  entityId: string | null,
) {
  return useQuery({
    queryKey: [...KEY, 'forEntity', entityType, entityId],
    queryFn: () => listDocumentsForEntity(entityType!, entityId!),
    enabled: !!entityType && !!entityId,
  });
}

// =========================================================
// Comments / attachments
// =========================================================

export function useAddDocumentComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ docId, body }: { docId: string; body: string }) =>
      addDocumentComment(docId, body),
    onSuccess: (_, { docId }) => invalidate(docId),
  });
}

export function useDeleteDocumentComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      commentId,
      docId,
    }: {
      commentId: string;
      docId: string;
    }) => deleteDocumentComment(commentId).then((r) => ({ r, docId })),
    onSuccess: ({ docId }) => invalidate(docId),
  });
}

export function useAttachFileToDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttachDocumentFileInput) => attachFileToDocument(input),
    onSuccess: (_, input) => invalidate(input.docId),
  });
}

export function useRemoveDocumentAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      attachmentId,
      docId,
    }: {
      attachmentId: string;
      docId: string;
    }) => removeDocumentAttachment(attachmentId).then((r) => ({ r, docId })),
    onSuccess: ({ docId }) => invalidate(docId),
  });
}
