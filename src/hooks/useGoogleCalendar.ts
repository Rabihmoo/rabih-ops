import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
  getCalendarLinkStatus,
  listCalendarDismissals,
  listCalendarLinksForEntity,
  listCalendarLinksForUser,
  listGoogleCalendarToday,
  requestCalendarAuthorize,
  type CreateCalendarEventInput,
} from '@/lib/google-calendar';
import {
  listGoogleCalendarEvents,
  type CalendarListResult,
} from '@/lib/calendar-list-edge';

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

// C2: /calendar page queries. Three hooks that feed the page's six
// filter chips. Recurring's `useGoogleCalendarList(..., 'masters', ...)`
// is fired lazily via the `enabled` flag so the masters Google call
// only happens when the operator actually selects Recurring.
export function useGoogleCalendarList(
  from: string,
  to: string,
  mode: 'instances' | 'masters',
  enabled: boolean,
) {
  return useQuery<CalendarListResult>({
    queryKey: [...KEY, 'list', { from, to, mode }],
    queryFn: () => listGoogleCalendarEvents({ from, to, mode }),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCalendarLinksForUser(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'links-for-user', { from, to }],
    queryFn: () => listCalendarLinksForUser(from, to),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCalendarDismissals(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'dismissals'],
    queryFn: () => listCalendarDismissals(),
    enabled,
    staleTime: 60 * 1000,
  });
}
