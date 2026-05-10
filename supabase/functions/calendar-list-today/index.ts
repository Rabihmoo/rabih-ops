// calendar-list-today — fetches today's events from the user's primary
// Google Calendar. Used by the Dashboard's "Today's calendar" section.
//
// Auth: user JWT (verify_jwt = true).

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessToken,
  getUserIdFromJwt,
  maputoTodayRange,
} from '../_shared/google.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
  status?: string;
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return new Response('unauthorized', { status: 401 });
  }
  const jwt = auth.slice(7);

  let userId: string;
  try {
    userId = await getUserIdFromJwt(jwt, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  let token;
  try {
    token = await getFreshGoogleAccessToken(
      rpc,
      userId,
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        connected: false,
        error: err instanceof Error ? err.message : 'token error',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!token.connected) {
    return new Response(JSON.stringify({ connected: false, events: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { timeMin, timeMax } = maputoTodayRange();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20',
    });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return new Response(
      JSON.stringify({ connected: true, error: text, events: [] }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const j = JSON.parse(text);
  const events = (j.items as GoogleEvent[] ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary ?? '(no title)',
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      all_day: !!e.start?.date && !e.start?.dateTime,
      location: e.location ?? null,
      html_link: e.htmlLink ?? null,
    }));

  return new Response(
    JSON.stringify({ connected: true, email: token.email, events }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
