// calendar-create-event — creates a Google Calendar event from a
// RabihOS task or follow-up, then records the link in
// calendar_event_links.
//
// Auth: user JWT.
//
// Body: { entity_type: 'task' | 'follow_up', entity_id: uuid,
//         start: ISO, end: ISO, calendar_id?: string }

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessToken,
  getUserIdFromJwt,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
const RABIHOS_APP_URL = Deno.env.get('RABIHOS_APP_URL') ?? '';

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Body {
  entity_type: 'task' | 'follow_up';
  entity_id: string;
  start: string;        // ISO 8601 (UTC or with offset)
  end: string;          // ISO 8601
  calendar_id?: string; // defaults to "primary"
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  branch: string;
  deleted_at: string | null;
}
interface FollowUpRow {
  id: string;
  title: string;
  description: string | null;
  deleted_at: string | null;
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
    userId = await getUserIdFromJwt(jwt, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad json' }, 400);
  }
  if (!body.entity_type || !body.entity_id || !body.start || !body.end) {
    return jsonResponse(
      { error: 'entity_type, entity_id, start, end required' },
      400,
    );
  }
  if (body.entity_type !== 'task' && body.entity_type !== 'follow_up') {
    return jsonResponse(
      { error: 'entity_type must be task or follow_up' },
      400,
    );
  }

  // Fetch the entity using the user's JWT so RLS scopes it to what they can see.
  // We fetch via the REST endpoint with the user JWT (NOT service role) to get
  // RLS-correct visibility.
  const restHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };

  let title = '';
  let description: string | null = null;
  let appLink = '';

  if (body.entity_type === 'task') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/tasks?id=eq.${body.entity_id}&deleted_at=is.null&select=id,title,description,branch,deleted_at`,
      { headers: restHeaders },
    );
    if (!r.ok) return jsonResponse({ error: `entity lookup ${r.status}` }, r.status);
    const rows = (await r.json()) as TaskRow[];
    if (rows.length === 0) return jsonResponse({ error: 'task not found' }, 404);
    title = rows[0].title;
    description = rows[0].description;
    appLink = `${RABIHOS_APP_URL}/tasks/${body.entity_id}`;
  } else {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/follow_ups?id=eq.${body.entity_id}&deleted_at=is.null&select=id,title,description,deleted_at`,
      { headers: restHeaders },
    );
    if (!r.ok) return jsonResponse({ error: `entity lookup ${r.status}` }, r.status);
    const rows = (await r.json()) as FollowUpRow[];
    if (rows.length === 0) return jsonResponse({ error: 'follow-up not found' }, 404);
    title = rows[0].title;
    description = rows[0].description;
    appLink = `${RABIHOS_APP_URL}/follow-ups/${body.entity_id}`;
  }

  // Get a fresh access token (refresh-on-demand).
  let token;
  try {
    token = await getFreshGoogleAccessToken(
      rpc,
      userId,
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
    );
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'token error' },
      502,
    );
  }
  if (!token.connected) {
    return jsonResponse({ error: 'Google Calendar not connected' }, 412);
  }

  const calendarId = body.calendar_id || 'primary';
  const eventBody = {
    summary: title,
    description: [description, '', `View in RabihOS: ${appLink}`]
      .filter((x) => x !== null && x !== undefined)
      .join('\n'),
    start: { dateTime: body.start, timeZone: 'Africa/Maputo' },
    end: { dateTime: body.end, timeZone: 'Africa/Maputo' },
  };

  const gRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    },
  );
  const gText = await gRes.text();
  if (!gRes.ok) {
    return jsonResponse({ error: `google ${gRes.status}: ${gText}` }, 502);
  }
  const gEvent = JSON.parse(gText);

  // Record the link.
  const link = await rpc<any>('rpc_calendar_record_event', {
    p_entity_type: body.entity_type,
    p_entity_id: body.entity_id,
    p_user_id: userId,
    p_calendar_id: calendarId,
    p_event_id: gEvent.id,
    p_title: title,
    p_start: body.start,
    p_end: body.end,
    p_html_link: gEvent.htmlLink,
  });

  return jsonResponse({ success: true, link }, 200);
});
