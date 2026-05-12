import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ClipboardCheck,
  FileText,
  LogOut,
  NotebookPen,
  Receipt,
  Repeat,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCH_LIST } from '@/lib/branches';
import { useCurrentUserProfile, useSession, signOut } from '@/hooks/useAuth';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';

// Secondary mobile drawer. Holds everything that wouldn't fit in the
// 5-slot bottom bar plus the user identity strip and theme controls.
//
// Accessibility (kept simple — no focus-trap library per the
// implementation constraints):
//   - Escape closes
//   - Backdrop click closes
//   - Route change closes (NavLink inside auto-closes)
//   - Body scroll locks while open
//   - Close button is auto-focused on open
//   - role="dialog" + aria-modal + aria-label

interface DrawerNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  alsoActiveOn?: string[];
}

const DRAWER_NAV: DrawerNavItem[] = [
  { to: '/fixed-tasks', label: 'Fixed tasks', icon: Repeat },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/purchases', label: 'Purchasing', icon: Receipt },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  {
    to: '/directory',
    label: 'Directory',
    icon: Users,
    alsoActiveOn: ['/companies', '/contacts'],
  },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const ROLE_CHIP: Record<string, { label: string; tone: StatusTone }> = {
  admin:   { label: 'Admin',   tone: 'info' },
  ceo:     { label: 'CEO',     tone: 'info' },
  manager: { label: 'Manager', tone: 'muted' },
  viewer:  { label: 'Viewer',  tone: 'muted' },
};

function alsoActive(pathname: string, alsoActiveOn: string[] | undefined): boolean {
  if (!alsoActiveOn) return false;
  return alsoActiveOn.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

const rowClass = (isActive: boolean) =>
  cn(
    'flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors',
    isActive
      ? 'bg-primary-soft text-primary-ink font-medium'
      : 'text-foreground-72 hover:bg-surface-2 hover:text-foreground active:bg-surface-3',
  );

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevPath = useRef(pathname);

  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const displayName = profile?.full_name ?? session?.user.email ?? '';
  const roleChip = profile?.role ? ROLE_CHIP[profile.role] : undefined;

  // Close on route change.
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      if (open) onClose();
    }
  }, [pathname, open, onClose]);

  // ESC closes; body scroll lock; focus close button on open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Defer focus so the transition starts before focus jumps.
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Secondary navigation"
        aria-hidden={!open}
        data-testid="mobile-drawer"
        data-state={open ? 'open' : 'closed'}
        className={cn(
          'bg-surface-2 border-border fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l shadow-lg transition-transform duration-200 md:hidden',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="border-border flex h-14 items-center justify-between gap-3 border-b px-4">
          <div className="text-foreground text-sm font-semibold tracking-tight">Menu</div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-foreground-72 hover:bg-surface-3 hover:text-foreground focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            data-testid="mobile-drawer-close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* User identity strip */}
          {displayName && (
            <div className="border-border flex items-center gap-3 border-b px-4 py-3">
              <Avatar name={displayName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate text-sm font-medium">
                  {displayName}
                </div>
                {roleChip && (
                  <div className="mt-1">
                    <StatusChip tone={roleChip.tone} size="xs">
                      {roleChip.label}
                    </StatusChip>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Theme toggle row */}
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <span className="text-foreground-72 text-sm">Theme</span>
            <ThemeToggle />
          </div>

          {/* Drawer nav (items not in the bottom bar) */}
          <nav className="px-2 py-3" aria-label="Secondary">
            <ul className="space-y-0.5">
              {DRAWER_NAV.map(({ to, label, icon: Icon, alsoActiveOn }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      rowClass(isActive || alsoActive(pathname, alsoActiveOn))
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Branches legend */}
          <div className="border-border border-t px-4 py-3">
            <div className="text-section-label mb-2">Branches</div>
            <ul className="space-y-1">
              {BRANCH_LIST.map((b) => (
                <li
                  key={b.code}
                  className="text-foreground-72 flex items-center gap-2.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="truncate">{b.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-border space-y-3 border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void signOut()}
            className="w-full justify-center"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
          <div className="flex items-center justify-between">
            <StatusChip tone="muted" size="xs">staging</StatusChip>
            <span className="text-subtle-foreground text-[11px] tracking-wide">v0.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}
