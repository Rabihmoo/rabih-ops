import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dismissReminder, listMyReminders } from '@/lib/reminders';

const REMINDERS_KEY = ['reminders'] as const;

export function useMyReminders(args: { unreadOnly?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: [...REMINDERS_KEY, 'list', args.unreadOnly ?? true, args.limit ?? 50],
    queryFn: () => listMyReminders(args),
  });
}

export function useDismissReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queueId: number) => dismissReminder(queueId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...REMINDERS_KEY, 'list'] });
    },
  });
}
