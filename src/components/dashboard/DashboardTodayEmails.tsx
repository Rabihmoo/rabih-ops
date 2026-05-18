import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  useEmailLinkPresence,
  useGmailLinkStatus,
  useGmailToday,
} from '@/hooks/useGmail';
import { useEmailStatesForUser } from '@/hooks/useEmailStates';
import type { EmailLinkPresence, EmailStateRow } from '@/lib/email-status';
import type { GmailTodayMessage, GmailTodayMode } from '@/lib/gmail-today';
import { EmailRow } from './EmailRow';

// Per-session toggle storage. sessionStorage (not localStorage) so the
// choice survives reload within a session but resets cleanly on a new
// browser session — avoids stale "All" state bleeding across days.
const MODE_STORAGE_KEY = 'rabih-ops:dashboard-today-mode';

function readStoredMode(): GmailTodayMode {
  if (typeof window === 'undefined') return 'focused';
  try {
    const v = window.sessionStorage.getItem(MODE_STORAGE_KEY);
    if (v === 'all') return 'all';
    if (v === 'sent') return 'sent';
    return 'focused';
  } catch {
    return 'focused';
  }
}

function writeStoredMode(mode: GmailTodayMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Quota / private-window etc. — silently fall back to in-memory state.
  }
}

function ReconnectNotice({ statusEmail }: { statusEmail?: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="border-border mb-1 flex items-baseline justify-between gap-3 border-b pb-3">
          <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Today's emails
          </span>
          {statusEmail && (
            <span className="text-subtle-foreground hidden text-xs sm:inline">
              {statusEmail}
            </span>
          )}
        </div>
        <div className="text-foreground-72 inline-flex items-start gap-2 text-sm">
          <AlertCircle className="text-amber-600 mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Gmail needs reconnect.{' '}
            <Link
              to="/settings"
              className="text-primary-ink underline-offset-2 hover:underline"
            >
              Reconnect in Settings
            </Link>
            .
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTodayEmails() {
  const status = useGmailLinkStatus();
  const needsReconnect = status.data?.needs_reconnect === true;
  const isConnected = status.data?.connected === true;
  const [mode, setMode] = useState<GmailTodayMode>(() => readStoredMode());
  const emails = useGmailToday(isConnected, mode);
  const accountId = status.data?.google_account_id ?? null;
  // Fetch all of the caller's email_state rows for this account once
  // at the parent level (1 DB roundtrip), then look up by message_id
  // per row. Limit 200 is the G2.1 RPC cap; far more than the ~50
  // messages this card renders.
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

  // Persist mode whenever the user toggles.
  useEffect(() => {
    writeStoredMode(mode);
  }, [mode]);

  if (!isConnected && !needsReconnect) return null;

  if (needsReconnect) {
    return <ReconnectNotice statusEmail={status.data?.email} />;
  }

  const messages: GmailTodayMessage[] = emails.data?.today ?? [];

  // G3.1: batch presence lookup for the rendered message ids. Hook
  // disables itself until accountId + a non-empty id list are both
  // ready, so this is a no-op for the unconnected / empty-today case.
  return (
    <DashboardTodayEmailsBody
      accountId={accountId}
      mode={mode}
      setMode={setMode}
      messages={messages}
      isLoading={emails.isLoading}
      error={emails.data?.error}
      perFetchNeedsReconnect={emails.data?.needs_reconnect === true}
      statusEmail={status.data?.email}
      statesByMessageId={statesByMessageId}
    />
  );
}

interface BodyProps {
  accountId: string | null;
  mode: GmailTodayMode;
  setMode: (m: GmailTodayMode) => void;
  messages: GmailTodayMessage[];
  isLoading: boolean;
  error?: string;
  // True when the per-fetch response (not the cached link-status) just
  // discovered invalid_grant. Race-window safety so the card never
  // renders a raw error string.
  perFetchNeedsReconnect: boolean;
  statusEmail?: string;
  statesByMessageId: Map<string, EmailStateRow>;
}

function DashboardTodayEmailsBody({
  accountId,
  mode,
  setMode,
  messages,
  isLoading,
  error,
  perFetchNeedsReconnect,
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
        <div className="border-border mb-1 flex items-baseline justify-between gap-3 border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Today's emails
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {messages.length}
            </span>
          </div>
          <span className="text-subtle-foreground hidden text-xs sm:inline">
            {statusEmail}
          </span>
        </div>

        {/* Focused / All toggle. Chip-strip pattern — works at 390px
            without wrapping. Both buttons stay clickable while the
            opposite mode is loading. */}
        <div
          role="tablist"
          aria-label="Today filter"
          className="bg-surface-1 border-border inline-flex items-center gap-0.5 rounded-md border p-0.5 text-xs"
        >
          <ModeButton
            mode="focused"
            current={mode}
            onClick={() => setMode('focused')}
            label="Focused"
          />
          <ModeButton
            mode="all"
            current={mode}
            onClick={() => setMode('all')}
            label="All today"
          />
          <ModeButton
            mode="sent"
            current={mode}
            onClick={() => setMode('sent')}
            label="Sent"
          />
        </div>

        {isLoading && (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && perFetchNeedsReconnect && (
          <div className="text-foreground-72 inline-flex items-start gap-2 text-sm">
            <AlertCircle className="text-amber-600 mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Gmail needs reconnect.{' '}
              <Link
                to="/settings"
                className="text-primary-ink underline-offset-2 hover:underline"
              >
                Reconnect in Settings
              </Link>
              .
            </div>
          </div>
        )}

        {!isLoading && !perFetchNeedsReconnect && error && (
          <div className="text-foreground-72 text-xs">
            Could not load emails.{' '}
            <Link
              to="/settings"
              className="text-primary-ink underline-offset-2 hover:underline"
            >
              Open Settings
            </Link>
            .
          </div>
        )}

        {!isLoading && !perFetchNeedsReconnect && !error && messages.length === 0 && (
          <div className="text-muted-foreground py-2 text-sm">
            {mode === 'sent'
              ? "You haven't sent anything today."
              : mode === 'all'
                ? 'No emails today.'
                : 'No emails today in Focused. Try All today.'}
          </div>
        )}

        {!isLoading && messages.length > 0 && (
          <ul className="divide-border divide-y">
            {messages.map((m) => (
              <EmailRow
                key={m.id}
                message={m}
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

function ModeButton({
  mode,
  current,
  onClick,
  label,
}: {
  mode: GmailTodayMode;
  current: GmailTodayMode;
  onClick: () => void;
  label: string;
}) {
  const active = mode === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`today-mode-${mode}`}
      onClick={onClick}
      className={cn(
        'rounded-sm px-2.5 py-1 transition-colors',
        active
          ? 'bg-card text-foreground font-medium shadow-sm'
          : 'text-foreground-72 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
