import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInspectionList } from '@/hooks/useInspections';
import { useInspectionFiltersStore } from '@/stores/inspectionFiltersStore';
import { useCanAdminInspect } from '@/hooks/usePermissions';
import { InspectionFilterBar } from '@/components/inspections/InspectionFilterBar';
import { InspectionListItem } from '@/components/inspections/InspectionListItem';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';

export function InspectionsPage() {
  const { data, isLoading, error } = useInspectionList();
  const navigate = useNavigate();
  const canAdmin = useCanAdminInspect();
  const count = data?.length ?? 0;

  const criticalCount =
    data?.reduce((sum, i) => sum + (i.open_critical_count ?? 0), 0) ?? 0;
  const openFindingCount =
    data?.reduce((sum, i) => sum + (i.open_finding_count ?? 0), 0) ?? 0;
  const failedCount =
    data?.filter((i) => i.result === 'failed' || i.result === 'issues_found').length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Audit"
        title="Inspections"
        actions={
          canAdmin && (
            <Button size="sm" asChild>
              <Link to="/inspections/new" data-testid="new-inspection-button">
                <Plus className="mr-1 h-4 w-4" /> New inspection
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat
                count={count}
                label={count === 1 ? 'inspection' : 'inspections'}
              />
              {criticalCount > 0 && (
                <HeaderStat
                  count={criticalCount}
                  label="open critical"
                  tone="destructive"
                />
              )}
              {openFindingCount - criticalCount > 0 && (
                <HeaderStat
                  count={openFindingCount - criticalCount}
                  label="open findings"
                  tone="warning"
                />
              )}
              {failedCount > 0 && (
                <HeaderStat
                  count={failedCount}
                  label="with issues"
                  tone="warning"
                />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />

      <InspectionFilterBar />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading inspections…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load inspections: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && <InspectionsEmpty />}
        {!isLoading && !error && data && data.length > 0 && (
          <ul>
            {data.map((inspection) => (
              <li key={inspection.id} className="last:[&>button]:border-b-0">
                <InspectionListItem
                  inspection={inspection}
                  onSelect={(id) => navigate(`/inspections/${id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InspectionsEmpty() {
  const bucket = useInspectionFiltersStore((s) => s.bucket);
  const canAdmin = useCanAdminInspect();

  const COPY: Record<typeof bucket, { title: string; description: string }> = {
    recent: {
      title: 'No inspections yet',
      description:
        'Schedule your first audit to start a paper trail for your branches.',
    },
    pending: {
      title: 'No pending inspections',
      description: 'Everything that has been opened has a result on it.',
    },
    failed: {
      title: 'No inspections with open issues',
      description: 'A clean shop. Worth keeping it that way.',
    },
    mine: {
      title: 'No inspections you have run',
      description: 'Audits you conduct will appear here.',
    },
    all: {
      title: 'No inspections match the current filters',
      description: 'Try clearing the filters or switching the bucket.',
    },
  };

  // True all-clear: no inspections at all under the default "recent"
  // bucket. Anything else is a filter result — muted per Phase 4.4.
  const isAllClear = bucket === 'recent';
  const c = COPY[bucket];
  return (
    <EmptyState
      icon={isAllClear ? ShieldCheck : ClipboardCheck}
      title={c.title}
      description={c.description}
      tone={isAllClear ? 'hero' : 'muted'}
      size={isAllClear ? 'tall' : 'default'}
      action={
        canAdmin && bucket === 'recent' ? (
          <Button size="sm" asChild>
            <Link to="/inspections/new">
              <Plus className="mr-1 h-4 w-4" /> Schedule first inspection
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
