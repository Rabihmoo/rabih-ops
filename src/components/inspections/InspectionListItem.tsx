import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BranchBadge, TONE_BAR } from '@/components/tasks/badges';
import { StatusChip } from '@/components/ui/status-chip';
import type { InspectionResult } from '@/types/database';
import type { InspectionListItem as InspectionListItemType } from '@/lib/inspections';
import { ResultBadge } from './badges';

const AREA_LABEL: Record<string, string> = {
  kitchen: 'Kitchen',
  storage: 'Storage',
  service_area: 'Service area',
  cold_room: 'Cold room',
  dry_store: 'Dry store',
  staff_area: 'Staff area',
  full_branch: 'Full branch',
};

// Tone reflects open-critical-count first, then result/finding state.
function inspectionTone(row: InspectionListItemType) {
  if (row.open_critical_count > 0) return 'destructive';
  if (row.result === 'failed') return 'destructive';
  if (row.result === 'issues_found' || row.open_finding_count > 0) return 'warning';
  return 'muted';
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function InspectionListItem({
  inspection,
  onSelect,
}: {
  inspection: InspectionListItemType;
  onSelect?: (id: string) => void;
}) {
  const tone = inspectionTone(inspection);
  const result = inspection.result as InspectionResult;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(inspection.id)}
      className="group border-border bg-card hover:bg-surface-1 focus-visible:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors focus-visible:outline-none"
    >
      <span aria-hidden className={cn('w-1 shrink-0 self-stretch', TONE_BAR[tone])} />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-[15px] font-medium leading-snug">
              {AREA_LABEL[inspection.area] ?? inspection.area}
            </div>
            {inspection.general_notes && (
              <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                {inspection.general_notes}
              </div>
            )}
          </div>
          <span
            className={cn(
              'mt-0.5 shrink-0 text-xs font-medium tabular-nums',
              tone === 'destructive' && 'text-destructive-ink',
              tone === 'warning' && 'text-warning-ink',
              tone === 'muted' && 'text-muted-foreground',
            )}
          >
            {formatDate(inspection.inspection_date)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <ResultBadge result={result} />
          <BranchBadge branch={inspection.branch} />
          {inspection.open_critical_count > 0 && (
            <StatusChip tone="critical" size="xs" icon={AlertTriangle}>
              {inspection.open_critical_count} critical
            </StatusChip>
          )}
          {inspection.open_finding_count > inspection.open_critical_count && (
            <span className="text-foreground-72 text-[10px] font-medium uppercase tracking-wider">
              {inspection.open_finding_count - inspection.open_critical_count} open
            </span>
          )}
          <span className="text-foreground-56 text-xs">
            by {inspection.inspector_name}
          </span>
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground/0 group-hover:text-muted-foreground mr-3 h-4 w-4 self-center shrink-0 transition-colors"
      />
    </button>
  );
}
