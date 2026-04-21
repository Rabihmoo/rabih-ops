import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineIndicator } from './OfflineIndicator';

export function AppLayout() {
  return (
    <div className="bg-background text-foreground flex h-full min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
        <OfflineIndicator />
      </div>
    </div>
  );
}
