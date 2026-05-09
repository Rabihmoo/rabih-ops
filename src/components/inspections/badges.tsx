import { cn } from '@/lib/utils';
import type {
  FindingSeverity,
  FindingStatus,
  InspectionResult,
} from '@/types/database';

const PILL_BASE =
  'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider';

// =========================================================
// Inspection result
// =========================================================

const RESULT_LABEL: Record<InspectionResult, string> = {
  pending: 'Pending',
  pass: 'Passed',
  issues_found: 'Issues found',
  failed: 'Failed',
};

const RESULT_CLASSES: Record<InspectionResult, string> = {
  pending: 'bg-muted text-muted-foreground',
  pass: 'bg-success-soft text-success-ink',
  issues_found: 'bg-warning-soft text-warning-ink',
  failed: 'bg-destructive-soft text-destructive-ink',
};

export function ResultBadge({
  result,
  className,
}: {
  result: InspectionResult;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, RESULT_CLASSES[result], className)}>
      {RESULT_LABEL[result]}
    </span>
  );
}

// =========================================================
// Finding severity
// =========================================================

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};

const SEVERITY_CLASSES: Record<FindingSeverity, string> = {
  minor: 'bg-muted text-muted-foreground',
  major: 'bg-warning-soft text-warning-ink',
  critical: 'bg-destructive-soft text-destructive-ink',
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: FindingSeverity;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, SEVERITY_CLASSES[severity], className)}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

// =========================================================
// Finding status
// =========================================================

const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

const FINDING_STATUS_CLASSES: Record<FindingStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary-soft text-primary-ink',
  resolved: 'bg-success-soft text-success-ink',
  escalated: 'bg-destructive-soft text-destructive-ink',
};

export function FindingStatusBadge({
  status,
  className,
}: {
  status: FindingStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, FINDING_STATUS_CLASSES[status], className)}>
      {FINDING_STATUS_LABEL[status]}
    </span>
  );
}

// =========================================================
// Inspection area (informational; no urgency tone)
// =========================================================

const AREA_LABEL: Record<string, string> = {
  kitchen: 'Kitchen',
  storage: 'Storage',
  service_area: 'Service area',
  cold_room: 'Cold room',
  dry_store: 'Dry store',
  staff_area: 'Staff area',
  full_branch: 'Full branch',
};

export function AreaBadge({ area, className }: { area: string; className?: string }) {
  return (
    <span
      className={cn(
        'text-foreground/85 inline-flex items-center text-xs font-medium',
        className,
      )}
    >
      {AREA_LABEL[area] ?? area}
    </span>
  );
}
