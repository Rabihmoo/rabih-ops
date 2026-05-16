import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
  getCalendarLinkStatus,
  listCalendarLinksForEntity,
  listGoogleCalendarToday,
  requestCalendarAuthorize,
  type CreateCalendarEventInput,
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

// F1.5: mirror of useCalendarLinksForTask for follow-ups. Same RPC,
// same query key shape, distinct entity_type so the cache slots stay
// separate.
export function useCalendarLinksForFollowUp(followUpId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'links', 'follow_up', followUpId],
    queryFn: () => listCalendarLinksForEntity('follow_up', followUpId!),
    enabled: !!followUpId,
  });
}

export function useGoogleCalendarToday(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'today'],
    queryFn: () => listGoogleCalendarToday(),
    enabled,
    // Calendar events change less often than tasks. 5-min cache is plenty.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCalendarEventInput) => createCalendarEvent(input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'links', input.entity_type, input.entity_id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'today'] });
    },
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => deleteCalendarEvent(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'links'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'today'] });
    },
  });
}
