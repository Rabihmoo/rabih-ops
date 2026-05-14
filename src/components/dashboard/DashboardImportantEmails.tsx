import { useMemo } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useEmailLinkPresence,
  useGmailImportant,
  useGmailLinkStatus,
} from '@/hooks/useGmail';
import { useEmailStatesForUser } from '@/hooks/useEmailStates';
import type { EmailLinkPresence, EmailStateRow } from '@/lib/email-status';
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
    <ImportantBody
      accountId={accountId}
      messages={messages}
      isLoading={emails.isLoading}
      error={emails.data?.error}
      statusEmail={status.data?.email}
      statesByMessageId={statesByMessageId}
    />
  );
}

interface BodyProps {
  accountId: string | null;
  messages: GmailImportantMessage[];
  isLoading: boolean;
  error?: string;
  statusEmail?: string;
  statesByMessageId: Map<string, EmailStateRow>;
}

function ImportantBody({
  accountId,
  messages,
  isLoading,
  error,
  statusEmail,
  statesByMessageId,
}: BodyProps) {
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const presence = useEmailLinkPresence(accountId, messageIds);
  const linksByMessageId = useMemo(() => {
    const map = new Map<string, EmailLinkPresence>();
    for (const row of presence.data ?? []) {
      map.set(row.gmail_message_id, {
        hasTaskLink: row.has_task_link,
        hasFollowUpLink: row.has_follow_up_link,
      });
    }
    return map;
  }, [presence.data]);

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
            {statusEmail}
          </span>
        </div>

        {isLoading && (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && error && (
          <div className="text-destructive-ink text-xs">
            Could not load emails: {error}
          </div>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <div className="text-muted-foreground py-2 text-sm">
            No important unread emails from the last 7 days.
          </div>
        )}

        {!isLoading && messages.length > 0 && (
          <ul className="divide-border divide-y">
            {messages.map((m) => (
              <EmailRow
                key={m.id}
                message={{ ...m, snippet: m.snippet ?? '' }}
                googleAccountId={accountId}
                currentState={statesByMessageId.get(m.id) ?? null}
                linkPresence={linksByMessageId.get(m.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
