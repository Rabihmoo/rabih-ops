import { cn } from '@/lib/utils';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type {
  FindingSeverity,
  FindingStatus,
  InspectionResult,
} from '@/types/database';

// Phase 4.4 — ResultBadge, SeverityBadge, FindingStatusBadge graduate to
// the shared StatusChip primitive. AreaBadge stays plain informational
// text since it's not a status — only its token shifts to foreground-72.

// =========================================================
// Inspection result
// =========================================================

const RESULT_LABEL: Record<InspectionResult, string> = {
  pending: 'Pending',
  pass: 'Passed',
  issues_found: 'Issues found',
  failed: 'Failed',
};

const RESULT_TONE: Record<InspectionResult, StatusTone> = {
  pending:      'muted',
  pass:         'success',
  issues_found: 'warning',
  failed:       'critical',
};

export function ResultBadge({
  result,
  className,
}: {
  result: InspectionResult;
  className?: string;
}) {
  return (
    <StatusChip tone={RESULT_TONE[result]} size="xs" className={className}>
      {RESULT_LABEL[result]}
    </StatusChip>
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

const SEVERITY_TONE: Record<FindingSeverity, StatusTone> = {
  minor:    'muted',
  major:    'warning',
  critical: 'critical',
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: FindingSeverity;
  className?: string;
}) {
  return (
    <StatusChip tone={SEVERITY_TONE[severity]} size="xs" className={className}>
      {SEVERITY_LABEL[severity]}
    </StatusChip>
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

const FINDING_STATUS_TONE: Record<FindingStatus, StatusTone> = {
  open:        'muted',
  in_progress: 'info',
  resolved:    'success',
  escalated:   'critical',
};

export function FindingStatusBadge({
  status,
  className,
}: {
  status: FindingStatus;
  className?: string;
}) {
  return (
    <StatusChip tone={FINDING_STATUS_TONE[status]} size="xs" className={className}>
      {FINDING_STATUS_LABEL[status]}
    </StatusChip>
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
        'text-foreground-72 inline-flex items-center text-xs font-medium',
        className,
      )}
    >
      {AREA_LABEL[area] ?? area}
    </span>
  );
}
