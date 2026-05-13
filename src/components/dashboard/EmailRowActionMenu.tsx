import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import {
  useClearEmailState,
  useSetEmailState,
} from '@/hooks/useEmailStates';
import {
  emailStatusLabel,
  type EmailStateRow,
  type EmailStatus,
} from '@/lib/email-status';

// Phase G2.3 wire-up. Tiny popover with 4-5 action buttons. ESC + click-
// outside close. Always visible on mobile; hover/focus-revealed on
// desktop (mirrors the H4.5 unlink-button pattern).
//
// "Followed up" pops a native window.prompt for the optional note —
// consistent with NoteDetail.handleArchive / LinkedRecordsPanel
// handleUnlink. Isolated to handleFollowedUp so a custom modal can
// replace it later without touching the rest of the menu.

export interface MessageSnapshot {
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string | null;
  fromAddress: string | null;
  fromName: string | null;
  snippet: string | null;
  internalDate: string | null;
}

interface Props {
  googleAccountId: string;
  message: MessageSnapshot;
  currentState: EmailStateRow | null;
}

const STATUS_ORDER: { status: EmailStatus; toastTitle: string }[] = [
  { status: 'pending',     toastTitle: 'Marked pending' },
  { status: 'followed_up', toastTitle: 'Marked followed up' },
  { status: 'done',        toastTitle: 'Marked done' },
  { status: 'dismissed',   toastTitle: 'Dismissed' },
];

export function EmailRowActionMenu({
  googleAccountId,
  message,
  currentState,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setMutation = useSetEmailState();
  const clearMutation = useClearEmailState();
  const pending = setMutation.isPending || clearMutation.isPending;

  // Close on ESC + click-outside while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const snapshotArgs = {
    googleAccountId,
    gmailMessageId: message.gmailMessageId,
    gmailThreadId: message.gmailThreadId,
    subject: message.subject,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    snippet: message.snippet,
    internalDate: message.internalDate,
  };

  async function setStatus(status: EmailStatus, note: string | null = null) {
    try {
      await setMutation.mutateAsync({ ...snapshotArgs, status, note });
      toast({
        title: STATUS_ORDER.find((s) => s.status === status)?.toastTitle ?? 'Updated',
      });
    } catch (err) {
      toast({
        title: 'Could not update status',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleFollowedUp() {
    setOpen(false);
    // Isolated to this handler so we can swap window.prompt for a
    // proper modal later without touching the rest of the menu.
    // Pre-fills with the existing note so users can edit it.
    const raw = window.prompt(
      'Followed up — optional note (or leave empty):',
      currentState?.note ?? '',
    );
    if (raw === null) return; // user clicked Cancel
    const trimmed = raw.trim();
    await setStatus('followed_up', trimmed.length > 0 ? trimmed : null);
  }

  async function handleClear() {
    setOpen(false);
    try {
      const res = await clearMutation.mutateAsync({
        googleAccountId,
        gmailMessageId: message.gmailMessageId,
      });
      toast({ title: res.removed ? 'Status cleared' : 'No status to clear' });
    } catch (err) {
      toast({
        title: 'Could not clear status',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Email actions"
        disabled={pending}
        data-testid="email-row-actions-trigger"
        // Always visible on mobile, hover/focus-revealed on desktop
        // (same pattern as the H4.5 unlink button).
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <MoreVertical className="h-4 w-4" aria-hidden />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Email actions"
          data-testid="email-row-actions-menu"
          // Anchored top-right relative to the trigger; ~180px wide
          // so the longest label fits. z-index above the dashboard
          // cards but below the toast viewport (z-[60]) so toasts
          // still surface above the menu when an action completes.
          className="border-border bg-card absolute right-0 top-full z-40 mt-1 min-w-[180px] rounded-md border py-1 shadow-lg"
        >
          {STATUS_ORDER.map(({ status }) => {
            const isCurrent = currentState?.status === status;
            return (
              <ActionButton
                key={status}
                testId={`email-row-action-${status}`}
                isCurrent={isCurrent}
                onClick={() => {
                  if (status === 'followed_up') {
                    void handleFollowedUp();
                  } else {
                    setOpen(false);
                    void setStatus(status);
                  }
                }}
              >
                {status === 'pending'     && 'Mark pending'}
                {status === 'followed_up' && 'Mark followed up'}
                {status === 'done'        && 'Mark done'}
                {status === 'dismissed'   && 'Dismiss'}
              </ActionButton>
            );
          })}

          {currentState && (
            <>
              <div className="border-border my-1 border-t" aria-hidden />
              <ActionButton
                testId="email-row-action-clear"
                isCurrent={false}
                onClick={handleClear}
              >
                Clear {emailStatusLabel(currentState.status).toLowerCase()}
              </ActionButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  isCurrent,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  isCurrent: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      // Current-state actions stay clickable (re-applying is idempotent
      // server-side, and the followed-up case lets the user UPDATE the
      // note). The checkmark + bold weight just signals "you're here".
      className={cn(
        'hover:bg-surface-1 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
        isCurrent && 'text-foreground font-medium',
        !isCurrent && 'text-foreground-72',
      )}
    >
      <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center">
        {isCurrent && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}
