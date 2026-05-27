import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineIndicator } from './OfflineIndicator';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';
import { CommandPalette } from '@/components/shared/CommandPalette';

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  // Holds the "More" bottom-nav button so onClose can hand focus back
  // to it after ESC / backdrop / close-button / route-change closes
  // the drawer. Keyboard users keep their place in the bottom bar.
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    // Defer focus until after the close transition starts so the
    // browser doesn't fight us mid-animation.
    window.setTimeout(() => moreTriggerRef.current?.focus(), 0);
  };

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Global Cmd/Ctrl+K listener — works even when focus is inside an input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleNavigate = useCallback(
    (href: string) => navigate(href),
    [navigate],
  );

  return (
    <div className="bg-background text-foreground flex h-full min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearchClick={openPalette} />
        <main className="flex-1 overflow-y-auto p-4 pb-[76px] md:p-6 md:pb-6">
          <Outlet />
        </main>
        <OfflineIndicator />
      </div>
      <MobileBottomNav
        onMoreClick={() => setDrawerOpen(true)}
        moreTriggerRef={moreTriggerRef}
      />
      <MobileDrawer open={drawerOpen} onClose={handleDrawerClose} />
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
