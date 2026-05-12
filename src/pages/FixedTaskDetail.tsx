import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Loader2,
  PlayCircle,
  Repeat,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toaster';
import { RecurringTemplateForm } from '@/components/fixed-tasks/RecurringTemplateForm';
import { BranchBadge, PriorityBadge } from '@/components/tasks/badges';
import {
  useArchiveRecurringTemplate,
  useRecurringTemplate,
  useSpawnInstanceNow,
  useUnarchiveRecurringTemplate,
  useUpdateRecurringTemplate,
} from '@/hooks/useRecurringTemplates';
import { useCanMutate } from '@/hooks/usePermissions';
import { cadenceLabel, nextSpawnLabel } from '@/lib/recurring-templates';
import type {
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
} from '@/lib/recurring-templates';
import type { TaskPriority } from '@/types/database';

export function FixedTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = params.id ?? null;

  const { data: template, isLoading, error } = useRecurringTemplate(id);
  const update = useUpdateRecurringTemplate();
  const archive = useArchiveRecurringTemplate();
  const unarchive = useUnarchiveRecurringTemplate();
  const spawnNow = useSpawnInstanceNow();
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);

  if (isLoading || !id) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading template…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/fixed-tasks" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to fixed tasks
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load template: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!template) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/fixed-tasks" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to fixed tasks
        </Link>
        <div className="text-muted-foreground text-sm">Template not found.</div>
      </div>
    );
  }

  const archived = template.status === 'archived';
  const priority = template.priority as TaskPriority;

  const handleUpdate = async (
    input: CreateRecurringTemplateInput | UpdateRecurringTemplateInput,
  ) => {
    await update.mutateAsync({ id, updates: input as UpdateRecurringTemplateInput });
    setEditing(false);
    toast({ title: 'Template updated' });
  };

  const handleArchive = async () => {
    if (
      !confirm(
        'Archive this template? It stops spawning instances but stays visible in the archived list.',
      )
    )
      return;
    await archive.mutateAsync({ id });
    toast({ title: 'Template archived' });
  };

  const handleUnarchive = async () => {
    await unarchive.mutateAsync(id);
    toast({ title: 'Template re-enabled' });
  };

  const handleSpawnNow = async () => {
    if (!confirm('Spawn an instance now? It will appear in the regular Tasks list.'))
      return;
    const row = await spawnNow.mutateAsync({ templateId: id });
    toast({ title: 'Instance spawned' });
    navigate(`/tasks/${row.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/fixed-tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to fixed tasks
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <h1
            className={cn(
              'text-foreground text-3xl font-semibold tracking-tight leading-tight',
              archived && 'text-muted-foreground line-through',
            )}
          >
            {template.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip tone="info" size="xs" icon={Repeat}>Template</StatusChip>
            <BranchBadge branch={template.branch} />
            {priority !== 'normal' && <PriorityBadge priority={priority} />}
            <span className="text-foreground-72 text-xs capitalize">
              {template.category.replace('_', ' ')}
            </span>
            {archived && (
              <StatusChip tone="muted" size="xs">archived</StatusChip>
            )}
          </div>
        </div>
        {canMutate && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!archived && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                data-testid="template-edit-button"
              >
                Edit
              </Button>
            )}
            {!archived && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSpawnNow}
                disabled={spawnNow.isPending}
                data-testid="template-spawn-now-button"
              >
                <PlayCircle className="mr-1 h-4 w-4" /> Spawn now
              </Button>
            )}
            {archived ? (
              <Button
                size="sm"
                onClick={handleUnarchive}
                disabled={unarchive.isPending}
                data-testid="template-unarchive-button"
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Re-enable
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleArchive}
                disabled={archive.isPending}
                data-testid="template-archive-button"
              >
                <Archive className="mr-1 h-4 w-4" /> Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary card */}
      {!editing && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Schedule</div>
            <div className="text-foreground-72 text-sm">
              <Repeat className="text-muted-foreground mr-2 inline h-4 w-4 -translate-y-px" />
              {cadenceLabel(template)}
            </div>
            <div className="text-foreground-72 text-sm">
              <Calendar className="text-muted-foreground mr-2 inline h-4 w-4 -translate-y-px" />
              Next instance: {archived ? '— (archived)' : nextSpawnLabel(template.next_spawn_at)}
            </div>
            {template.description && (
              <div className="space-y-1 pt-2">
                <div className="text-section-label">Description</div>
                <p className="text-foreground-72 text-sm leading-relaxed whitespace-pre-wrap">
                  {template.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit */}
      {editing && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit template</div>
            <RecurringTemplateForm
              initial={template}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save changes"
            />
            <Button
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
