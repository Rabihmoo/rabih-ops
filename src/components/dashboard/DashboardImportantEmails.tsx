import { useMemo } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGmailImportant, useGmailLinkStatus } from '@/hooks/useGmail';
import { useEmailStatesForUser } from '@/hooks/useEmailStates';
import type { EmailStateRow } from '@/lib/email-status';
import type { GmailImportantMessage } from '@/lib/gmail';
import { EmailRow } from './EmailRow';

export function DashboardImportantEmails() {
  const status = useGmailLinkStatus();
  const emails = useGmailImportant(status.data?.connected === true);
  const accountId = status.data?.google_account_id ?? null;
  // Same parent-level state fetch as DashboardTodayEmails — single
  // DB roundtrip per dashboard load, looked up per row by message_id.
  const states = useEmailStatesForUser({
    googleAccountId: accountId,
    limit: 200,
  });

  const statesByMessageId = useMemo(() => {
    const map = new Map<string, EmailStateRow>();
    for (const s of states.data ?? []) {
      map.set(s.gmail_message_id, s);
    }
    return map;
  }, [states.data]);

  if (!status.data?.connected) return null;

  const messages: GmailImportantMessage[] = emails.data?.messages ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="border-border mb-1 flex items-baseline justify-between border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Important this week
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
            No important unread emails from the last 7 days.
          </div>
        )}

        {!emails.isLoading && messages.length > 0 && (
          <ul className="divide-border divide-y">
            {messages.map((m) => (
              <EmailRow
                key={m.id}
                message={{ ...m, snippet: m.snippet ?? '' }}
                googleAccountId={accountId}
                currentState={statesByMessageId.get(m.id) ?? null}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
