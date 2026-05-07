import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useTaskFiltersStore, type TaskBucket } from '@/stores/taskFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import type { TaskPriority, TaskStatus } from '@/types/database';

const BUCKETS: { id: TaskBucket; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'mine', label: 'My tasks' },
  { id: 'waiting', label: 'Waiting on others' },
  { id: 'all', label: 'All' },
];

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

const selectClass =
  'bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function TaskFilterBar() {
  const { bucket, branch, status, priority, search } = useTaskFiltersStore();
  const setBucket = useTaskFiltersStore((s) => s.setBucket);
  const setBranch = useTaskFiltersStore((s) => s.setBranch);
  const setStatus = useTaskFiltersStore((s) => s.setStatus);
  const setPriority = useTaskFiltersStore((s) => s.setPriority);
  const setSearch = useTaskFiltersStore((s) => s.setSearch);
  const resetGranular = useTaskFiltersStore((s) => s.resetGranular);

  const granularActive =
    branch !== null || status !== null || priority !== null || search.trim() !== '';

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
          placeholder="Search title or description…"
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
          onChange={(e) => setStatus((e.target.value as TaskStatus) || null)}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
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
