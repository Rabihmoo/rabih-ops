// gmail-oauth-revoke — disconnect path. JWT-auth'd.
// 1. fetch the user's refresh_token from Vault (via rpc_gmail_get_token)
// 2. call Google's revoke endpoint
// 3. flip is_active=false (audited via rpc_gmail_mark_disconnected)

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { getUserIdFromJwt } from '../_shared/google.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    userId = await getUserIdFromJwt(jwt, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch (_e) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let refreshToken: string | null = null;
  try {
    const tok = await rpc<any>('rpc_gmail_get_token', { p_user_id: userId });
    if (tok && tok.connected) {
      refreshToken = tok.refresh_token as string;
    }
  } catch (_e) {
    // ignore — proceed to local disconnect
  }

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

  try {
    await rpc('rpc_gmail_mark_disconnected', { p_user_id: userId });
  } catch (err) {
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      500,
    );
  }

  return jsonResponse({ success: true });
});
