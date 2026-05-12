import { NavLink } from 'react-router-dom';
import { Home, Inbox, ListChecks, PhoneCall, Menu, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInboxBadgeCount } from '@/hooks/useInboxBadge';

// Five-slot mobile bottom nav. Replaces the previous ten-slot bar which
// truncated labels and made tap targets unreachable. Slot 5 ("More")
// opens the secondary drawer that holds the remaining nav, the user
// strip, and the theme toggle.
//
// `aria-label="Primary"` is preserved verbatim so the original mobile
// nav contract holds for assistive tech and any future test selectors.

interface BottomNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badgeKey?: 'inbox';
}

const BOTTOM_NAV: BottomNavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/follow-ups', label: 'Follow-ups', icon: PhoneCall },
];

const slotClass = (isActive: boolean) =>
  cn(
    'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors',
    'before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:transition-colors',
    isActive
      ? 'text-primary-ink before:bg-primary'
      : 'text-foreground-72 hover:text-foreground before:bg-transparent',
  );

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const inboxBadge = useInboxBadgeCount();
  return (
    <nav
      className="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-40 flex h-[60px] border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {BOTTOM_NAV.map(({ to, label, icon: Icon, end, badgeKey }) => {
        const badge = badgeKey === 'inbox' ? inboxBadge : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => slotClass(isActive)}
          >
            <div className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              {badge > 0 && (
                <span
                  data-testid={`mobile-badge-${badgeKey}`}
                  className="bg-destructive text-destructive-foreground absolute -right-2 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="font-medium tracking-wide">{label}</span>
          </NavLink>
        );
      })}

      <button
        type="button"
        onClick={onMoreClick}
        className={cn(
          'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors',
          'text-foreground-72 hover:text-foreground',
        )}
        aria-haspopup="dialog"
        data-testid="mobile-drawer-trigger"
      >
        <Menu className="h-5 w-5" aria-hidden />
        <span className="font-medium tracking-wide">More</span>
      </button>
    </nav>
  );
}
