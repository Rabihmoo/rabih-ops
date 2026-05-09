import {
  useInspectionFiltersStore,
  type InspectionBucket,
} from '@/stores/inspectionFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import type { InspectionArea, InspectionResult } from '@/types/database';

const BUCKETS: { id: InspectionBucket; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Issues' },
  { id: 'mine', label: 'Mine' },
  { id: 'all', label: 'All' },
];

const AREAS: InspectionArea[] = [
  'kitchen',
  'storage',
  'service_area',
  'cold_room',
  'dry_store',
  'staff_area',
  'full_branch',
];

const RESULTS: InspectionResult[] = ['pending', 'pass', 'issues_found', 'failed'];

export function InspectionFilterBar() {
  const { bucket, branch, area, result, search } = useInspectionFiltersStore();
  const setBucket = useInspectionFiltersStore((s) => s.setBucket);
  const setBranch = useInspectionFiltersStore((s) => s.setBranch);
  const setArea = useInspectionFiltersStore((s) => s.setArea);
  const setResult = useInspectionFiltersStore((s) => s.setResult);
  const setSearch = useInspectionFiltersStore((s) => s.setSearch);
  const resetGranular = useInspectionFiltersStore((s) => s.resetGranular);

  const granularActive =
    branch !== null || area !== null || result !== null || search.trim() !== '';

  return (
    <FilterPanel
      active={granularActive}
      buckets={<BucketGroup buckets={BUCKETS} active={bucket} onSelect={setBucket} />}
      controls={
        <>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search general notes…"
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
            aria-label="Area"
            className={FILTER_SELECT_CLASS}
            value={area ?? ''}
            onChange={(e) => setArea((e.target.value as InspectionArea) || null)}
          >
            <option value="">Any area</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            aria-label="Result"
            className={FILTER_SELECT_CLASS}
            value={result ?? ''}
            onChange={(e) => setResult((e.target.value as InspectionResult) || null)}
          >
            <option value="">Any result</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
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
