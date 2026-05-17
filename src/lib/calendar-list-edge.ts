// Edge Function caller for /functions/v1/calendar-list (shipped in C1).
//
// Two modes:
//   * instances — singleEvents=true. One row per occurrence. Used by
//                 the /calendar page's Today / Upcoming / Linked /
//                 Unlinked filters.
//   * masters   — singleEvents=false, filtered server-side to events
//                 whose recurrence[] is set. Used by the Recurring
//                 filter to list distinct series. Deferred until the
//                 filter is selected.
//
// The Edge Function enforces verify_jwt=true; this client attaches the
// caller's Supabase session JWT.

export interface CalendarListEvent {
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

export interface CalendarListResult {
  connected: boolean;
  email?: string;
  mode: 'instances' | 'masters';
  events: CalendarListEvent[];
  more: boolean;
  next_page_token: string | null;
  error?: string;
}

export async function listGoogleCalendarEvents(input: {
  from: string;          // ISO 8601
  to: string;            // ISO 8601
  mode: 'instances' | 'masters';
  pageToken?: string;
}): Promise<CalendarListResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    return {
      connected: false,
      mode: input.mode,
      events: [],
      more: false,
      next_page_token: null,
      error: 'VITE_SUPABASE_URL missing',
    };
  }

  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) {
    return {
      connected: false,
      mode: input.mode,
      events: [],
      more: false,
      next_page_token: null,
      error: 'not authenticated',
    };
  }

  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    mode: input.mode,
  });
  if (input.pageToken) params.set('page_token', input.pageToken);

  const res = await fetch(
    `${supabaseUrl}/functions/v1/calendar-list?${params.toString()}`,
    { method: 'GET', headers: { Authorization: `Bearer ${jwt}` } },
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.error ?? detail;
    } catch {
      // not json
    }
    return {
      connected: false,
      mode: input.mode,
      events: [],
      more: false,
      next_page_token: null,
      error: detail,
    };
  }
  return (await res.json()) as CalendarListResult;
}
