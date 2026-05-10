// calendar-delete-event — removes a Google Calendar event we previously
// created, then soft-deletes the link row.
//
// Auth: user JWT.
// Body: { link_id: number }

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessToken,
  getUserIdFromJwt,
} from '../_shared/google.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface LinkRow {
  id: number;
  user_id: string;
  google_calendar_id: string;
  google_event_id: string;
  deleted_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return new Response('unauthorized', { status: 401 });
  const jwt = auth.slice(7);

  let userId: string;
  try {
    userId = await getUserIdFromJwt(jwt, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  let body: { link_id: number };
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (!body.link_id) {
    return new Response(
      JSON.stringify({ error: 'link_id required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Look up the link via PostgREST with the user's JWT — RLS gates this so
  // we can't blindly delete someone else's event.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/calendar_event_links?id=eq.${body.link_id}&deleted_at=is.null&select=id,user_id,google_calendar_id,google_event_id,deleted_at`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${jwt}`,
      },
    },
  );
  if (!r.ok) {
    return new Response(
      JSON.stringify({ error: `link lookup ${r.status}` }),
      { status: r.status, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const rows = (await r.json()) as LinkRow[];
  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'link not found or not yours' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const link = rows[0];

  // Refresh access token + delete the Google event (best effort).
  let token;
  try {
    token = await getFreshGoogleAccessToken(
      rpc,
      userId,
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
    );
  } catch (err) {
    // Even if token refresh fails, we still soft-delete locally; the user
    // shouldn't be stuck with stale links.
    token = { connected: false };
    console.error('token refresh failed:', err);
  }

  let googleStatus: number | null = null;
  let googleError: string | null = null;
  if (token.connected && (token as any).accessToken) {
    const gRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(link.google_calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${(token as any).accessToken}` },
      },
    );
    googleStatus = gRes.status;
    // 204 = success, 410 = already gone (treat as success), 404 = already gone too
    if (!gRes.ok && gRes.status !== 410 && gRes.status !== 404) {
      googleError = await gRes.text();
    }
  }

  // Soft-delete the link locally regardless of Google's response.
  const removed = await rpc<any>('rpc_calendar_remove_event', { p_link_id: body.link_id });

  return new Response(
    JSON.stringify({ success: true, link: removed, google_status: googleStatus, google_error: googleError }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
