import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  addTaskComment,
  deleteTaskComment,
  attachFileToTask,
  removeTaskAttachment,
  setTaskStatus,
  markTaskWaiting,
  resumeWaitingTask,
  markTaskDelayed,
  requestTaskRepeat,
  archiveTask,
  setTaskReminders,
  createRecurringTask,
  spawnRecurringInstance,
  type CreateTaskInput,
  type UpdateTaskInput,
  type AttachFileInput,
  type CreateRecurringTaskInput,
  type SetTaskRemindersInput,
} from '@/lib/tasks';
import type { SimpleTaskStatus } from '@/types/database';
import { useTaskFiltersStore, filtersToRpcParams } from '@/stores/taskFiltersStore';
import { useAuthStore } from '@/stores/authStore';

const TASKS_KEY = ['tasks'] as const;

export function useTaskList() {
  const filters = useTaskFiltersStore(
    useShallow((s) => ({
      bucket: s.bucket,
      branch: s.branch,
      status: s.status,
      priority: s.priority,
      assignedTo: s.assignedTo,
      search: s.search,
    })),
  );
  const userId = useAuthStore((s) => s.profile?.id);
  const params = filtersToRpcParams(filters, userId);

  return useQuery({
    queryKey: [...TASKS_KEY, 'list', params, filters.bucket, filters.priority, userId],
    queryFn: async () => {
      const rows = await listTasks(params);
      const filtered = rows.filter((t) => {
        if (filters.priority && t.priority !== filters.priority) return false;
        return true;
      });
      return filtered;
    },
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: [...TASKS_KEY, 'detail', taskId],
    queryFn: () => getTask(taskId!),
    enabled: !!taskId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (taskId?: string) => {
    qc.invalidateQueries({ queryKey: [...TASKS_KEY, 'list'] });
    if (taskId) qc.invalidateQueries({ queryKey: [...TASKS_KEY, 'detail', taskId] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: UpdateTaskInput }) =>
      updateTask(taskId, updates),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      taskId,
      completionNote,
      outcome,
    }: {
      taskId: string;
      completionNote?: string | null;
      outcome?: string | null;
    }) => completeTask(taskId, { completionNote, outcome }),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useSetTaskStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: SimpleTaskStatus }) =>
      setTaskStatus(taskId, status),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useMarkTaskWaiting() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: {
      taskId: string;
      userId?: string | null;
      label?: string | null;
      note?: string | null;
    }) => markTaskWaiting(args),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useResumeWaitingTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, note }: { taskId: string; note?: string | null }) =>
      resumeWaitingTask(taskId, note),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useMarkTaskDelayed() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      markTaskDelayed(taskId, reason),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useRequestTaskRepeat() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      requestTaskRepeat(taskId, reason),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useArchiveTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason?: string | null }) =>
      archiveTask(taskId, reason),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useSetTaskReminders() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SetTaskRemindersInput) => setTaskReminders(input),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useCreateRecurringTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateRecurringTaskInput) => createRecurringTask(input),
    onSuccess: () => invalidate(),
  });
}

export function useSpawnRecurringInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      templateId,
      targetDate,
    }: {
      templateId: string;
      targetDate?: string | null;
    }) => spawnRecurringInstance(templateId, targetDate),
    onSuccess: (_, { templateId }) => invalidate(templateId),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => invalidate(),
  });
}

export function useAddTaskComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) =>
      addTaskComment(taskId, body),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  });
}

export function useDeleteTaskComment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ commentId, taskId }: { commentId: string; taskId: string }) =>
      deleteTaskComment(commentId).then((r) => ({ r, taskId })),
    onSuccess: ({ taskId }) => invalidate(taskId),
  });
}

export function useAttachFileToTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttachFileInput) => attachFileToTask(input),
    onSuccess: (_, input) => invalidate(input.taskId),
  });
}

export function useRemoveTaskAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ attachmentId, taskId }: { attachmentId: string; taskId: string }) =>
      removeTaskAttachment(attachmentId).then((r) => ({ r, taskId })),
    onSuccess: ({ taskId }) => invalidate(taskId),
  });
}
