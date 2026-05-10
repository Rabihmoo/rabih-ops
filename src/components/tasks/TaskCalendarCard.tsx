import { useState } from 'react';
import { Calendar, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import {
  useCalendarLinkStatus,
  useCalendarLinksForTask,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useGoogleCalendar';
import type { TaskRow } from '@/types/database';

function pad(n: number) { return String(n).padStart(2, '0'); }
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nextRoundHourDefaults(): { start: string; end: string } {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
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

export function TaskCalendarCard({ task }: { task: TaskRow }) {
  const status = useCalendarLinkStatus();
  const links = useCalendarLinksForTask(task.id);
  const create = useCreateCalendarEvent();
  const remove = useDeleteCalendarEvent();

  const defaults = nextRoundHourDefaults();
  const [showForm, setShowForm] = useState(false);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);

  const connected = status.data?.connected === true;
  const existingLinks = links.data ?? [];

  // Hide entirely when not connected AND no historical links exist —
  // Settings is the entry point for connecting.
  if (!connected && existingLinks.length === 0) return null;

  const handleSubmit = async () => {
    try {
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end).toISOString();
      if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
        toast({ title: 'Invalid date/time', variant: 'destructive' });
        return;
      }
      if (new Date(end) <= new Date(start)) {
        toast({ title: 'End must be after start', variant: 'destructive' });
        return;
      }
      await create.mutateAsync({
        entity_type: 'task',
        entity_id: task.id,
        start: startIso,
        end: endIso,
      });
      toast({ title: 'Calendar event created' });
      setShowForm(false);
    } catch (err) {
      toast({
        title: 'Could not create calendar event',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async (linkId: number) => {
    if (!confirm('Remove this calendar event from Google Calendar?')) return;
    try {
      await remove.mutateAsync(linkId);
      toast({ title: 'Calendar event removed' });
    } catch (err) {
      toast({
        title: 'Could not remove calendar event',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-section-label flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" /> Calendar
          </div>
          {connected && !showForm && existingLinks.length === 0 && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="task-add-to-calendar-button"
            >
              <Plus className="mr-1 h-4 w-4" /> Add to Calendar
            </Button>
          )}
        </div>

        {existingLinks.map((l) => (
          <div
            key={l.id}
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
            {l.mine && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemove(l.id)}
                disabled={remove.isPending}
                aria-label="Remove from calendar"
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
                <Label htmlFor="cal-start">Starts</Label>
                <Input
                  id="cal-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">Ends</Label>
                <Input
                  id="cal-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-subtle-foreground text-xs">
              Times stored in your Google Calendar in Africa/Maputo. The
              event description will link back to this RabihOS task.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={create.isPending}
                data-testid="task-create-event-submit"
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create event
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
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
