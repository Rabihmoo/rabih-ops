import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="bg-destructive text-destructive-foreground fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs shadow-lg md:bottom-6"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline — changes will sync when reconnected</span>
    </div>
  );
}
