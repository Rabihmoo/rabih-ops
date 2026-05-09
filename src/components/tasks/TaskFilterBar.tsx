import { useTaskFiltersStore, type TaskBucket } from '@/stores/taskFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import type { TaskPriority, TaskStatus } from '@/types/database';

const BUCKETS: { id: TaskBucket; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'mine', label: 'My tasks' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'repeat', label: 'Needs repeat' },
  { id: 'active', label: 'Active' },
  { id: 'history', label: 'History' },
];

const STATUSES: TaskStatus[] = [
  'not_started',
  'started',
  'working',
  'waiting_for_someone',
  'delayed',
  'needs_repeat',
  'finished',
  'archived',
];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

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
    <FilterPanel
      active={granularActive}
      buckets={<BucketGroup buckets={BUCKETS} active={bucket} onSelect={setBucket} />}
      controls={
        <>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search title or description…"
          />
          <select
            aria-label="Branch"
            className={FILTER_SELECT_CLASS}
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
            className={FILTER_SELECT_CLASS}
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value as TaskStatus) || null)}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className={FILTER_SELECT_CLASS}
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
              Clear
            </button>
          )}
        </>
      }
    />
  );
}
