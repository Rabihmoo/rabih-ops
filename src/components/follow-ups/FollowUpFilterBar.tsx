import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  useFollowUpFiltersStore,
  type FollowUpBucket,
} from '@/stores/followUpFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import type {
  FollowUpCategory,
  FollowUpStatus,
  TaskPriority,
} from '@/types/database';

const BUCKETS: { id: FollowUpBucket; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'mine', label: 'Mine' },
  { id: 'upcoming', label: 'Next 7 days' },
  { id: 'all', label: 'All' },
];

const STATUSES: FollowUpStatus[] = ['pending', 'done', 'snoozed', 'cancelled'];
const CATEGORIES: FollowUpCategory[] = [
  'call',
  'whatsapp',
  'email',
  'meeting',
  'check_in_person',
];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

const selectClass =
  'bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function FollowUpFilterBar() {
  const { bucket, branch, status, category, priority, search } =
    useFollowUpFiltersStore();
  const setBucket = useFollowUpFiltersStore((s) => s.setBucket);
  const setBranch = useFollowUpFiltersStore((s) => s.setBranch);
  const setStatus = useFollowUpFiltersStore((s) => s.setStatus);
  const setCategory = useFollowUpFiltersStore((s) => s.setCategory);
  const setPriority = useFollowUpFiltersStore((s) => s.setPriority);
  const setSearch = useFollowUpFiltersStore((s) => s.setSearch);
  const resetGranular = useFollowUpFiltersStore((s) => s.resetGranular);

  const granularActive =
    branch !== null ||
    status !== null ||
    category !== null ||
    priority !== null ||
    search.trim() !== '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              bucket === b.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, description, person…"
          className="h-9 w-full sm:max-w-xs"
        />
        <select
          aria-label="Branch"
          className={selectClass}
          value={branch ?? ''}
          onChange={(e) => setBranch(e.target.value || null)}
        >
          <option value="">All branches</option>
          {BRANCH_LIST.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={selectClass}
          value={status ?? ''}
          onChange={(e) => setStatus((e.target.value as FollowUpStatus) || null)}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          className={selectClass}
          value={category ?? ''}
          onChange={(e) => setCategory((e.target.value as FollowUpCategory) || null)}
        >
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          className={selectClass}
          value={priority ?? ''}
          onChange={(e) => setPriority((e.target.value as TaskPriority) || null)}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {granularActive && (
          <button
            type="button"
            onClick={resetGranular}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
