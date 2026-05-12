import { Link } from 'react-router-dom';
import { Calendar, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

// Compact inline notice for sources that are intentionally disconnected
// (Gmail / Calendar). Distinct from the warning banner — disconnect is
// a user choice, not an error.

interface SourceStatus {
  source: 'gmail' | 'calendar';
  connected: boolean | null; // null = not asked; true / false otherwise
}

const META = {
  gmail:    { label: 'Gmail',    icon: Mail,     testid: 'inbox-status-gmail' },
  calendar: { label: 'Calendar', icon: Calendar, testid: 'inbox-status-calendar' },
} as const;

export function SourceStatusNotice({ statuses }: { statuses: SourceStatus[] }) {
  // Only render notices for sources we asked about but that came back
  // explicitly disconnected. Errors are surfaced by the warning banner.
  const visible = statuses.filter((s) => s.connected === false);
  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        'border-border bg-surface-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs',
      )}
      data-testid="inbox-source-status"
    >
      {visible.map(({ source }) => {
        const m = META[source];
        const Icon = m.icon;
        return (
          <span
            key={source}
            className="text-muted-foreground inline-flex items-center gap-1.5"
            data-testid={m.testid}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{m.label} not connected.</span>
            <Link
              to="/settings"
              className="text-primary-ink hover:underline underline-offset-2"
            >
              Connect
            </Link>
          </span>
        );
      })}
    </div>
  );
}
