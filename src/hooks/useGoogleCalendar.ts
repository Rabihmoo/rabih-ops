import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectCalendar,
  getCalendarLinkStatus,
  listCalendarLinksForEntity,
  requestCalendarAuthorize,
} from '@/lib/google-calendar';

const KEY = ['google-calendar'] as const;

export function useCalendarLinkStatus() {
  return useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: () => getCalendarLinkStatus(),
  });
}

export function useRequestCalendarAuthorize() {
  return useMutation({
    mutationFn: (redirectTo: string = '/settings') =>
      requestCalendarAuthorize(redirectTo),
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectCalendar(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'status'] });
    },
  });
}

export function useCalendarLinksForTask(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'links', 'task', taskId],
    queryFn: () => listCalendarLinksForEntity('task', taskId!),
    enabled: !!taskId,
  });
}
