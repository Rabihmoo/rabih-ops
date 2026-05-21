import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelMyPendingReminder,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ListNotificationsOptions,
} from '@/lib/notifications';

const KEY = ['notifications'] as const;

// Notification rows can carry entity-snapshot payload — same privacy
// posture as Gmail metadata: keep it out of localStorage so a logout
// or device handoff doesn't leak the last read state. meta.persist
// filter lives in main.tsx.
const NO_PERSIST = { meta: { persist: false } } as const;

const STALE_MS = 30 * 1000;

export function useNotificationsList(opts: ListNotificationsOptions = {}) {
  const { limit = 50, unreadOnly = false, channel = null } = opts;
  return useQuery({
    queryKey: [...KEY, 'list', limit, unreadOnly, channel],
    queryFn: () => listNotifications({ limit, unreadOnly, channel }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    ...NO_PERSIST,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [...KEY, 'unread-count'],
    queryFn: () => countUnreadNotifications(),
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    ...NO_PERSIST,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: number) => markNotificationRead(logId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY] });
    },
  });
}

export function useCancelMyPendingReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queueId: number) => cancelMyPendingReminder(queueId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY] });
    },
  });
}
