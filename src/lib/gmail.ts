import { callRpc } from './rpc';

// =========================================================
// Gmail OAuth status + connect/disconnect
// =========================================================

export interface GmailLinkStatus {
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_used_at?: string | null;
  scope?: string;
}

export async function getGmailLinkStatus(): Promise<GmailLinkStatus> {
  return callRpc<GmailLinkStatus>('rpc_gmail_link_status', {});
}

export async function requestGmailAuthorize(
  redirectTo: string = '/settings',
): Promise<{ state: string }> {
  return callRpc<{ state: string }>('rpc_gmail_request_authorize', {
    p_redirect_to: redirectTo,
  });
}

export interface DisconnectResult {
  success: boolean;
  email?: string;
  message?: string;
}

export async function disconnectGmail(): Promise<DisconnectResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    return { success: false, message: 'VITE_SUPABASE_URL missing' };
  }
  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) return { success: false, message: 'not authenticated' };

  const res = await fetch(`${supabaseUrl}/functions/v1/gmail-oauth-revoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`disconnect failed (${res.status}): ${text}`);
  }
  return res.json();
}

// =========================================================
// Dashboard "Important emails" — calls gmail-list-important Edge Function
// =========================================================

export interface GmailImportantMessage {
  id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string;
  internal_date: string | null;
  html_link: string | null;
  is_unread: boolean;
}
export interface GmailImportantResult {
  connected: boolean;
  email?: string;
  messages: GmailImportantMessage[];
  error?: string;
}

async function callEdgeFunction<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL missing');
  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) throw new Error('not authenticated');
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error ?? text;
    } catch {
      // not json
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function listGmailImportant(): Promise<GmailImportantResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return { connected: false, messages: [], error: 'no supabase url' };

  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) return { connected: false, messages: [], error: 'not authenticated' };

  const res = await fetch(`${supabaseUrl}/functions/v1/gmail-list-important`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  // The Edge Function returns JSON with `error` even on non-OK status — try
  // to surface that so we can see what Gmail is actually complaining about.
  try {
    const j = JSON.parse(text);
    if (!res.ok) {
      return {
        connected: j.connected ?? false,
        messages: [],
        error: typeof j.error === 'string' ? j.error : `HTTP ${res.status}`,
      };
    }
    return j as GmailImportantResult;
  } catch {
    return { connected: false, messages: [], error: text || `HTTP ${res.status}` };
  }
}

// =========================================================
// Email-link records (snapshots attached to a task or follow_up)
// =========================================================

export interface EmailLinkSnapshot {
  id: number;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string | null;
  internal_date: string | null;
  html_link: string | null;
  created_at: string;
  mine: boolean;
}

export async function listEmailLinksForEntity(
  entityType: 'task' | 'follow_up',
  entityId: string,
): Promise<EmailLinkSnapshot[]> {
  return callRpc<EmailLinkSnapshot[]>('rpc_email_links_for_entity', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
}

export interface LinkEmailInput {
  entity_type: 'task' | 'follow_up';
  entity_id: string;
  message_id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string | null;
  internal_date: string | null;
  html_link: string | null;
}

export async function linkEmail(input: LinkEmailInput): Promise<EmailLinkSnapshot> {
  return callRpc<EmailLinkSnapshot>('rpc_email_link_create', {
    p_entity_type: input.entity_type,
    p_entity_id: input.entity_id,
    p_message_id: input.message_id,
    p_thread_id: input.thread_id,
    p_subject: input.subject,
    p_from_address: input.from_address,
    p_from_name: input.from_name,
    p_snippet: input.snippet,
    p_internal_date: input.internal_date,
    p_html_link: input.html_link,
  });
}

export async function unlinkEmail(linkId: number): Promise<EmailLinkSnapshot> {
  return callRpc<EmailLinkSnapshot>('rpc_email_link_remove', {
    p_link_id: linkId,
  });
}

// Edge Function helpers — gmail-action endpoint creates a link from a
// Gmail message id alone (server-side fetches the snapshot fields).
export interface GmailActionLinkInput {
  action: 'link';
  entity_type: 'task' | 'follow_up';
  entity_id: string;
  message_id: string;
}
export async function gmailActionLink(
  input: GmailActionLinkInput,
): Promise<{ success: boolean; link: EmailLinkSnapshot }> {
  return callEdgeFunction<{ success: boolean; link: EmailLinkSnapshot }>(
    '/functions/v1/gmail-action',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

// =========================================================
// OAuth URL builder — same shape as Calendar, with the gmail.readonly scope
// =========================================================

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

export interface BuildAuthUrlResult {
  url: string;
  missingEnv?: string[];
}

export function buildGmailAuthUrl(state: string): BuildAuthUrlResult {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as
    | string
    | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const missing: string[] = [];
  if (!clientId) missing.push('VITE_GOOGLE_OAUTH_CLIENT_ID');
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (missing.length > 0) return { url: '', missingEnv: missing };

  const redirectUri = `${supabaseUrl}/functions/v1/gmail-oauth-callback`;
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return { url: `${GOOGLE_AUTH_BASE}?${params.toString()}` };
}
