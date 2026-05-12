import { SearchInput } from '@/components/ui/search-input';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

// Topbar layout:
//   - Mobile (< md):  [ wordmark ] [ ThemeToggle ]
//                     (Sign out + identity + drawer nav live in MobileDrawer.)
//   - Desktop (>= md): [ Search (flex-1, max-w-md) ] [ ThemeToggle ] [ UserMenu ]
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
        <ThemeToggle />
        {/* User menu (desktop only — mobile uses the drawer for identity). */}
        <div className="hidden md:block">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
