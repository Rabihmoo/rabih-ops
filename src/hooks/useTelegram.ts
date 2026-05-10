import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTelegramLinkStatus,
  requestTelegramLink,
  unlinkTelegramSelf,
} from '@/lib/telegram';

const KEY = ['telegram'] as const;

export function useTelegramLinkStatus() {
  return useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: () => getTelegramLinkStatus(),
  });
}

export function useRequestTelegramLink() {
  return useMutation({
    mutationFn: () => requestTelegramLink(),
  });
}

export function useUnlinkTelegramSelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unlinkTelegramSelf(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'status'] });
    },
  });
}
