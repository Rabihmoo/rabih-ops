import { Link } from 'react-router-dom';
import { ChevronRight, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import {
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_STATUS_LABEL,
  type DocumentListItem as Doc,
} from '@/lib/documents';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type { DocumentCategory, DocumentStatus } from '@/types/database';

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'warning',
  active: 'success',
  archived: 'muted',
};

export function DocumentListItem({ doc }: { doc: Doc }) {
  const archived = doc.status === 'archived';
  const branchMeta = doc.branch
    ? (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
        doc.branch as BranchCode
      ]
    : null;

  return (
    <Link
      to={`/documents/${doc.id}`}
      data-testid="document-list-item"
      className={cn(
        'group border-border bg-card hover:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1 shrink-0 self-stretch',
          archived ? 'bg-transparent' : doc.status === 'active' ? 'bg-success' : 'bg-warning',
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
              {doc.visibility === 'personal' && (
                <Lock className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-label="Personal" />
              )}
              {doc.title}
            </div>
            {doc.snippet && (
              <p
                className="text-foreground-72 mt-1 line-clamp-2 text-xs"
                // ts_headline returns markup with «...» highlighting; render escaped.
                dangerouslySetInnerHTML={{ __html: doc.snippet.replace(/«/g, '<mark>').replace(/»/g, '</mark>') }}
              />
            )}
          </div>
          <span className="text-foreground-56 shrink-0 text-xs">
            {new Date(doc.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <StatusChip tone="muted" size="xs" icon={FileText}>
            {DOCUMENT_CATEGORY_LABEL[doc.category as DocumentCategory]}
          </StatusChip>
          <StatusChip tone={STATUS_TONE[doc.status] ?? 'muted'} size="xs">
            {DOCUMENT_STATUS_LABEL[doc.status as DocumentStatus]}
          </StatusChip>
          {branchMeta && (
            <span className="text-foreground-72 inline-flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: branchMeta.color }}
              />
              {branchMeta.name}
            </span>
          )}
          {!doc.branch && (
            <span className="text-subtle-foreground text-xs">cross-branch</span>
          )}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="text-foreground-56/0 group-hover:text-foreground-56 mr-3 h-4 w-4 self-center shrink-0 transition-colors"
      />
    </Link>
  );
}
