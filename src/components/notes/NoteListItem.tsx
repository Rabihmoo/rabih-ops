import { Link } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import {
  DECISION_STATUS_LABEL,
  NOTE_KIND_LABEL,
  NOTE_MODULE_LABEL,
} from '@/lib/notes';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type {
  DecisionStatus,
  NoteKind,
  NoteModule,
  NoteRow,
} from '@/types/database';

// Per-kind tone for the leading chip. Decisions stand out (purple) so the
// list reads as "what was decided" + everything else.
const KIND_TONE: Record<NoteKind, StatusTone> = {
  note: 'muted',
  decision: 'purple',
  meeting: 'info',
  idea: 'warning',
  lesson: 'success',
  incident: 'critical',
};

// Decision status tone — only rendered when kind=decision and status is set.
const DECISION_TONE: Record<DecisionStatus, StatusTone> = {
  proposed: 'info',
  accepted: 'success',
  rejected: 'critical',
  revisited: 'warning',
  superseded: 'muted',
};

function firstLine(body: string, max = 140): string {
  const cleaned = body.replace(/[#*`>\-_~]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + '…';
}

export function NoteListItem({ note }: { note: NoteRow }) {
  const archived = note.archived_at !== null;
  const branchMeta = note.branch
    ? (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
        note.branch as BranchCode
      ]
    : null;
  const kind = note.kind as NoteKind;
  const decisionStatus = note.decision_status as DecisionStatus | null;

  return (
    <Link
      to={`/notes/${note.id}`}
      data-testid="note-list-item"
      className={cn(
        'group border-border bg-card hover:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1 shrink-0 self-stretch',
          archived
            ? 'bg-transparent'
            : kind === 'decision'
              ? 'bg-violet-500'
              : kind === 'incident'
                ? 'bg-destructive'
                : kind === 'meeting'
                  ? 'bg-primary'
                  : 'bg-transparent',
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
              {note.visibility === 'personal' && (
                <Lock
                  className="mr-1 inline h-3.5 w-3.5 -translate-y-px"
                  aria-label="Personal"
                />
              )}
              {note.title?.trim() || firstLine(note.body_md, 60)}
            </div>
            {note.title && (
              <p className="text-foreground-72 mt-1 line-clamp-2 text-xs">
                {firstLine(note.body_md, 160)}
              </p>
            )}
          </div>
          <span className="text-foreground-56 shrink-0 text-xs">
            {new Date(note.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <StatusChip tone={KIND_TONE[kind]} size="xs">
            {NOTE_KIND_LABEL[kind]}
          </StatusChip>
          {kind === 'decision' && decisionStatus && (
            <StatusChip tone={DECISION_TONE[decisionStatus]} size="xs" dot>
              {DECISION_STATUS_LABEL[decisionStatus]}
            </StatusChip>
          )}
          <span className="text-foreground-72 text-xs">
            {NOTE_MODULE_LABEL[note.module as NoteModule]}
          </span>
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
          {note.visibility === 'work' && !note.branch && (
            <span className="text-subtle-foreground text-xs">cross-branch</span>
          )}
          {archived && (
            <StatusChip tone="muted" size="xs">
              Archived
            </StatusChip>
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
