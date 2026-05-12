import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toast';
import { ExternalLink, Loader2, Mail } from 'lucide-react';
import {
  useDisconnectGmail,
  useGmailLinkStatus,
  useRequestGmailAuthorize,
} from '@/hooks/useGmail';
import { buildGmailAuthUrl } from '@/lib/gmail';

export function GmailCard() {
  const status = useGmailLinkStatus();
  const request = useRequestGmailAuthorize();
  const disconnect = useDisconnectGmail();
  const consumedRef = useRef(false);

  // Detect ?gmail=connected (or =error&reason=…) on mount.
  useEffect(() => {
    if (consumedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gmail');
    if (!result) return;
    consumedRef.current = true;

    if (result === 'connected') {
      status.refetch();
      toast({ title: 'Gmail connected' });
    } else if (result === 'error') {
      toast({
        title: 'Could not connect Gmail',
        description: params.get('reason') ?? 'Try again from the Settings card.',
        variant: 'destructive',
      });
    }

    params.delete('gmail');
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
      const built = buildGmailAuthUrl(r.state);
      if (!built.url) {
        toast({
          title: 'Cannot start Gmail OAuth',
          description: `Missing env: ${(built.missingEnv ?? []).join(', ')}`,
          variant: 'destructive',
        });
        return;
      }
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
        'Disconnect Gmail? RabihOS will stop reading your inbox. Linked email snapshots stay as history.',
      )
    )
      return;
    try {
      await disconnect.mutateAsync();
      toast({ title: 'Gmail disconnected' });
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
          <Mail className="text-primary h-4 w-4" /> Gmail (read-only)
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
              data-testid="gmail-disconnect-button"
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
              Connect Gmail so RabihOS can surface your important unread emails on
              the dashboard and let you attach them to tasks or follow-ups. We use
              read-only scope only — RabihOS never sends, deletes, marks-read or
              modifies your email.
            </p>
            <Button
              size="sm"
              variant="gradient"
              onClick={handleConnect}
              disabled={request.isPending}
              data-testid="gmail-connect-button"
            >
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect Gmail
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
