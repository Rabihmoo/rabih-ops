import {
  useFollowUpFiltersStore,
  type FollowUpBucket,
} from '@/stores/followUpFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import {
  FOLLOW_UP_STATUSES,
  followUpStatusLabel,
} from '@/lib/follow-up-status';
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

// F1.1: status set widened to match the user-approved taxonomy. Labels
// come from the shared helper so the filter dropdown matches the badge.
const STATUSES: FollowUpStatus[] = FOLLOW_UP_STATUSES;
const CATEGORIES: FollowUpCategory[] = [
  'call',
  'whatsapp',
  'email',
  'meeting',
  'check_in_person',
];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

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
    <FilterPanel
      active={granularActive}
      buckets={<BucketGroup buckets={BUCKETS} active={bucket} onSelect={setBucket} />}
      controls={
        <>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search title, description, person…"
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
            onChange={(e) => setStatus((e.target.value as FollowUpStatus) || null)}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {followUpStatusLabel(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            className={FILTER_SELECT_CLASS}
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
