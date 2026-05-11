import { ExternalLink, Loader2, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGmailImportant, useGmailLinkStatus } from '@/hooks/useGmail';
import type { GmailImportantMessage } from '@/lib/gmail';

function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DashboardImportantEmails() {
  const status = useGmailLinkStatus();
  const emails = useGmailImportant(status.data?.connected === true);

  if (!status.data?.connected) return null;

  const messages = emails.data?.messages ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="border-border mb-1 flex items-baseline justify-between border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Important emails
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {messages.length}
            </span>
          </div>
          <span className="text-subtle-foreground text-xs">
            {status.data?.email}
          </span>
        </div>

        {emails.isLoading && (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!emails.isLoading && emails.data?.error && (
          <div className="text-destructive-ink text-xs">
            Could not load emails: {emails.data.error}
          </div>
        )}

        {!emails.isLoading && !emails.data?.error && messages.length === 0 && (
          <div className="text-muted-foreground py-2 text-sm">
            No important unread emails right now.
          </div>
        )}

        {!emails.isLoading && messages.length > 0 && (
          <ul className="divide-border divide-y">
            {messages.map((m: GmailImportantMessage) => (
              <li
                key={m.id}
                className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-foreground line-clamp-1 text-sm font-medium">
                    {m.subject ?? '(no subject)'}
                  </div>
                  <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    <span className="text-foreground/85">
                      {m.from_name ?? m.from_address ?? 'Unknown sender'}
                    </span>
                    {m.snippet && (
                      <>
                        <span className="text-subtle-foreground"> — </span>
                        <span>{m.snippet}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-subtle-foreground w-16 shrink-0 text-right text-xs tabular-nums">
                  {whenLabel(m.internal_date)}
                </span>
                {m.html_link && (
                  <a
                    href={m.html_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in Gmail"
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
