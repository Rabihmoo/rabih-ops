import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { Loader2, ExternalLink, Send } from 'lucide-react';
import {
  useRequestTelegramLink,
  useTelegramLinkStatus,
  useUnlinkTelegramSelf,
} from '@/hooks/useTelegram';
import { buildTelegramDeepLink } from '@/lib/telegram';

export function TelegramCard() {
  const status = useTelegramLinkStatus();
  const request = useRequestTelegramLink();
  const unlink = useUnlinkTelegramSelf();

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingExpiresAt, setPendingExpiresAt] = useState<string | null>(null);

  const linked = status.data?.linked === true;

  const handleRequest = async () => {
    try {
      const r = await request.mutateAsync();
      const url = buildTelegramDeepLink(r.token);
      if (!url) {
        toast({
          title: 'Bot username not configured',
          description:
            'Set VITE_TELEGRAM_BOT_USERNAME in .env so the deep-link can be built.',
          variant: 'destructive',
        });
        return;
      }
      setPendingUrl(url);
      setPendingExpiresAt(r.expires_at);
      // Open Telegram in a new tab.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Could not generate link',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Unlink Telegram? The bot will stop sending you messages.')) return;
    try {
      await unlink.mutateAsync();
      toast({ title: 'Telegram unlinked' });
      setPendingUrl(null);
      setPendingExpiresAt(null);
    } catch (err) {
      toast({
        title: 'Could not unlink',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="text-primary h-4 w-4" /> Telegram
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
            <div className="text-foreground">
              ✅ Linked
              {status.data?.tg_username && (
                <span className="text-muted-foreground"> as @{status.data.tg_username}</span>
              )}
            </div>
            {status.data?.linked_at && (
              <div className="text-subtle-foreground text-xs">
                Connected {new Date(status.data.linked_at).toLocaleDateString()}
                {status.data.last_seen_at && (
                  <>
                    {' · last seen '}
                    {new Date(status.data.last_seen_at).toLocaleString()}
                  </>
                )}
              </div>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleUnlink}
              disabled={unlink.isPending}
              data-testid="telegram-unlink-button"
            >
              {unlink.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlink Telegram
            </Button>
          </>
        )}

        {!status.isLoading && !linked && (
          <>
            <p className="text-muted-foreground">
              Link your Telegram account to receive daily summaries, task reminders,
              and to drive RabihOS by chat.
            </p>
            <Button
              size="sm"
              onClick={handleRequest}
              disabled={request.isPending}
              data-testid="telegram-link-button"
            >
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link Telegram
            </Button>
            {pendingUrl && (
              <div className="bg-surface-1 border-border space-y-1 rounded-md border p-3 text-xs">
                <div className="text-foreground">
                  Opened Telegram. If nothing happened, copy the link:
                </div>
                <a
                  href={pendingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-ink inline-flex items-center break-all"
                >
                  {pendingUrl} <ExternalLink className="ml-1 h-3 w-3" />
                </a>
                {pendingExpiresAt && (
                  <div className="text-subtle-foreground">
                    Token expires {new Date(pendingExpiresAt).toLocaleTimeString()}.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
