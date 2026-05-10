import { Link } from 'react-router-dom';
import { Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRecurringTemplates } from '@/hooks/useRecurringTemplates';
import { useCanMutate } from '@/hooks/usePermissions';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { TemplateListItem } from '@/components/fixed-tasks/TemplateListItem';

export function FixedTasksPage() {
  const { data, isLoading, error } = useRecurringTemplates();
  const canMutate = useCanMutate();

  const active = (data ?? []).filter((t) => t.status !== 'archived');
  const archived = (data ?? []).filter((t) => t.status === 'archived');

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Fixed tasks"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/fixed-tasks/new" data-testid="new-fixed-task-button">
                <Plus className="mr-1 h-4 w-4" /> New fixed task
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat
                count={active.length}
                label={active.length === 1 ? 'active template' : 'active templates'}
              />
              {archived.length > 0 && (
                <HeaderStat count={archived.length} label="archived" tone="muted" />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        Recurring templates spawn task instances on schedule. Templates do not appear
        in the regular Tasks list — their spawned instances do, with a recurring badge.
      </p>

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading templates…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load templates: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && active.length === 0 && archived.length === 0 && (
          <EmptyState
            icon={Repeat}
            title="No fixed tasks yet"
            description="Create a template for any recurring duty — daily prep checks, weekly inventory, monthly reports."
            tone="muted"
            action={
              canMutate ? (
                <Button size="sm" asChild>
                  <Link to="/fixed-tasks/new">
                    <Plus className="mr-1 h-4 w-4" /> New fixed task
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
        {!isLoading && !error && active.length > 0 && (
          <ul>
            {active.map((t) => (
              <li key={t.id} className="last:[&>a]:border-b-0">
                <TemplateListItem template={t} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <div className="text-section-label px-1">Archived</div>
          <div className="border-border bg-card overflow-hidden rounded-lg border opacity-80">
            <ul>
              {archived.map((t) => (
                <li key={t.id} className="last:[&>a]:border-b-0">
                  <TemplateListItem template={t} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
