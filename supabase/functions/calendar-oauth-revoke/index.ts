// calendar-oauth-revoke — disconnect path. The caller (the user, via
// their JWT) asks us to:
//   1. fetch their refresh_token from Vault
//   2. call Google's revoke endpoint to invalidate it
//   3. flip is_active=false in google_oauth_tokens (audited)
//
// Deployed with default JWT verification (verify_jwt = true).

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getUserIdFromJwt(jwt: string): Promise<string> {
  // Validate the JWT by asking the auth server to resolve it.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) throw new Error(`auth.getUser failed (${res.status})`);
  const j = await res.json();
  if (!j.id) throw new Error('no user id in auth response');
  return j.id as string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const jwt = auth.slice(7);

  let userId: string;
  try {
    userId = await getUserIdFromJwt(jwt);
  } catch (_e) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  // Fetch the refresh token from Vault. If the user isn't connected, we
  // still mark disconnected (idempotent) and return success — the
  // frontend should treat this as a no-op.
  let refreshToken: string | null = null;
  try {
    const tok = await rpc<any>('rpc_calendar_get_token', { p_user_id: userId });
    if (tok && tok.connected) {
      refreshToken = tok.refresh_token as string;
    }
  } catch (_e) {
    // ignore — proceed to local disconnect
  }

  // Call Google's revoke endpoint (best effort — 200 even if already revoked).
  if (refreshToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
    } catch (_e) {
      // Non-fatal; we still flip local state.
    }
  }

  // Flip local state.
  try {
    await rpc('rpc_calendar_mark_disconnected', { p_user_id: userId });
  } catch (err) {
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      500,
    );
  }

  return jsonResponse({ success: true });
});
