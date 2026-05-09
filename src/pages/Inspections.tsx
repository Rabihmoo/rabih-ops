import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInspectionList } from '@/hooks/useInspections';
import { useInspectionFiltersStore } from '@/stores/inspectionFiltersStore';
import { useCanAdminInspect } from '@/hooks/usePermissions';
import { InspectionFilterBar } from '@/components/inspections/InspectionFilterBar';
import { InspectionListItem } from '@/components/inspections/InspectionListItem';

export function InspectionsPage() {
  const { data, isLoading, error } = useInspectionList();
  const navigate = useNavigate();
  const canAdmin = useCanAdminInspect();
  const count = data?.length ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Inspections
          </h1>
          <p className="text-muted-foreground text-sm">
            {data
              ? count === 0
                ? 'No matching inspections'
                : `${count} ${count === 1 ? 'inspection' : 'inspections'}`
              : 'Loading inspections…'}
          </p>
        </div>
        {canAdmin && (
          <Button size="sm" asChild>
            <Link to="/inspections/new" data-testid="new-inspection-button">
              <Plus className="mr-1 h-4 w-4" /> New inspection
            </Link>
          </Button>
        )}
      </header>

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
        {!isLoading && !error && data && data.length === 0 && <EmptyState />}
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

function EmptyState() {
  const bucket = useInspectionFiltersStore((s) => s.bucket);
  const messages: Record<typeof bucket, string> = {
    recent: 'No inspections yet. Schedule the first one to start the audit trail.',
    pending: 'No pending inspections.',
    failed: 'No inspections with open issues.',
    mine: 'No inspections you have run.',
    all: 'No inspections match the current filters.',
  };
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-foreground text-base font-semibold tracking-tight">
        Nothing to show.
      </div>
      <div className="text-muted-foreground max-w-md text-sm">{messages[bucket]}</div>
    </div>
  );
}
