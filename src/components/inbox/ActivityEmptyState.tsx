import { Inbox, ShieldCheck } from 'lucide-react';

export function ActivityEmptyState({
  filtered,
  filterLabel,
}: {
  filtered: boolean;
  filterLabel?: string;
}) {
  if (filtered) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center">
        <Inbox className="text-subtle-foreground h-8 w-8" />
        <div className="text-foreground text-sm font-medium">
          Nothing in this filter right now.
        </div>
        <div className="text-xs">
          {filterLabel ? `No ${filterLabel} items` : 'Try a different filter or clear it.'}
        </div>
      </div>
    );
  }
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center">
      <ShieldCheck className="text-primary h-8 w-8" />
      <div className="text-foreground text-sm font-medium">
        Inbox zero. Nothing waiting for you.
      </div>
      <div className="text-xs">
        No overdue work, no critical findings, no unread email flagged important.
      </div>
    </div>
  );
}
