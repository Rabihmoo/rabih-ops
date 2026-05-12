import { Link, useNavigate } from 'react-router-dom';
import { PhoneCall, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFollowUpList } from '@/hooks/useFollowUps';
import { useFollowUpFiltersStore } from '@/stores/followUpFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { FollowUpFilterBar } from '@/components/follow-ups/FollowUpFilterBar';
import { FollowUpListItem } from '@/components/follow-ups/FollowUpListItem';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { effectiveDueDate } from '@/lib/follow-ups';
import type { FollowUpStatus } from '@/types/database';

export function FollowUpsPage() {
  const { data, isLoading, error } = useFollowUpList();
  const navigate = useNavigate();
  const canMutate = useCanMutate();
  const count = data?.length ?? 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueCount =
    data?.filter((r) => {
      const status = r.status as FollowUpStatus;
      if (status === 'done' || status === 'cancelled') return false;
      const due = effectiveDueDate(r);
      return due < todayIso;
    }).length ?? 0;
  const snoozedCount =
    data?.filter((r) => (r.status as FollowUpStatus) === 'snoozed').length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Communication"
        title="Follow-ups"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/follow-ups/new" data-testid="new-follow-up-button">
                <Plus className="mr-1 h-4 w-4" /> New follow-up
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat
                count={count}
                label={count === 1 ? 'follow-up' : 'follow-ups'}
              />
              {overdueCount > 0 && (
                <HeaderStat count={overdueCount} label="overdue" tone="destructive" />
              )}
              {snoozedCount > 0 && (
                <HeaderStat count={snoozedCount} label="snoozed" tone="warning" />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />

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
        {!isLoading && !error && data && data.length === 0 && <FollowUpsEmpty />}
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

function FollowUpsEmpty() {
  const bucket = useFollowUpFiltersStore((s) => s.bucket);
  const canMutate = useCanMutate();

  const COPY: Record<typeof bucket, { title: string; description: string }> = {
    today: {
      title: 'Nothing to chase today',
      description: 'No calls, messages, or check-ins scheduled. Inbox zero.',
    },
    overdue: {
      title: 'No overdue follow-ups',
      description: 'You\'re on top of it. Anything past due would land here.',
    },
    mine: {
      title: 'No follow-ups assigned to you',
      description:
        'Items you take ownership of (or someone hands you) will appear here.',
    },
    upcoming: {
      title: 'Nothing scheduled in the next 7 days',
      description: 'Your week is clear of planned follow-ups.',
    },
    all: {
      title: 'No follow-ups match the current filters',
      description: 'Try clearing the filters or switching the bucket.',
    },
  };

  // True all-clear: the unfiltered "all" bucket is empty. Anything else
  // is a filter result, so it gets the muted treatment per Phase 4.2.
  const isAllClear = bucket === 'all';
  const c = COPY[bucket];
  return (
    <EmptyState
      icon={isAllClear ? ShieldCheck : PhoneCall}
      title={c.title}
      description={c.description}
      tone={isAllClear ? 'hero' : 'muted'}
      size={isAllClear ? 'tall' : 'default'}
      action={
        canMutate && bucket !== 'overdue' && bucket !== 'today' ? (
          <Button size="sm" asChild>
            <Link to="/follow-ups/new">
              <Plus className="mr-1 h-4 w-4" /> New follow-up
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
