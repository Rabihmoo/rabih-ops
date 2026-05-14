import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectGmail,
  gmailActionLink,
  getGmailLinkStatus,
  listEmailLinksForEntity,
  listGmailImportant,
  linkEmail,
  requestGmailAuthorize,
  unlinkEmail,
  type GmailActionLinkInput,
  type LinkEmailInput,
} from '@/lib/gmail';
import { listGmailToday, type GmailTodayMode } from '@/lib/gmail-today';

const KEY = ['gmail'] as const;

export function useGmailLinkStatus() {
  return useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: () => getGmailLinkStatus(),
  });
}

export function useRequestGmailAuthorize() {
  return useMutation({
    mutationFn: (redirectTo: string = '/settings') => requestGmailAuthorize(redirectTo),
  });
}

export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectGmail(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'status'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'important'] });
    },
  });
}

export function useGmailImportant(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'important'],
    queryFn: () => listGmailImportant(),
    enabled,
    staleTime: 5 * 60 * 1000,
    // Email metadata (subject, from, snippet) must not be persisted to
    // localStorage. The persister in main.tsx filters by meta.persist.
    meta: { persist: false },
    refetchOnWindowFocus: true,
  });
}

/**
 * Phase 0.5 G.3: companion to useGmailImportant.
 *
 * Returns both `important` (sticky importance signal — may be older
 * than today) and `today` (since local midnight in PROJECT_TZ, minus
 * promotions / social / forums / muted threads) in one call.
 *
 * Same persistence policy as useGmailImportant — meta.persist=false so
 * email metadata never sits in localStorage.
 */
export function useGmailToday(
  enabled: boolean,
  mode: GmailTodayMode = 'focused',
) {
  return useQuery({
    // Key includes mode so Focused / All cache independently and
    // switching modes hits Gmail at most once per mode rather than
    // invalidating each other.
    queryKey: [...KEY, 'today', mode],
    queryFn: () => listGmailToday(mode),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    meta: { persist: false },
  });
}

export function useEmailLinksForEntity(
  entityType: 'task' | 'follow_up' | null,
  entityId: string | null,
) {
  return useQuery({
    queryKey: [...KEY, 'links', entityType, entityId],
    queryFn: () => listEmailLinksForEntity(entityType!, entityId!),
    enabled: !!entityType && !!entityId,
  });
}

export function useLinkEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkEmailInput) => linkEmail(input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({
        queryKey: [...KEY, 'links', input.entity_type, input.entity_id],
      });
    },
  });
}

export function useGmailActionLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GmailActionLinkInput) => gmailActionLink(input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({
        queryKey: [...KEY, 'links', input.entity_type, input.entity_id],
      });
    },
  });
}

export function useUnlinkEmail(
  entityType: 'task' | 'follow_up' | null,
  entityId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => unlinkEmail(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'links', entityType, entityId] });
    },
  });
}
