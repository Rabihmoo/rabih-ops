import { useMemo, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useSetFollowUpReminder } from '@/hooks/useFollowUps';
import { useTelegramLinkStatus } from '@/hooks/useTelegram';

// F1.4 — set / clear a time-of-day reminder on a follow-up.
//
// When reminder_at is set, the card shows the current time + Clear button.
// When unset, the card shows the picker form.
//
// Channels:
//   in_app   — always available, default checked
//   telegram — only listed when the caller has Telegram linked (the
//              defensive check avoids queueing reminders that'd sit
//              pending forever)
//   email    — not exposed; no dispatcher yet (F1 design, deferred)

interface Props {
  followUpId:  string;
  reminderAt:  string | null;
  canMutate:   boolean;
}

// Convert an HTML date + time pair (both local) to an ISO timestamp
// the RPC can store as timestamptz. Returns null if either is empty
// or the composite can't parse.
function composeIsoLocal(date: string, time: string): string | null {
  if (!date || !time) return null;
  // <input type="time"> may omit seconds — pad if so.
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${date}T${hhmmss}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Pretty-print the stored ISO timestamp in the operator's local TZ.
function formatLocal(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
  });
}

export function FollowUpReminderCard({
  followUpId,
  reminderAt,
  canMutate,
}: Props) {
  const setReminder      = useSetFollowUpReminder();
  const telegramStatus   = useTelegramLinkStatus();
  const telegramLinked   = telegramStatus.data?.linked === true;

  // Picker state. Default the date input to today's local date and
  // the time to a hint value (09:00) so the operator only has to
  // tweak whichever they care about.
  const todayIso = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);
  const [date, setDate]                = useState<string>(todayIso);
  const [time, setTime]                = useState<string>('09:00');
  const [channelInApp, setChannelInApp]     = useState(true);
  const [channelTelegram, setChannelTelegram] = useState(false);

  const composed = composeIsoLocal(date, time);
  const isPast = composed !== null && new Date(composed).getTime() < Date.now();

  // Build the channel list — in_app at minimum so a deselected-everything
  // state still produces something useful.
  function selectedChannels(): string[] {
    const out: string[] = [];
    if (channelInApp) out.push('in_app');
    if (channelTelegram && telegramLinked) out.push('telegram');
    if (out.length === 0) out.push('in_app');
    return out;
  }

  async function handleSet() {
    if (!composed) {
      toast({ title: 'Pick a date and time', variant: 'destructive' });
      return;
    }
    try {
      await setReminder.mutateAsync({
        id:         followUpId,
        reminderAt: composed,
        channels:   selectedChannels(),
      });
      toast({ title: 'Reminder set' });
    } catch (err) {
      toast({
        title: 'Could not set reminder',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleClear() {
    try {
      await setReminder.mutateAsync({
        id:         followUpId,
        reminderAt: null,
      });
      toast({ title: 'Reminder cleared' });
    } catch (err) {
      toast({
        title: 'Could not clear reminder',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  const pending = setReminder.isPending;

  // ============ Rendered when a reminder already exists ============
  if (reminderAt) {
    return (
      <Card data-testid="follow-up-reminder-card">
        <CardContent className="space-y-3 p-5">
          <div className="text-section-label flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" /> Reminder
          </div>
          <div className="text-foreground text-sm" data-testid="follow-up-reminder-current">
            Set for <span className="font-medium">{formatLocal(reminderAt)}</span>
          </div>
          {canMutate && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClear}
              disabled={pending}
              data-testid="follow-up-reminder-clear"
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="mr-1 h-3.5 w-3.5" />
              )}
              Clear reminder
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ============ Rendered when no reminder is set yet ============
  // Viewers see nothing — the card is admin/manager-only when there's
  // no existing reminder to display.
  if (!canMutate) return null;

  return (
    <Card data-testid="follow-up-reminder-card">
      <CardContent className="space-y-3 p-5">
        <div className="text-section-label flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" /> Reminder
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="reminder-date" className="text-xs">Date</Label>
            <Input
              id="reminder-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="follow-up-reminder-date"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reminder-time" className="text-xs">Time</Label>
            <Input
              id="reminder-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              data-testid="follow-up-reminder-time"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Channels</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="text-foreground-72 inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={channelInApp}
                onChange={(e) => setChannelInApp(e.target.checked)}
                data-testid="follow-up-reminder-channel-in_app"
              />
              In-app
            </label>
            {telegramLinked && (
              <label className="text-foreground-72 inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={channelTelegram}
                  onChange={(e) => setChannelTelegram(e.target.checked)}
                  data-testid="follow-up-reminder-channel-telegram"
                />
                Telegram
              </label>
            )}
          </div>
          {!telegramLinked && (
            <p className="text-subtle-foreground text-xs">
              Link Telegram in Settings to enable that channel.
            </p>
          )}
        </div>

        {isPast && (
          <p
            data-testid="follow-up-reminder-past-warning"
            className="text-warning-ink text-xs"
          >
            That time is in the past — the reminder will fire on the next drain cycle.
          </p>
        )}

        <div>
          <Button
            size="sm"
            onClick={handleSet}
            disabled={!composed || pending}
            data-testid="follow-up-reminder-set"
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Set reminder
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
