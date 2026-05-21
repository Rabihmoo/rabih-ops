import { NavLink } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

// Topbar layout:
//   - Mobile (< md):  [ wordmark ] [ NotificationsBell ] [ ThemeToggle ]
//                     (Sign out + identity + drawer nav live in MobileDrawer.)
//   - Desktop (>= md): [ Search (flex-1, max-w-md) ] [ NotificationsBell ] [ ThemeToggle ] [ UserMenu ]
//
// Search is cosmetic-only in Phase 3 — no submit handler, no Cmd-K wiring.
// The ⌘K hint is rendered for visual continuity with the rest of the UI;
// the keyboard shortcut lands in Phase 4 alongside the command palette.

export function TopBar() {
  return (
    <header className="bg-background/80 border-border supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md md:px-6">
      {/* Mobile wordmark — desktop hides it because the sidebar carries the brand. */}
      <div className="text-foreground text-base font-semibold tracking-tight md:hidden">
        RabihOS
      </div>

      {/* Desktop search shell. */}
      <div className="hidden md:flex md:flex-1 md:max-w-md">
        <SearchInput
          aria-label="Search"
          placeholder="Search tasks, contacts, documents…"
          kbdHint="⌘K"
          data-testid="topbar-search"
          // Read-only for Phase 3 — no behaviour wired yet. Removing the
          // `readOnly` attribute is all that's needed when Cmd-K palette
          // lands in Phase 4. Keeping the input enabled would let users
          // type into a dead field.
          readOnly
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
        <NotificationsBell />
        <ThemeToggle />
        {/* User menu (desktop only — mobile uses the drawer for identity). */}
        <div className="hidden md:block">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

// Bell button with unread count overlay. The unread query runs on a
// 30s stale time + window-focus refetch (configured in the hook), so a
// tab-switch refreshes the badge without manual polling. Hidden when
// the count is 0 — quiet topbar is part of the design.
function NotificationsBell() {
  const { data } = useUnreadNotificationCount();
  const count = data ?? 0;
  const hasUnread = count > 0;
  const label =
    count === 0
      ? 'Notifications'
      : `Notifications, ${count} unread`;

  return (
    <NavLink
      to="/notifications"
      aria-label={label}
      data-testid="topbar-notifications-button"
      className={({ isActive }) =>
        cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
          isActive
            ? 'bg-primary-soft text-primary-ink'
            : 'text-foreground-72 hover:bg-surface-2 hover:text-foreground',
        )
      }
    >
      <Bell className="h-5 w-5" aria-hidden />
      {hasUnread && (
        <span
          data-testid="topbar-notifications-badge"
          aria-hidden
          className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}
