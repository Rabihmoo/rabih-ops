import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineIndicator } from './OfflineIndicator';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="bg-background text-foreground flex h-full min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 pb-[76px] md:p-6 md:pb-6">
          <Outlet />
        </main>
        <OfflineIndicator />
      </div>
      <MobileBottomNav onMoreClick={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
