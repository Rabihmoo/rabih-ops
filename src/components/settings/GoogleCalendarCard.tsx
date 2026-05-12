import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toast';
import { Calendar, ExternalLink, Loader2 } from 'lucide-react';
import {
  useCalendarLinkStatus,
  useDisconnectCalendar,
  useRequestCalendarAuthorize,
} from '@/hooks/useGoogleCalendar';
import { buildGoogleAuthUrl } from '@/lib/google-calendar';

export function GoogleCalendarCard() {
  const status = useCalendarLinkStatus();
  const request = useRequestCalendarAuthorize();
  const disconnect = useDisconnectCalendar();
  const consumedRef = useRef(false);

  // Detect ?google_calendar=connected (or =error&reason=…) on mount.
  // Refetch status, toast, and strip the param so reload doesn't re-fire.
  useEffect(() => {
    if (consumedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_calendar');
    if (!result) return;
    consumedRef.current = true;

    if (result === 'connected') {
      status.refetch();
      toast({ title: 'Google Calendar connected' });
    } else if (result === 'error') {
      toast({
        title: 'Could not connect Google Calendar',
        description: params.get('reason') ?? 'Try again from the Settings card.',
        variant: 'destructive',
      });
    }

    params.delete('google_calendar');
    params.delete('reason');
    const next =
      window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', next);
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linked = status.data?.connected === true;

  const handleConnect = async () => {
    try {
      const r = await request.mutateAsync('/settings');
      const built = buildGoogleAuthUrl(r.state);
      if (!built.url) {
        toast({
          title: 'Cannot start Google OAuth',
          description: `Missing env: ${(built.missingEnv ?? []).join(', ')}`,
          variant: 'destructive',
        });
        return;
      }
      // Full-redirect (NOT new tab) — Google's consent flow can't be
      // popped open reliably and we need to land back on this exact page.
      window.location.href = built.url;
    } catch (err) {
      toast({
        title: 'Could not start OAuth',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Disconnect Google Calendar? RabihOS will stop creating or reading events. Past calendar event links stay as history.',
      )
    )
      return;
    try {
      await disconnect.mutateAsync();
      toast({ title: 'Google Calendar disconnected' });
    } catch (err) {
      toast({
        title: 'Could not disconnect',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="text-primary h-4 w-4" /> Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.isLoading && (
          <div className="text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Checking link…
          </div>
        )}

        {!status.isLoading && linked && (
          <>
            <div className="flex items-center gap-2">
              <StatusChip tone="success" size="xs" dot>Connected</StatusChip>
              {status.data?.email && (
                <span className="text-foreground-72 text-xs">as {status.data.email}</span>
              )}
            </div>
            {status.data?.connected_at && (
              <div className="text-subtle-foreground text-xs">
                Linked {new Date(status.data.connected_at).toLocaleDateString()}
                {status.data.last_used_at && (
                  <>
                    {' · last used '}
                    {new Date(status.data.last_used_at).toLocaleString()}
                  </>
                )}
              </div>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
              data-testid="calendar-disconnect-button"
            >
              {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disconnect
            </Button>
          </>
        )}

        {!status.isLoading && !linked && (
          <>
            <div>
              <StatusChip tone="muted" size="xs" dot>Not connected</StatusChip>
            </div>
            <p className="text-foreground-72">
              Connect your Google account to see today's events on the dashboard
              and add tasks straight to your calendar. Tokens stay server-side; the
              app never sees them.
            </p>
            <Button
              size="sm"
              variant="gradient"
              onClick={handleConnect}
              disabled={request.isPending}
              data-testid="calendar-connect-button"
            >
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect Google Calendar
            </Button>
            <div className="text-subtle-foreground text-xs">
              You'll be redirected to Google to authorise{' '}
              <ExternalLink className="inline h-3 w-3" />, then bounced back here.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
