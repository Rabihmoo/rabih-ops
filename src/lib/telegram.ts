import { callRpc } from './rpc';

export interface TelegramLinkStatus {
  linked: boolean;
  tg_username?: string | null;
  tg_first_name?: string | null;
  linked_at?: string | null;
  last_seen_at?: string | null;
}

export async function getTelegramLinkStatus(): Promise<TelegramLinkStatus> {
  return callRpc<TelegramLinkStatus>('rpc_telegram_link_status', {});
}

export interface TelegramRequestLinkResult {
  token: string;
  expires_at: string;
}

export async function requestTelegramLink(): Promise<TelegramRequestLinkResult> {
  return callRpc<TelegramRequestLinkResult>('rpc_telegram_request_link', {});
}

export async function unlinkTelegramSelf(): Promise<{ success: boolean }> {
  return callRpc<{ success: boolean; chat_id?: number; message?: string }>(
    'rpc_telegram_unlink_self',
    {},
  );
}

export function buildTelegramDeepLink(token: string): string | null {
  const bot = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? '';
  if (!bot) return null;
  // Strip leading @ if the user pasted it that way.
  const handle = bot.replace(/^@/, '');
  return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
}
