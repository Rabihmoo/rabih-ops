import { useMemo, useState } from 'react';
import { Calendar, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  useCalendarLinkStatus,
  useCalendarLinksForFollowUp,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useGoogleCalendar';
import { useAddFollowUpEvent } from '@/hooks/useFollowUps';
import type { FollowUpRow } from '@/types/database';
import {
  attachCalendarToFollowUp,
  detachCalendarFromFollowUp,
} from '@/lib/follow-ups';

// F1.5 — Add-to-Calendar surface for follow-ups. Mirrors TaskCalendarCard
// shape with two additions:
//   * invitees field (comma-separated emails, passed through to Google)
//   * smart defaults pulled from reminder_at (preferred) or due_date+09:00
//
// After Google creates the event, we additionally sync to the follow_ups
// row's calendar_event_id/html_link columns via rpc_attach_calendar_to_follow_up,
// which writes a calendar_added follow_up_events row so the History feed
// surfaces it. Delete mirrors that with rpc_detach_calendar_from_follow_up.

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// F1.5: pick the start time from reminder_at when set; else due_date at
// 09:00 local. Always returns a future-ish value the operator can tweak.
function defaultStart(followUp: FollowUpRow): Date {
  if (followUp.reminder_at) {
    const r = new Date(followUp.reminder_at);
    if (!isNaN(r.getTime())) return r;
  }
  if (followUp.due_date) {
    // due_date is a YYYY-MM-DD; combine with 09:00 in local time.
    const [y, m, d] = followUp.due_date.split('-').map((s) => parseInt(s, 10));
    if (y && m && d) {
      return new Date(y, m - 1, d, 9, 0, 0, 0);
    }
  }
  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
  return fallback;
}

function defaultEnd(start: Date): Date {
  const e = new Date(start);
  e.setMinutes(e.getMinutes() + 30);
  return e;
}

function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return '';
  const s = new Date(startIso);
  const e = endIso ? new Date(endIso) : null;
  const date = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (!e) return `${date} · ${sTime}`;
  const eTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${sTime} – ${eTime}`;
}

// Split a comma-separated email string into a deduped trimmed list.
// Empty/whitespace-only chunks dropped; no email-format validation
// (Google rejects malformed addresses with a clearer message).
function parseInviteeList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

export function FollowUpCalendarCard({
  followUp,
  canMutate,
}: {
  followUp: FollowUpRow;
  canMutate: boolean;
}) {
  const status = useCalendarLinkStatus();
  const links = useCalendarLinksForFollowUp(followUp.id);
  const create = useCreateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const addEvent = useAddFollowUpEvent();

  const connected = status.data?.connected === true;
  const existingLinks = links.data ?? [];

  const startDefault = useMemo(() => defaultStart(followUp), [followUp]);
  const endDefault = useMemo(() => defaultEnd(startDefault), [startDefault]);

  const [showForm, setShowForm] = useState(false);
  const [start, setStart] = useState(toLocalInputValue(startDefault));
  const [end, setEnd] = useState(toLocalInputValue(endDefault));
  const [inviteesRaw, setInviteesRaw] = useState('');

  // Hide card entirely when Calendar is not connected AND no historical
  // links exist — matches TaskCalendarCard behaviour.
  if (!connected && existingLinks.length === 0) return null;

  async function handleSubmit() {
    try {
      if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
        toast({ title: 'Invalid date/time', variant: 'destructive' });
        return;
      }
      if (new Date(end) <= new Date(start)) {
        toast({ title: 'End must be after start', variant: 'destructive' });
        return;
      }
      const attendees = parseInviteeList(inviteesRaw);
      const result = await create.mutateAsync({
        entity_type: 'follow_up',
        entity_id: followUp.id,
        start: new Date(start).toISOString(),
        end:   new Date(end).toISOString(),
        attendees: attendees.length > 0 ? attendees : undefined,
      });

      // Sync to follow_ups columns + log the calendar_added history
      // event. Non-fatal if it fails — the Google event still exists
      // and the calendar_event_links row is visible.
      try {
        await attachCalendarToFollowUp({
          followUpId: followUp.id,
          eventId:    result.link.google_event_id,
          htmlLink:   result.link.event_html_link,
        });
      } catch {
        // History sync best-effort; the create itself succeeded.
      }

      // One invitee_added event per invitee — surfaces in the History feed.
      for (const email of attendees) {
        try {
          await addEvent.mutateAsync({
            id:      followUp.id,
            kind:    'invitee_added',
            payload: { email },
          });
        } catch {
          // Same best-effort as above.
        }
      }

      toast({
        title: attendees.length > 0
          ? `Calendar event created · ${attendees.length} invited`
          : 'Calendar event created',
      });
      setShowForm(false);
      setInviteesRaw('');
    } catch (err) {
      toast({
        title: 'Could not create calendar event',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleRemove(linkId: number) {
    if (!confirm('Remove this calendar event from Google Calendar?')) return;
    try {
      await remove.mutateAsync(linkId);
      // Mirror sync: clear the columns + log calendar_removed event.
      try {
        await detachCalendarFromFollowUp(followUp.id);
      } catch {
        // Best-effort — Google event is already gone.
      }
      toast({ title: 'Calendar event removed' });
    } catch (err) {
      toast({
        title: 'Could not remove calendar event',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  return (
    <Card data-testid="follow-up-calendar-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-section-label flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" /> Calendar
          </div>
          {connected && canMutate && !showForm && existingLinks.length === 0 && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="follow-up-add-to-calendar-button"
            >
              <Plus className="mr-1 h-4 w-4" /> Add to Calendar
            </Button>
          )}
        </div>

        {existingLinks.map((l) => (
          <div
            key={l.id}
            data-testid="follow-up-calendar-link-row"
            className="bg-surface-1 border-border flex items-center gap-3 rounded-md border px-3 py-2.5"
          >
            <Calendar className="text-primary-ink h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground line-clamp-1 text-sm font-medium">
                {l.event_title ?? '(no title)'}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatRange(l.event_start, l.event_end)}
              </div>
            </div>
            {l.event_html_link && (
              <a
                href={l.event_html_link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in Google Calendar"
                className="text-muted-foreground hover:text-foreground shrink-0 self-center"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {l.mine && canMutate && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemove(l.id)}
                disabled={remove.isPending}
                aria-label="Remove from calendar"
                data-testid="follow-up-calendar-remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {showForm && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Schedule a calendar event</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="follow-up-cal-start">Starts</Label>
                <Input
                  id="follow-up-cal-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  data-testid="follow-up-cal-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="follow-up-cal-end">Ends</Label>
                <Input
                  id="follow-up-cal-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  data-testid="follow-up-cal-end"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="follow-up-cal-invitees">
                Invitees (optional)
              </Label>
              <Input
                id="follow-up-cal-invitees"
                type="text"
                placeholder="email@example.com, another@example.com"
                value={inviteesRaw}
                onChange={(e) => setInviteesRaw(e.target.value)}
                data-testid="follow-up-cal-invitees"
              />
              <p className="text-subtle-foreground text-xs">
                Comma-separated. Google sends each one a standard invitation.
              </p>
            </div>
            <p className="text-subtle-foreground text-xs">
              Times stored in your Google Calendar in Africa/Maputo. The
              event description will link back to this RabihOS follow-up.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={create.isPending}
                data-testid="follow-up-cal-submit"
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create event
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!connected && existingLinks.length > 0 && (
          <p className="text-subtle-foreground text-xs">
            Google Calendar is disconnected. Past events stay as history pointers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
