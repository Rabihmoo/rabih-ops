// calendar-oauth-callback — receives Google's redirect after the user
// consents, exchanges the auth code for tokens, stores them via the
// rpc_calendar_store_tokens RPC (which writes the refresh_token into
// supabase_vault), and bounces the user back to RabihOS Settings.
//
// Deployed with --no-verify-jwt: Google's redirect is anonymous; we
// authenticate the user via the one-time CSRF `state` consumed by
// rpc_calendar_consume_state.

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
const RABIHOS_APP_URL = Deno.env.get('RABIHOS_APP_URL') ?? '';

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/calendar-oauth-callback`;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}
interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
}

function bounce(redirectTo: string, query: Record<string, string>): Response {
  const params = new URLSearchParams(query);
  const target = `${RABIHOS_APP_URL}${redirectTo}${redirectTo.includes('?') ? '&' : '?'}${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: { Location: target },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const params = url.searchParams;

  // User denied consent or Google returned a top-level error
  const oauthError = params.get('error');
  if (oauthError) {
    return bounce('/settings', {
      google_calendar: 'error',
      reason: oauthError,
    });
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return bounce('/settings', {
      google_calendar: 'error',
      reason: 'missing code or state',
    });
  }

  let userId: string;
  let redirectTo = '/settings';

  // 1. Consume the CSRF state (one-shot lookup; missing/expired throws)
  try {
    const consumed = await rpc<{ user_id: string; redirect_to: string }>(
      'rpc_calendar_consume_state',
      { p_state: state },
    );
    userId = consumed.user_id;
    redirectTo = consumed.redirect_to || '/settings';
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid state';
    return bounce('/settings', { google_calendar: 'error', reason });
  }

  // 2. Exchange code for tokens
  let tokens: GoogleTokenResponse;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`token exchange ${tokenRes.status}: ${text}`);
    }
    tokens = JSON.parse(text);
    if (!tokens.refresh_token) {
      // Should never happen with prompt=consent; defensive check.
      throw new Error('Google did not return a refresh_token (prompt=consent?)');
    }
  } catch (err) {
    return bounce(redirectTo, {
      google_calendar: 'error',
      reason: err instanceof Error ? err.message : 'token exchange failed',
    });
  }

  // 3. Fetch userinfo (sub + email)
  let userInfo: GoogleUserInfo;
  try {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const text = await uiRes.text();
    if (!uiRes.ok) throw new Error(`userinfo ${uiRes.status}: ${text}`);
    userInfo = JSON.parse(text);
  } catch (err) {
    return bounce(redirectTo, {
      google_calendar: 'error',
      reason: err instanceof Error ? err.message : 'userinfo failed',
    });
  }

  // 4. Persist tokens (refresh into Vault, access inline)
  try {
    const expiresAtIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await rpc('rpc_calendar_store_tokens', {
      p_user_id: userId,
      p_email: userInfo.email,
      p_account_id: userInfo.sub,
      p_refresh_token: tokens.refresh_token,
      p_access_token: tokens.access_token,
      p_access_expires_at: expiresAtIso,
      p_scope: tokens.scope,
    });
  } catch (err) {
    return bounce(redirectTo, {
      google_calendar: 'error',
      reason: err instanceof Error ? err.message : 'store_tokens failed',
    });
  }

  // 5. Bounce the user back to /settings (or wherever the request came from)
  return bounce(redirectTo, { google_calendar: 'connected' });
});
