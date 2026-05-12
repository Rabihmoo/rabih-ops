import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BranchBadge, PriorityBadge } from '@/components/tasks/badges';
import { cadenceLabel, nextSpawnLabel } from '@/lib/recurring-templates';
import type { TaskPriority, TaskRow } from '@/types/database';

export function TemplateListItem({ template }: { template: TaskRow }) {
  const archived = template.status === 'archived';
  const priority = template.priority as TaskPriority;

  return (
    <Link
      to={`/fixed-tasks/${template.id}`}
      data-testid="template-list-item"
      data-archived={archived}
      className={cn(
        'group border-border bg-card hover:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1 shrink-0 self-stretch',
          archived ? 'bg-transparent' : 'bg-primary',
        )}
      />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'truncate text-[15px] font-medium leading-snug',
                archived && 'text-muted-foreground line-through',
              )}
            >
              {template.title}
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
              <Repeat className="h-3 w-3" />
              <span className="line-clamp-1">{cadenceLabel(template)}</span>
            </div>
          </div>
          <div className="text-foreground-72 shrink-0 text-xs tabular-nums">
            {archived ? (
              <span className="text-subtle-foreground">archived</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {nextSpawnLabel(template.next_spawn_at)}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <BranchBadge branch={template.branch} />
          {priority !== 'normal' && <PriorityBadge priority={priority} />}
          <span className="text-subtle-foreground text-xs capitalize">
            {template.category.replace('_', ' ')}
          </span>
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground/0 group-hover:text-muted-foreground mr-3 h-4 w-4 self-center shrink-0 transition-colors"
      />
    </Link>
  );
}
