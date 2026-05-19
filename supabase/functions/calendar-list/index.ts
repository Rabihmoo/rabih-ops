// calendar-list — fetches Google Calendar events in a [from, to] window.
//
// Two modes, controlled by the `mode` query param:
//   * instances (default) — singleEvents=true. Each recurring occurrence
//                           returns as its own row. Used by the /calendar
//                           Today + Upcoming filters.
//   * masters             — singleEvents=false, filtered to events whose
//                           recurrence[] is set. Used by the Recurring
//                           filter to show distinct series.
//
// Pagination: loops Google's pageToken internally up to 5 pages or 1000
// events. Returns more=true + next_page_token when capped so a caller
// can resume explicitly.
//
// Auth: user JWT (verify_jwt=true at deploy — no --no-verify-jwt flag).
//
// Scope: uses the existing calendar.events read+write scope. No new
// scope, no Gmail scope, no writes.

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessToken,
  getUserIdFromJwt,
  isNeedsReconnectError,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_WINDOW_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
const MAX_PAGES = 5;
const MAX_EVENTS = 1000;

interface GoogleEvent {
  id: string;
  recurringEventId?: string;
  recurrence?: string[];
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
  organizer?: { email?: string; self?: boolean };
  attendees?: Array<{ email?: string }>;
}

interface NormalizedEvent {
  id: string;
  recurring_event_id: string | null;
  rrule: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  all_day: boolean;
  html_link: string | null;
  organizer_email: string | null;
  attendee_count: number;
  is_organizer: boolean;
}

function isIsoLike(s: string): boolean {
  // Accept RFC3339 / ISO 8601. Date.parse returns NaN on bad input.
  return !Number.isNaN(Date.parse(s));
}

function normalize(e: GoogleEvent): NormalizedEvent {
  const startIso = e.start?.dateTime ?? e.start?.date ?? null;
  const endIso = e.end?.dateTime ?? e.end?.date ?? null;
  return {
    id: e.id,
    recurring_event_id: e.recurringEventId ?? null,
    rrule:
      Array.isArray(e.recurrence) && e.recurrence.length > 0
        ? e.recurrence[0]
        : null,
    title: e.summary ?? '(no title)',
    description: e.description ?? null,
    location: e.location ?? null,
    start: startIso,
    end: endIso,
    all_day: !!e.start?.date && !e.start?.dateTime,
    html_link: e.htmlLink ?? null,
    organizer_email: e.organizer?.email ?? null,
    attendee_count: Array.isArray(e.attendees) ? e.attendees.length : 0,
    is_organizer: e.organizer?.self === true,
  };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
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

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const modeParam = url.searchParams.get('mode') ?? 'instances';
  const initialPageToken = url.searchParams.get('page_token');

  if (!from || !to) {
    return jsonResponse({ error: 'from and to are required' }, 400);
  }
  if (!isIsoLike(from) || !isIsoLike(to)) {
    return jsonResponse({ error: 'from/to must be RFC3339 / ISO 8601' }, 400);
  }
  if (modeParam !== 'instances' && modeParam !== 'masters') {
    return jsonResponse({ error: 'mode must be instances or masters' }, 400);
  }
  const mode = modeParam as 'instances' | 'masters';
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (toMs < fromMs) {
    return jsonResponse({ error: 'to must be >= from' }, 400);
  }
  if (toMs - fromMs > MAX_WINDOW_MS) {
    return jsonResponse({ error: 'window > 365 days' }, 400);
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
    if (isNeedsReconnectError(err)) {
      return jsonResponse(
        {
          connected: false,
          needs_reconnect: true,
          service: 'calendar',
          email: err.email,
          mode,
          events: [],
          more: false,
          next_page_token: null,
        },
        200,
      );
    }
    return jsonResponse(
      {
        connected: false,
        error: err instanceof Error ? err.message : 'token error',
        mode,
        events: [],
        more: false,
        next_page_token: null,
      },
      200,
    );
  }

  if (!token.connected) {
    return jsonResponse({
      connected: false,
      mode,
      events: [],
      more: false,
      next_page_token: null,
    });
  }

  // Build the per-mode Google query params.
  function buildUrl(pageToken: string | null): string {
    const params = new URLSearchParams({
      timeMin: from!,
      timeMax: to!,
      maxResults: '250',
      singleEvents: mode === 'instances' ? 'true' : 'false',
    });
    if (mode === 'instances') params.set('orderBy', 'startTime');
    if (pageToken) params.set('pageToken', pageToken);
    return (
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
      params.toString()
    );
  }

  const collected: NormalizedEvent[] = [];
  let pageToken: string | null = initialPageToken;
  let pages = 0;
  let lastNextToken: string | null = null;
  let more = false;

  while (true) {
    pages += 1;
    const gUrl = buildUrl(pageToken);
    const res = await fetch(gUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return jsonResponse(
        {
          connected: true,
          error: `google ${res.status}: ${text}`,
          mode,
          events: collected,
          more: false,
          next_page_token: null,
        },
        502,
      );
    }
    const j = JSON.parse(text);
    const rawItems = (j.items as GoogleEvent[]) ?? [];
    for (const e of rawItems) {
      if (e.status === 'cancelled') continue;
      if (mode === 'masters') {
        if (!Array.isArray(e.recurrence) || e.recurrence.length === 0) continue;
      }
      collected.push(normalize(e));
      if (collected.length >= MAX_EVENTS) break;
    }
    lastNextToken = j.nextPageToken ?? null;
    if (!lastNextToken) break;
    if (collected.length >= MAX_EVENTS) {
      more = true;
      break;
    }
    if (pages >= MAX_PAGES) {
      more = true;
      break;
    }
    pageToken = lastNextToken;
  }

  return jsonResponse({
    connected: true,
    email: token.email,
    mode,
    events: collected,
    more,
    next_page_token: more ? lastNextToken : null,
  });
});
