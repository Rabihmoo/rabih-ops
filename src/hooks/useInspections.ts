import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import {
  listInspections,
  getInspection,
  listCriticalFindings,
  createInspection,
  updateInspection,
  completeInspection,
  addFinding,
  updateFinding,
  resolveFinding,
  addInspectionComment,
  deleteInspectionComment,
  attachFileToInspection,
  removeInspectionAttachment,
  type CreateInspectionInput,
  type UpdateInspectionInput,
  type AddFindingInput,
  type UpdateFindingInput,
  type AttachFileInput,
} from '@/lib/inspections';
import {
  useInspectionFiltersStore,
  inspectionFiltersToRpcParams,
} from '@/stores/inspectionFiltersStore';
import { useAuthStore } from '@/stores/authStore';
import type { InspectionResult } from '@/types/database';

const INSPECTIONS_KEY = ['inspections'] as const;
const CRITICAL_KEY = ['inspections', 'critical-findings'] as const;

export function useInspectionList() {
  const filters = useInspectionFiltersStore(
    useShallow((s) => ({
      bucket: s.bucket,
      branch: s.branch,
      result: s.result,
      area: s.area,
      search: s.search,
    })),
  );
  const userId = useAuthStore((s) => s.profile?.id);
  const params = inspectionFiltersToRpcParams(filters, userId);

  return useQuery({
    queryKey: [...INSPECTIONS_KEY, 'list', params, filters.bucket, userId],
    queryFn: async () => {
      const rows = await listInspections(params);
      if (filters.bucket === 'failed') {
        return rows.filter(
          (r) => r.result === 'issues_found' || r.result === 'failed',
        );
      }
      return rows;
    },
  });
}

export function useInspectionDetail(id: string | null) {
  return useQuery({
    queryKey: [...INSPECTIONS_KEY, 'detail', id],
    queryFn: () => getInspection(id!),
    enabled: !!id,
  });
}

export function useCriticalFindings() {
  return useQuery({
    queryKey: CRITICAL_KEY,
    queryFn: () => listCriticalFindings(20),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: [...INSPECTIONS_KEY, 'list'] });
    qc.invalidateQueries({ queryKey: CRITICAL_KEY });
    if (id) qc.invalidateQueries({ queryKey: [...INSPECTIONS_KEY, 'detail', id] });
  };
}

export function useCreateInspection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateInspectionInput) => createInspection(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateInspection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateInspectionInput }) =>
      updateInspection(id, updates),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useCompleteInspection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, result }: { id: string; result: InspectionResult }) =>
      completeInspection(id, result),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useAddFinding() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AddFindingInput) => addFinding(input),
    onSuccess: (_, input) => invalidate(input.inspectionId),
  });
}

export function useUpdateFinding() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      updates,
      inspectionId,
    }: {
      id: string;
      updates: UpdateFindingInput;
      inspectionId: string;
    }) => updateFinding(id, updates).then((r) => ({ r, inspectionId })),
    onSuccess: ({ inspectionId }) => invalidate(inspectionId),
  });
}

export function useResolveFinding() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      resolutionNote,
      inspectionId,
    }: {
      id: string;
      resolutionNote?: string;
      inspectionId: string;
    }) =>
      resolveFinding(id, resolutionNote).then((r) => ({ r, inspectionId })),
    onSuccess: ({ inspectionId }) => invalidate(inspectionId),
  });
}

export function useAddInspectionComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addInspectionComment(id, body),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useDeleteInspectionComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      commentId,
      inspectionId,
    }: {
      commentId: string;
      inspectionId: string;
    }) =>
      deleteInspectionComment(commentId).then((r) => ({ r, inspectionId })),
    onSuccess: ({ inspectionId }) => invalidate(inspectionId),
  });
}

export function useAttachFileToInspection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttachFileInput) => attachFileToInspection(input),
    onSuccess: (_, input) => invalidate(input.inspectionId),
  });
}

export function useRemoveInspectionAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      attachmentId,
      inspectionId,
    }: {
      attachmentId: string;
      inspectionId: string;
    }) =>
      removeInspectionAttachment(attachmentId).then((r) => ({ r, inspectionId })),
    onSuccess: ({ inspectionId }) => invalidate(inspectionId),
  });
}
