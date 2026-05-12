import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUserProfile, useSession, signOut } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/avatar';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';

// Desktop-only user menu. Trigger: avatar + first name + chevron.
// Popover content: identity header (full name, email, role chip) +
// Sign out action.
//
// No popover library — small controlled state, click-outside via
// document mousedown, Escape close. Width is constrained so a long
// email doesn't pull the topbar layout around.

const ROLE_CHIP: Record<string, { label: string; tone: StatusTone }> = {
  admin:   { label: 'Admin',   tone: 'info' },
  ceo:     { label: 'CEO',     tone: 'info' },
  manager: { label: 'Manager', tone: 'muted' },
  viewer:  { label: 'Viewer',  tone: 'muted' },
};

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // Email-style logins: show the bit before the @.
  if (trimmed.includes('@')) return trimmed.split('@')[0]!;
  return trimmed.split(/\s+/)[0]!;
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const fullName = profile?.full_name ?? session?.user.email ?? '';
  const email = session?.user.email ?? '';
  const roleChip = profile?.role ? ROLE_CHIP[profile.role] : undefined;

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!fullName) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="user-menu-trigger"
        className={cn(
          'flex h-9 items-center gap-2 rounded-pill border border-transparent px-2 text-sm transition-colors',
          'hover:bg-surface-1 hover:border-border',
          'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
          open && 'bg-surface-1 border-border',
        )}
      >
        <Avatar name={fullName} size="sm" />
        <span className="text-foreground max-w-[10ch] truncate font-medium">
          {firstName(fullName)}
        </span>
        <ChevronDown
          className={cn('text-foreground-56 h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          data-testid="user-menu"
          className="bg-popover border-border absolute right-0 top-full z-40 mt-2 w-64 rounded-md border shadow-lg"
        >
          {/* Identity header */}
          <div className="border-border border-b px-3 py-3">
            <div className="text-foreground truncate text-sm font-medium">{fullName}</div>
            {email && fullName !== email && (
              <div className="text-foreground-56 truncate text-xs">{email}</div>
            )}
            {roleChip && (
              <div className="mt-1.5">
                <StatusChip tone={roleChip.tone} size="xs">
                  {roleChip.label}
                </StatusChip>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors',
                'text-foreground-72 hover:bg-surface-2 hover:text-foreground',
                'focus-visible:bg-surface-2 focus-visible:outline-none',
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
