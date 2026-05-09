import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  useInspectionFiltersStore,
  type InspectionBucket,
} from '@/stores/inspectionFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
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

const selectClass =
  'bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={cn(
              'rounded-pill border px-3 py-1 text-xs font-medium transition-colors',
              bucket === b.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-surface-1 hover:text-foreground',
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
          placeholder="Search general notes…"
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
          aria-label="Area"
          className={selectClass}
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
          className={selectClass}
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
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
