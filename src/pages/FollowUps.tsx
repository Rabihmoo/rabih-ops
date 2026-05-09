import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFollowUpList } from '@/hooks/useFollowUps';
import { useFollowUpFiltersStore } from '@/stores/followUpFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { FollowUpFilterBar } from '@/components/follow-ups/FollowUpFilterBar';
import { FollowUpListItem } from '@/components/follow-ups/FollowUpListItem';

export function FollowUpsPage() {
  const { data, isLoading, error } = useFollowUpList();
  const navigate = useNavigate();
  const canMutate = useCanMutate();
  const count = data?.length ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Follow-ups
          </h1>
          <p className="text-muted-foreground text-sm">
            {data
              ? count === 0
                ? 'No matching follow-ups'
                : `${count} ${count === 1 ? 'follow-up' : 'follow-ups'}`
              : 'Loading follow-ups…'}
          </p>
        </div>
        {canMutate && (
          <Button size="sm" asChild>
            <Link to="/follow-ups/new" data-testid="new-follow-up-button">
              <Plus className="mr-1 h-4 w-4" /> New follow-up
            </Link>
          </Button>
        )}
      </header>

      <FollowUpFilterBar />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading follow-ups…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load follow-ups: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && <EmptyState />}
        {!isLoading && !error && data && data.length > 0 && (
          <ul>
            {data.map((followUp) => (
              <li key={followUp.id} className="last:[&>button]:border-b-0">
                <FollowUpListItem
                  followUp={followUp}
                  onSelect={(id) => navigate(`/follow-ups/${id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const bucket = useFollowUpFiltersStore((s) => s.bucket);
  const messages: Record<typeof bucket, string> = {
    today: 'Nothing to chase today.',
    overdue: 'No overdue follow-ups. Inbox zero.',
    mine: 'No follow-ups assigned to you.',
    upcoming: 'No follow-ups scheduled in the next 7 days.',
    all: 'No follow-ups match the current filters.',
  };
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-foreground text-base font-semibold tracking-tight">
        All clear.
      </div>
      <div className="text-muted-foreground max-w-md text-sm">{messages[bucket]}</div>
    </div>
  );
}
