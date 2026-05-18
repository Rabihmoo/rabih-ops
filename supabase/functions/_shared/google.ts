// Shared helpers for Google Calendar / Gmail Edge Functions.
// - Validates a Supabase user JWT and returns the user_id.
// - Returns a fresh access_token for a (user, service) pair, refreshing
//   if expired and persisting via rpc_<service>_update_access_token.
// - Detects Google's `invalid_grant` on refresh (most commonly: the
//   7-day refresh-token expiry on Testing-status OAuth apps) and flips
//   the local row to needs_reconnect=true via
//   rpc_google_mark_needs_reconnect so the UI can prompt for re-consent
//   instead of leaking raw 400 bodies onto the Dashboard.

// deno-lint-ignore-file no-explicit-any

export async function getUserIdFromJwt(jwt: string, supabaseUrl: string, serviceRoleKey: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) throw new Error(`auth.getUser failed (${res.status})`);
  const j = await res.json();
  if (!j.id) throw new Error('no user id in auth response');
  return j.id as string;
}

export interface GoogleTokenInfo {
  connected: boolean;
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  // True when the local row is in needs_reconnect state — either because
  // we just marked it (this call discovered invalid_grant) or because a
  // previous call already flagged it. Edge Functions surface this through
  // their response shape so the frontend can render the right copy.
  needsReconnect?: boolean;
}

export type GoogleService = 'calendar' | 'gmail';

// Tagged error so call sites can render the right user-facing copy.
// Throwing (rather than returning) keeps the existing try/catch shape
// in every Edge Function — they were already handling thrown errors.
export class GoogleNeedsReconnectError extends Error {
  needsReconnect: true;
  service: GoogleService;
  email?: string;

  constructor(service: GoogleService, email?: string) {
    super('google connection needs reconnect');
    this.name = 'GoogleNeedsReconnectError';
    this.needsReconnect = true;
    this.service = service;
    this.email = email;
  }
}

export function isNeedsReconnectError(err: unknown): err is GoogleNeedsReconnectError {
  return !!err
    && typeof err === 'object'
    && (err as any).needsReconnect === true
    && typeof (err as any).service === 'string';
}

// Parses Google's OAuth2 error response. Google returns 400 with a JSON
// body of shape { "error": "invalid_grant", "error_description": "..." }
// when the refresh token is revoked / expired / mismatched. Anything else
// (network failure, 5xx, malformed body) bubbles up as a generic error
// so the call site can log it but doesn't trigger a needs_reconnect.
function looksLikeInvalidGrant(status: number, body: string): boolean {
  if (status !== 400) return false;
  try {
    const j = JSON.parse(body);
    return j?.error === 'invalid_grant';
  } catch {
    return false;
  }
}

export async function getFreshGoogleAccessTokenFor(
  service: GoogleService,
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenInfo> {
  const getRpc = service === 'calendar' ? 'rpc_calendar_get_token' : 'rpc_gmail_get_token';
  const updateRpc =
    service === 'calendar'
      ? 'rpc_calendar_update_access_token'
      : 'rpc_gmail_update_access_token';

  const tok = await rpc<any>(getRpc, { p_user_id: userId });
  if (!tok || !tok.connected) {
    // Previously-flagged needs_reconnect rows surface here: get_token
    // returns connected=false, needs_reconnect=true, plus the email so
    // we can echo it back to the user.
    if (tok && tok.needs_reconnect === true) {
      throw new GoogleNeedsReconnectError(service, tok.google_email);
    }
    return { connected: false };
  }

  const expiresAt = new Date(tok.access_token_expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return {
      connected: true,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      email: tok.google_email,
    };
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tok.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (looksLikeInvalidGrant(res.status, text)) {
      // Idempotent — RPC is a no-op once already flagged. Swallow errors
      // here so the user-facing error path runs even if the audit insert
      // fails (e.g. transient DB blip). Logging keeps the diagnostic.
      try {
        await rpc('rpc_google_mark_needs_reconnect', {
          p_user_id: userId,
          p_service: service,
        });
      } catch (markErr) {
        console.error('mark_needs_reconnect failed:', markErr);
      }
      throw new GoogleNeedsReconnectError(service, tok.google_email);
    }
    throw new Error(`refresh-token exchange ${res.status}: ${text}`);
  }
  const refreshed = JSON.parse(text);

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await rpc(updateRpc, {
    p_user_id: userId,
    p_access_token: refreshed.access_token,
    p_access_expires_at: newExpiresAt,
  });

  return {
    connected: true,
    accessToken: refreshed.access_token,
    refreshToken: tok.refresh_token,
    email: tok.google_email,
  };
}

// Backwards-compat shim — Calendar Edge Functions still call this name.
export function getFreshGoogleAccessToken(
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenInfo> {
  return getFreshGoogleAccessTokenFor('calendar', rpc, userId, clientId, clientSecret);
}

// Today's range in Africa/Maputo as RFC3339 strings.
// Mozambique has no DST so the offset is always +02:00.
export function maputoTodayRange(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Maputo' }));
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  const tomorrow = new Date(local);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tYyyy = tomorrow.getFullYear();
  const tMm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tDd = String(tomorrow.getDate()).padStart(2, '0');
  return {
    timeMin: `${yyyy}-${mm}-${dd}T00:00:00+02:00`,
    timeMax: `${tYyyy}-${tMm}-${tDd}T00:00:00+02:00`,
  };
}
