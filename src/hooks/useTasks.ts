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
  type CreateTaskInput,
  type UpdateTaskInput,
  type AttachFileInput,
} from '@/lib/tasks';
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
        if (filters.bucket === 'waiting') {
          if (t.created_by !== userId) return false;
          if (t.assigned_to === userId || t.assigned_to === null) return false;
        }
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
    mutationFn: ({ taskId, note }: { taskId: string; note?: string }) =>
      completeTask(taskId, note),
    onSuccess: (_, { taskId }) => invalidate(taskId),
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
