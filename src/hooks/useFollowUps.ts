import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import {
  listFollowUps,
  getFollowUp,
  createFollowUp,
  updateFollowUp,
  markFollowUpDone,
  snoozeFollowUp,
  addFollowUpComment,
  deleteFollowUpComment,
  attachFileToFollowUp,
  removeFollowUpAttachment,
  setFollowUpStatus,
  addFollowUpEvent,
  setFollowUpReminder,
  type CreateFollowUpInput,
  type UpdateFollowUpInput,
  type AttachFileToFollowUpInput,
  type FollowUpListFilters,
} from '@/lib/follow-ups';
import type {
  FollowUpEventKind,
  FollowUpStatus,
} from '@/types/database';
import {
  useFollowUpFiltersStore,
  followUpFiltersToRpcParams,
} from '@/stores/followUpFiltersStore';
import { useAuthStore } from '@/stores/authStore';

const FOLLOW_UPS_KEY = ['follow-ups'] as const;

export function useFollowUpList(extraFilters?: Partial<FollowUpListFilters>) {
  const filters = useFollowUpFiltersStore(
    useShallow((s) => ({
      bucket: s.bucket,
      branch: s.branch,
      status: s.status,
      category: s.category,
      priority: s.priority,
      assignedTo: s.assignedTo,
      search: s.search,
    })),
  );
  const userId = useAuthStore((s) => s.profile?.id);
  const params = { ...followUpFiltersToRpcParams(filters, userId), ...extraFilters };

  return useQuery({
    queryKey: [...FOLLOW_UPS_KEY, 'list', params, filters.priority, userId],
    queryFn: async () => {
      const rows = await listFollowUps(params);
      if (filters.priority) {
        return rows.filter((r) => r.priority === filters.priority);
      }
      return rows;
    },
  });
}

export function useFollowUpsForTask(taskId: string | null) {
  return useQuery({
    queryKey: [...FOLLOW_UPS_KEY, 'for-task', taskId],
    queryFn: () => listFollowUps({ taskId: taskId!, includeDone: true }),
    enabled: !!taskId,
  });
}

export function useFollowUpDetail(id: string | null) {
  return useQuery({
    queryKey: [...FOLLOW_UPS_KEY, 'detail', id],
    queryFn: () => getFollowUp(id!),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: [...FOLLOW_UPS_KEY, 'list'] });
    qc.invalidateQueries({ queryKey: [...FOLLOW_UPS_KEY, 'for-task'] });
    if (id) qc.invalidateQueries({ queryKey: [...FOLLOW_UPS_KEY, 'detail', id] });
  };
}

export function useCreateFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) => createFollowUp(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateFollowUpInput }) =>
      updateFollowUp(id, updates),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useMarkFollowUpDone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome?: string }) =>
      markFollowUpDone(id, outcome),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useSnoozeFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      newDueDate,
      reason,
    }: {
      id: string;
      newDueDate: string;
      reason?: string;
    }) => snoozeFollowUp(id, newDueDate, reason),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useAddFollowUpComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => addFollowUpComment(id, body),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useDeleteFollowUpComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ commentId, followUpId }: { commentId: string; followUpId: string }) =>
      deleteFollowUpComment(commentId).then((r) => ({ r, followUpId })),
    onSuccess: ({ followUpId }) => invalidate(followUpId),
  });
}

export function useAttachFileToFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttachFileToFollowUpInput) => attachFileToFollowUp(input),
    onSuccess: (_, input) => invalidate(input.followUpId),
  });
}

// F1.3: quick-action menu wrappers. Both invalidate the detail query so
// the History feed re-renders within one tick after the mutation lands.

export function useSetFollowUpStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; status: FollowUpStatus; note?: string | null }) =>
      setFollowUpStatus({
        followUpId: input.id,
        status:     input.status,
        note:       input.note ?? null,
      }),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useAddFollowUpEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      id: string;
      kind: FollowUpEventKind;
      body?: string | null;
      payload?: Record<string, unknown> | null;
    }) =>
      addFollowUpEvent({
        followUpId: input.id,
        kind:       input.kind,
        body:       input.body ?? null,
        payload:    input.payload ?? null,
      }),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

// F1.4: set or clear the reminder_at on a follow-up. The RPC cancels
// any pending notifications_queue rows, sets reminder_at, enqueues one
// row per channel, and writes the matching reminder_set/reminder_cleared
// follow_up_events row. Passing reminderAt=null clears.
export function useSetFollowUpReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      id: string;
      reminderAt: string | null;
      channels?: string[];
    }) =>
      setFollowUpReminder({
        followUpId: input.id,
        reminderAt: input.reminderAt,
        channels:   input.channels,
      }),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useRemoveFollowUpAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      attachmentId,
      followUpId,
    }: {
      attachmentId: string;
      followUpId: string;
    }) => removeFollowUpAttachment(attachmentId).then((r) => ({ r, followUpId })),
    onSuccess: ({ followUpId }) => invalidate(followUpId),
  });
}
