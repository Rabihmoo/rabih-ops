// Phase G2.3 foundation — TanStack hook wrappers for the G2.1
// email_states RPCs. No new RPC, no new Edge Function — these
// hooks call exactly what the migration 20260602_email_states.sql
// already deployed.
//
// Read queries are marked `meta: { persist: false }` so email
// snapshots (subject / from / snippet) never land in localStorage,
// matching the V1 pattern on useGmailImportant / useGmailToday.
//
// Mutations invalidate the entire `['gmail']` prefix because a state
// change can affect every email-row surface — Dashboard Today,
// Dashboard Important, future Inbox tabs, plus the per-message
// `useEmailStateForMessage` query used to drive each row's pill.
// Cheap invalidate, simple mental model.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callRpc } from '@/lib/rpc';
import type { EmailStateRow, EmailStatus } from '@/lib/email-status';

const KEY = ['gmail'] as const;

// =====================================================================
// Read — single message state lookup
// =====================================================================

/**
 * Returns the caller's email_state row for (account, message) or null
 * if no state has been set. Drives the per-row pill in Dashboard /
 * Inbox email rows.
 *
 * Pass null for either arg to disable the query — useful when the
 * row hasn't resolved its accountId yet (e.g. while Gmail status is
 * still loading).
 */
export function useEmailStateForMessage(
  googleAccountId: string | null,
  gmailMessageId: string | null,
) {
  return useQuery({
    queryKey: [...KEY, 'state', googleAccountId, gmailMessageId],
    queryFn: () =>
      callRpc<EmailStateRow | null>('rpc_email_state_for_message', {
        p_google_account_id: googleAccountId,
        p_gmail_message_id: gmailMessageId,
      }),
    enabled: !!googleAccountId && !!gmailMessageId,
    staleTime: 30 * 1000,
    meta: { persist: false },
  });
}

// =====================================================================
// Read — paginated list for the user (used by future Pending / Done
//        tabs in the Inbox; foundation just exposes the hook)
// =====================================================================

export interface EmailStatesQuery {
  status?: EmailStatus[];
  googleAccountId?: string | null;
  limit?: number;
  offset?: number;
}

export function useEmailStatesForUser(opts: EmailStatesQuery = {}) {
  const { status, googleAccountId, limit, offset } = opts;
  return useQuery({
    queryKey: [
      ...KEY,
      'states-for-user',
      status ?? null,
      googleAccountId ?? null,
      limit ?? null,
      offset ?? null,
    ],
    queryFn: () =>
      callRpc<EmailStateRow[]>('rpc_email_states_for_user', {
        p_status: status ?? null,
        p_google_account_id: googleAccountId ?? null,
        p_limit: limit ?? null,
        p_offset: offset ?? null,
      }),
    staleTime: 30 * 1000,
    meta: { persist: false },
  });
}

// =====================================================================
// Mutations
// =====================================================================

export interface SetEmailStateInput {
  googleAccountId: string;
  gmailMessageId: string;
  status: EmailStatus;
  // Snapshot fields — passed on first set so the DB row carries enough
  // metadata to render Pending / Done lists without a Gmail roundtrip.
  // On subsequent updates these can be omitted; the RPC's coalesce-on-
  // conflict preserves the existing snapshot when null is passed.
  gmailThreadId?: string | null;
  subject?: string | null;
  fromAddress?: string | null;
  fromName?: string | null;
  snippet?: string | null;
  internalDate?: string | null;
  note?: string | null;
}

export function useSetEmailState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetEmailStateInput) =>
      callRpc<EmailStateRow>('rpc_email_state_set', {
        p_google_account_id: input.googleAccountId,
        p_gmail_message_id: input.gmailMessageId,
        p_status: input.status,
        p_gmail_thread_id: input.gmailThreadId ?? null,
        p_subject: input.subject ?? null,
        p_from_address: input.fromAddress ?? null,
        p_from_name: input.fromName ?? null,
        p_snippet: input.snippet ?? null,
        p_internal_date: input.internalDate ?? null,
        p_note: input.note ?? null,
      }),
    onSuccess: () => {
      // Broad invalidate — every Gmail surface re-fetches. Cheap.
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export interface ClearEmailStateInput {
  googleAccountId: string;
  gmailMessageId: string;
}

export interface ClearEmailStateResult {
  removed: boolean;
  google_account_id: string;
  gmail_message_id: string;
  previous_status?: EmailStatus;
}

export function useClearEmailState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClearEmailStateInput) =>
      callRpc<ClearEmailStateResult>('rpc_email_state_clear', {
        p_google_account_id: input.googleAccountId,
        p_gmail_message_id: input.gmailMessageId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
