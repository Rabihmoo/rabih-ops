import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import {
  listPurchaseRequests,
  getPurchaseRequest,
  listPurchaseDashboard,
  createPurchaseRequest,
  updatePurchaseRequest,
  submitPurchaseRequest,
  approvePurchaseRequest,
  recordDelivery,
  recordPayment,
  setPurchaseReminder,
  cancelPurchaseRequest,
  softDeletePurchaseRequest,
  addPurchaseComment,
  deletePurchaseComment,
  attachFileToPurchase,
  removePurchaseAttachment,
  type CreatePurchaseInput,
  type UpdatePurchaseInput,
  type ApprovePurchaseInput,
  type RecordDeliveryInput,
  type RecordPaymentInput,
  type AttachFileInput,
} from '@/lib/purchase-requests';
import {
  usePurchaseFiltersStore,
  purchaseFiltersToRpcParams,
} from '@/stores/purchaseFiltersStore';
import { useAuthStore } from '@/stores/authStore';
import type { PaymentStatus, PurchaseStatus } from '@/types/database';

const PURCHASES_KEY = ['purchases'] as const;
const DASHBOARD_KEY = ['purchases', 'dashboard'] as const;

export function usePurchaseList() {
  const filters = usePurchaseFiltersStore(
    useShallow((s) => ({
      bucket: s.bucket,
      branch: s.branch,
      status: s.status,
      priority: s.priority,
      paymentStatus: s.paymentStatus,
      search: s.search,
    })),
  );
  const userId = useAuthStore((s) => s.profile?.id);
  const params = purchaseFiltersToRpcParams(filters, userId);

  return useQuery({
    queryKey: [...PURCHASES_KEY, 'list', params, filters.bucket, userId],
    queryFn: async () => {
      const rows = await listPurchaseRequests(params);
      // Bucket presets that widen multiple statuses are filtered client-side.
      switch (filters.bucket) {
        case 'pending':
          return rows.filter(
            (r) => (r.status as PurchaseStatus) === 'draft' || (r.status as PurchaseStatus) === 'submitted',
          );
        case 'awaiting_delivery':
          return rows.filter(
            (r) =>
              (r.status as PurchaseStatus) === 'ordered' ||
              (r.status as PurchaseStatus) === 'partially_received',
          );
        case 'unpaid':
          return rows.filter(
            (r) =>
              (r.status as PurchaseStatus) !== 'cancelled' &&
              ((r.payment_status as PaymentStatus) === 'unpaid' ||
                (r.payment_status as PaymentStatus) === 'partial'),
          );
        case 'mine':
        case 'all':
        default:
          return rows;
      }
    },
  });
}

export function usePurchaseDetail(id: string | null) {
  return useQuery({
    queryKey: [...PURCHASES_KEY, 'detail', id],
    queryFn: () => getPurchaseRequest(id!),
    enabled: !!id,
  });
}

export function usePurchaseDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => listPurchaseDashboard(20),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: [...PURCHASES_KEY, 'list'] });
    qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    if (id) qc.invalidateQueries({ queryKey: [...PURCHASES_KEY, 'detail', id] });
  };
}

export function useCreatePurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) => createPurchaseRequest(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdatePurchaseInput }) =>
      updatePurchaseRequest(id, updates),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useSubmitPurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => submitPurchaseRequest(id),
    onSuccess: (_, id) => invalidate(id),
  });
}

export function useApprovePurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApprovePurchaseInput }) =>
      approvePurchaseRequest(id, input),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useRecordDelivery() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecordDeliveryInput }) =>
      recordDelivery(id, input),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecordPaymentInput }) =>
      recordPayment(id, input),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useSetPurchaseReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reminderDate }: { id: string; reminderDate: string | null }) =>
      setPurchaseReminder(id, reminderDate),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useCancelPurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      cancelPurchaseRequest(id, reason),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useSoftDeletePurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => softDeletePurchaseRequest(id),
    onSuccess: () => invalidate(),
  });
}

export function useAddPurchaseComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addPurchaseComment(id, body),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useDeletePurchaseComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      commentId,
      purchaseId,
    }: {
      commentId: string;
      purchaseId: string;
    }) => deletePurchaseComment(commentId).then((r) => ({ r, purchaseId })),
    onSuccess: ({ purchaseId }) => invalidate(purchaseId),
  });
}

export function useAttachFileToPurchase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttachFileInput) => attachFileToPurchase(input),
    onSuccess: (_, input) => invalidate(input.purchaseId),
  });
}

export function useRemovePurchaseAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      attachmentId,
      purchaseId,
    }: {
      attachmentId: string;
      purchaseId: string;
    }) =>
      removePurchaseAttachment(attachmentId).then((r) => ({ r, purchaseId })),
    onSuccess: ({ purchaseId }) => invalidate(purchaseId),
  });
}
