import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  HelpCircle,
  Loader2,
  MessageSquarePlus,
  Pause,
  PlayCircle,
  TimerOff,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import {
  useAddFollowUpEvent,
  useSetFollowUpStatus,
} from '@/hooks/useFollowUps';
import { followUpStatusLabel } from '@/lib/follow-up-status';
import type { FollowUpStatus } from '@/types/database';

// F1.3 — quick-action menu for FollowUpDetail. Mirrors the
// EmailRowActionMenu pattern: kebab popover with status transitions +
// note + postpone trigger. ESC + click-outside close.
//
// Each action invokes an F1.1 RPC and the trigger handles the
// status_change event row; the History feed re-renders via the detail
// query invalidation in the hooks.
//
// Postpone defers to the parent's existing inline snooze card (already
// wired to rpc_snooze_follow_up) via the onOpenPostpone callback.

type ActionKind =
  | 'working'
  | 'waiting'
  | 'no_answer'
  | 'postpone'
  | 'done'
  | 'cancelled'
  | 'note';

interface MenuItem {
  kind:      ActionKind;
  label:     string;
  icon:      React.ComponentType<{ className?: string }>;
  // Status this item moves to (null for non-status items: postpone + note).
  toStatus:  FollowUpStatus | null;
}

const ITEMS: MenuItem[] = [
  { kind: 'working',   label: 'Working on it',         icon: PlayCircle,         toStatus: 'working' },
  { kind: 'waiting',   label: 'Waiting for someone',   icon: Pause,              toStatus: 'waiting' },
  { kind: 'no_answer', label: 'No answer',             icon: HelpCircle,         toStatus: 'no_answer' },
  { kind: 'postpone',  label: 'Postpone…',             icon: TimerOff,           toStatus: null },
  { kind: 'done',      label: 'Done…',                 icon: Check,              toStatus: 'done' },
  { kind: 'cancelled', label: 'Cancel…',               icon: XCircle,            toStatus: 'cancelled' },
  { kind: 'note',      label: 'Add note…',             icon: MessageSquarePlus,  toStatus: null },
];

interface Props {
  followUpId:       string;
  currentStatus:    FollowUpStatus;
  onOpenPostpone:   () => void;
}

export function FollowUpActionMenu({
  followUpId,
  currentStatus,
  onOpenPostpone,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const setStatus = useSetFollowUpStatus();
  const addEvent  = useAddFollowUpEvent();
  const pending   = setStatus.isPending || addEvent.isPending;

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

  async function applyStatus(status: FollowUpStatus, note: string | null = null) {
    try {
      await setStatus.mutateAsync({ id: followUpId, status, note });
      toast({ title: `Set to ${followUpStatusLabel(status)}` });
    } catch (err) {
      toast({
        title: 'Could not update status',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  async function handleDone() {
    setOpen(false);
    // window.prompt mirrors EmailRowActionMenu.handleFollowedUp; can swap
    // for a custom modal later without touching the menu wiring.
    const raw = window.prompt('Outcome (optional):', '');
    if (raw === null) return; // user clicked Cancel
    const trimmed = raw.trim();
    await applyStatus('done', trimmed.length > 0 ? trimmed : null);
  }

  async function handleCancel() {
    setOpen(false);
    const raw = window.prompt('Reason for cancelling (optional):', '');
    if (raw === null) return;
    const trimmed = raw.trim();
    await applyStatus('cancelled', trimmed.length > 0 ? trimmed : null);
  }

  async function handleNote() {
    setOpen(false);
    const raw = window.prompt('Note:', '');
    if (raw === null) return;
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      toast({ title: 'Note is empty', variant: 'destructive' });
      return;
    }
    try {
      await addEvent.mutateAsync({
        id:   followUpId,
        kind: 'note',
        body: trimmed,
      });
      toast({ title: 'Note added' });
    } catch (err) {
      toast({
        title: 'Could not add note',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  function handleClick(item: MenuItem) {
    if (item.kind === 'postpone') {
      setOpen(false);
      onOpenPostpone();
      return;
    }
    if (item.kind === 'done') {
      void handleDone();
      return;
    }
    if (item.kind === 'cancelled') {
      void handleCancel();
      return;
    }
    if (item.kind === 'note') {
      void handleNote();
      return;
    }
    // Direct status transitions — no prompt.
    setOpen(false);
    if (item.toStatus) void applyStatus(item.toStatus);
  }

  return (
    <div className="relative shrink-0">
      <Button
        ref={triggerRef}
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="follow-up-actions-trigger"
      >
        {pending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        Actions
        <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden />
      </Button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Follow-up actions"
          data-testid="follow-up-actions-menu"
          className="border-border bg-card absolute right-0 top-full z-40 mt-1 min-w-[220px] rounded-md border py-1 shadow-lg"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isCurrent = item.toStatus !== null && currentStatus === item.toStatus;
            return (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                data-testid={`follow-up-action-${item.kind}`}
                onClick={() => handleClick(item)}
                disabled={isCurrent}
                className={cn(
                  'hover:bg-surface-1 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  isCurrent
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-foreground-72',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {isCurrent && (
                  <span className="text-subtle-foreground text-xs">current</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

