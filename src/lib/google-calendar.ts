import { callRpc } from './rpc';

export interface CalendarLinkStatus {
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_used_at?: string | null;
  scope?: string;
}

export async function getCalendarLinkStatus(): Promise<CalendarLinkStatus> {
  return callRpc<CalendarLinkStatus>('rpc_calendar_link_status', {});
}

export async function requestCalendarAuthorize(
  redirectTo: string = '/settings',
): Promise<{ state: string }> {
  return callRpc<{ state: string }>('rpc_calendar_request_authorize', {
    p_redirect_to: redirectTo,
  });
}

export interface DisconnectResult {
  success: boolean;
  email?: string;
  message?: string;
}

// Calls the Edge Function so Google's revoke endpoint is hit alongside
// the local is_active=false flip. The Edge Function uses the user's JWT.
export async function disconnectCalendar(): Promise<DisconnectResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    return { success: false, message: 'VITE_SUPABASE_URL missing' };
  }
  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) return { success: false, message: 'not authenticated' };

  const res = await fetch(`${supabaseUrl}/functions/v1/calendar-oauth-revoke`, {
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

export interface CalendarEventLink {
  id: number;
  google_calendar_id: string;
  google_event_id: string;
  event_title: string | null;
  event_start: string | null;
  event_end: string | null;
  event_html_link: string | null;
  created_at: string;
  mine: boolean;
}

export async function listCalendarLinksForEntity(
  entityType: 'task' | 'follow_up',
  entityId: string,
): Promise<CalendarEventLink[]> {
  return callRpc<CalendarEventLink[]>('rpc_calendar_links_for_entity', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
}

// =========================================================
// Dashboard "Today's calendar" — calls calendar-list-today Edge Function
// =========================================================

export interface CalendarTodayEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  location: string | null;
  html_link: string | null;
}
export interface CalendarTodayResult {
  connected: boolean;
  email?: string;
  events: CalendarTodayEvent[];
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

export interface CreateCalendarEventInput {
  entity_type: 'task' | 'follow_up';
  entity_id: string;
  start: string; // ISO 8601
  end: string;
  calendar_id?: string;
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<{ success: boolean; link: CalendarEventLink }> {
  return callEdgeFunction<{ success: boolean; link: CalendarEventLink }>(
    '/functions/v1/calendar-create-event',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function deleteCalendarEvent(
  linkId: number,
): Promise<{ success: boolean }> {
  return callEdgeFunction<{ success: boolean }>(
    '/functions/v1/calendar-delete-event',
    { method: 'POST', body: JSON.stringify({ link_id: linkId }) },
  );
}

export async function listGoogleCalendarToday(): Promise<CalendarTodayResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return { connected: false, events: [], error: 'no supabase url' };

  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) return { connected: false, events: [], error: 'not authenticated' };

  const res = await fetch(`${supabaseUrl}/functions/v1/calendar-list-today`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    return { connected: false, events: [], error: `HTTP ${res.status}` };
  }
  return res.json();
}

// =========================================================
// Frontend OAuth URL builder. The client_id is public per Google's
// guidance; the client_secret stays server-side only (Edge Functions).
// The redirect_uri must exactly match what's whitelisted in Google
// Cloud Console; we point it at the calendar-oauth-callback function.
// =========================================================

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

export interface BuildAuthUrlResult {
  url: string;
  missingEnv?: string[];
}

export function buildGoogleAuthUrl(state: string): BuildAuthUrlResult {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as
    | string
    | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const missing: string[] = [];
  if (!clientId) missing.push('VITE_GOOGLE_OAUTH_CLIENT_ID');
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (missing.length > 0) return { url: '', missingEnv: missing };

  const redirectUri = `${supabaseUrl}/functions/v1/calendar-oauth-callback`;
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    // `prompt=consent` forces Google to return a refresh_token every time —
    // otherwise on re-consent for an already-authorised user we'd only get
    // an access_token and the upsert would fail validation.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return { url: `${GOOGLE_AUTH_BASE}?${params.toString()}` };
}
