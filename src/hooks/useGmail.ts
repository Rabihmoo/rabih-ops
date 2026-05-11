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
