import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveRecurringTemplate,
  createRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  spawnInstanceNow,
  unarchiveRecurringTemplate,
  updateRecurringTemplate,
  type CreateRecurringTemplateInput,
  type UpdateRecurringTemplateInput,
} from '@/lib/recurring-templates';

const KEY = ['recurring-templates'] as const;

export function useRecurringTemplates() {
  return useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => listRecurringTemplates(),
  });
}

export function useRecurringTemplate(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => getRecurringTemplate(id!),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY] });
    // Spawning creates a regular task instance that'll show in /tasks lists.
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}

export function useCreateRecurringTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateRecurringTemplateInput) =>
      createRecurringTemplate(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRecurringTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateRecurringTemplateInput;
    }) => updateRecurringTemplate(id, updates),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveRecurringTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      archiveRecurringTemplate(id, reason),
    onSuccess: () => invalidate(),
  });
}

export function useUnarchiveRecurringTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unarchiveRecurringTemplate(id),
    onSuccess: () => invalidate(),
  });
}

export function useSpawnInstanceNow() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      templateId,
      targetDate,
    }: {
      templateId: string;
      targetDate?: string | null;
    }) => spawnInstanceNow(templateId, targetDate),
    onSuccess: () => invalidate(),
  });
}
