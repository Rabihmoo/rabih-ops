import {
  Building2,
  ClipboardCheck,
  FileText,
  ListChecks,
  NotebookPen,
  PhoneCall,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import {
  entityTypeLabel,
  relativeTime,
  type SearchEntityType,
  type SearchResultRow,
} from '@/lib/global-search';

const ENTITY_ICON: Record<SearchEntityType, LucideIcon> = {
  task: ListChecks,
  follow_up: PhoneCall,
  note: NotebookPen,
  document: FileText,
  purchase: Receipt,
  inspection: ClipboardCheck,
  company: Building2,
  contact: Users,
};

export function CommandPaletteResultRow({
  row,
  isActive,
  onClick,
}: {
  row: SearchResultRow;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = ENTITY_ICON[row.type];
  const branch = row.branch ? BRANCHES[row.branch as BranchCode] : null;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      data-testid="command-palette-row"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        isActive
          ? 'bg-primary-soft text-primary-ink'
          : 'text-foreground hover:bg-surface-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.title}</div>
        <div className="text-foreground-56 flex items-center gap-1.5 text-xs">
          <span>{entityTypeLabel(row.type)}</span>
          {branch && (
            <>
              <span className="text-foreground-40">·</span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: branch.color }}
                  aria-hidden
                />
                {branch.name}
              </span>
            </>
          )}
          <span className="text-foreground-40">·</span>
          <span>{relativeTime(row.updated_at)}</span>
        </div>
      </div>
    </button>
  );
}
