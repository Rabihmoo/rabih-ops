import { NavLink, useLocation } from 'react-router-dom';
import {
  Inbox,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  ClipboardCheck,
  Receipt,
  Repeat,
  FileText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCH_LIST } from '@/lib/branches';
import { useActivityInbox } from '@/hooks/useActivityInbox';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Optional accessor that returns a badge count for this nav entry. */
  badgeKey?: 'inbox';
  /** Extra path prefixes that should ALSO highlight this nav entry. */
  alsoActiveOn?: string[];
}

const NAV: NavItem[] = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/fixed-tasks', label: 'Fixed tasks', icon: Repeat },
  { to: '/follow-ups', label: 'Follow-ups', icon: PhoneCall },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/purchases', label: 'Purchasing', icon: Receipt },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/directory', label: 'Directory', icon: Users, alsoActiveOn: ['/companies', '/contacts'] },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// DB-owned sources only: tasks, follow-ups, purchases, findings, documents,
// telegram reminders. Gmail and Calendar are intentionally excluded from the
// sidebar badge so the user isn't pestered by routine inbox traffic.
const DB_OWNED_FOR_BADGE = new Set([
  'task',
  'follow_up',
  'purchase',
  'inspection_finding',
  'document',
  'telegram',
]);

function useInboxBadgeCount(): number {
  const inbox = useActivityInbox();
  const items = inbox.data?.items ?? [];
  return items.filter(
    (i) =>
      DB_OWNED_FOR_BADGE.has(i.source) &&
      (i.severity === 'critical' ||
        i.severity === 'overdue' ||
        i.severity === 'due_today'),
  ).length;
}

// Shared active/idle classes used by both desktop sidebar and mobile bottom
// nav. The desktop layout adds the left-edge bar; mobile uses a top bar.
const desktopLink = (isActive: boolean) =>
  cn(
    'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
    'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:transition-colors',
    isActive
      ? 'bg-primary-soft text-primary-ink font-medium before:bg-primary'
      : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground before:bg-transparent',
  );

function alsoActive(pathname: string, alsoActiveOn: string[] | undefined): boolean {
  if (!alsoActiveOn) return false;
  return alsoActiveOn.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export function Sidebar() {
  const inboxBadge = useInboxBadgeCount();
  const { pathname } = useLocation();
  return (
    <aside className="bg-surface-1 border-border hidden border-r md:flex md:w-60 md:flex-col">
      <div className="border-border flex h-14 items-center border-b px-5">
        <div>
          <div className="text-foreground text-lg font-semibold tracking-tight leading-none">
            RabihOS
          </div>
          <div className="text-subtle-foreground mt-1 text-[11px] tracking-wide">
            Operations console
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end, badgeKey, alsoActiveOn }) => {
            const badge = badgeKey === 'inbox' ? inboxBadge : 0;
            const forceActive = alsoActive(pathname, alsoActiveOn);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => desktopLink(isActive || forceActive)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge > 0 && (
                    <span
                      data-testid={`sidebar-badge-${badgeKey}`}
                      className="bg-destructive text-destructive-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 px-3">
          <div className="text-section-label mb-2">Branches</div>
          <ul className="space-y-1">
            {BRANCH_LIST.map((b) => (
              <li
                key={b.code}
                className="text-foreground/85 flex items-center gap-2.5 py-1 text-sm"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span className="truncate">{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-border text-subtle-foreground border-t px-5 py-3 text-[11px] tracking-wide">
        v0.1 · staging
      </div>
    </aside>
  );
}

export function MobileNav() {
  const inboxBadge = useInboxBadgeCount();
  const { pathname } = useLocation();
  return (
    <nav
      className="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-40 flex h-16 border-t md:hidden"
      aria-label="Primary"
    >
      {NAV.map(({ to, label, icon: Icon, end, badgeKey, alsoActiveOn }) => {
        const badge = badgeKey === 'inbox' ? inboxBadge : 0;
        const forceActive = alsoActive(pathname, alsoActiveOn);
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors',
                'before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:transition-colors',
                (isActive || forceActive)
                  ? 'text-primary-ink before:bg-primary'
                  : 'text-muted-foreground hover:text-foreground before:bg-transparent',
              )
            }
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {badge > 0 && (
                <span className="bg-destructive text-destructive-foreground absolute -right-2 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="font-medium tracking-wide">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
