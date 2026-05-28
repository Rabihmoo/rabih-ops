import { useSearchParams } from 'react-router-dom';
import { BRANCH_LIST } from '@/lib/branches';

const PRESETS = [
  { label: 'This week', days: 7 },
  { label: 'Last 2 weeks', days: 14 },
  { label: 'This month', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useReportFilters() {
  const [params, setParams] = useSearchParams();
  const branch = params.get('branch') || null;
  const from = params.get('from') || isoDate(new Date(Date.now() - 90 * 86400000));
  const to = params.get('to') || isoDate(new Date());

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return { branch, from, to, setFilter };
}

export function ReportFilterBar() {
  const { branch, from, to, setFilter } = useReportFilters();

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3" data-testid="report-filters">
      <select
        value={branch ?? ''}
        onChange={(e) => setFilter('branch', e.target.value || null)}
        data-testid="report-branch-filter"
        className="bg-surface-1 border-border text-foreground h-9 rounded-md border px-2 text-sm"
      >
        <option value="">All branches</option>
        {BRANCH_LIST.map((b) => (
          <option key={b.code} value={b.code}>{b.name}</option>
        ))}
      </select>

      <input
        type="date"
        value={from}
        onChange={(e) => setFilter('from', e.target.value)}
        data-testid="report-from"
        className="bg-surface-1 border-border text-foreground h-9 rounded-md border px-2 text-sm"
      />
      <span className="text-foreground-40 text-sm">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setFilter('to', e.target.value)}
        data-testid="report-to"
        className="bg-surface-1 border-border text-foreground h-9 rounded-md border px-2 text-sm"
      />

      <div className="flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => {
              setFilter('from', isoDate(new Date(Date.now() - p.days * 86400000)));
              setFilter('to', isoDate(new Date()));
            }}
            className="text-foreground-56 hover:bg-surface-2 hover:text-foreground rounded-md px-2 py-1 text-xs transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
