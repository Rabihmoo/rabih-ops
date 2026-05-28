// Client lib for user_inbox_settings (Smart Suggestions v2 thresholds).

import { callRpc } from './rpc';

export interface InboxSettings {
  stale_follow_up_days: number;
  supplier_silence_days: number;
  draft_doc_aging_days: number;
  recurring_grace_days: number;
  disabled_rules: string[];
}

export const DEFAULT_INBOX_SETTINGS: InboxSettings = {
  stale_follow_up_days: 7,
  supplier_silence_days: 5,
  draft_doc_aging_days: 14,
  recurring_grace_days: 2,
  disabled_rules: [],
};

export async function getInboxSettings(): Promise<InboxSettings> {
  const data = await callRpc<InboxSettings | null>('rpc_get_inbox_settings', {});
  return data ?? DEFAULT_INBOX_SETTINGS;
}

export async function setInboxSettings(
  patch: Partial<Omit<InboxSettings, 'disabled_rules'>> & { disabled_rules?: string[] },
): Promise<InboxSettings> {
  return callRpc<InboxSettings>('rpc_set_inbox_settings', {
    p_stale_follow_up_days: patch.stale_follow_up_days ?? null,
    p_supplier_silence_days: patch.supplier_silence_days ?? null,
    p_draft_doc_aging_days: patch.draft_doc_aging_days ?? null,
    p_recurring_grace_days: patch.recurring_grace_days ?? null,
    p_disabled_rules: patch.disabled_rules ?? null,
  });
}
