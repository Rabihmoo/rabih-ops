import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Loader2,
  Lock,
  NotebookPen,
  RotateCcw,
} from 'lucide-react';
import { marked } from 'marked';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/shared/EmptyState';
import { LinkedRecordsPanel } from '@/components/shared/LinkedRecordsPanel';
import { NoteForm } from '@/components/notes/NoteForm';
import {
  useArchiveNote,
  useNote,
  useUnarchiveNote,
  useUpdateNote,
} from '@/hooks/useNotes';
import { useCanMutate } from '@/hooks/usePermissions';
import {
  DECISION_STATUS_LABEL,
  NOTE_KIND_LABEL,
  NOTE_MODULE_LABEL,
  type CreateNoteInput,
  type UpdateNotePatches,
} from '@/lib/notes';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import type {
  DecisionStatus,
  NoteKind,
  NoteModule,
} from '@/types/database';

const KIND_TONE: Record<NoteKind, StatusTone> = {
  note: 'muted',
  decision: 'purple',
  meeting: 'info',
  idea: 'warning',
  lesson: 'success',
  incident: 'critical',
};

const DECISION_TONE: Record<DecisionStatus, StatusTone> = {
  proposed: 'info',
  accepted: 'success',
  rejected: 'critical',
  revisited: 'warning',
  superseded: 'muted',
};

export function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const noteId = params.id ?? null;

  const { data, isLoading, error } = useNote(noteId);
  const update = useUpdateNote();
  const archive = useArchiveNote();
  const unarchive = useUnarchiveNote();
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);

  const renderedHtml = useMemo(() => {
    const md = data?.body_md ?? '';
    if (!md) return '';
    try {
      return marked.parse(md, { async: false }) as string;
    } catch {
      return '';
    }
  }, [data?.body_md]);

  if (isLoading || !noteId) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading note…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/notes" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to notes
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load note: {(error as Error).message}
        </div>
      </div>
    );
  }
  // rpc_get_note returns null when the caller can't see the note (or it
  // doesn't exist) — keep the two cases visually merged so we don't leak
  // existence to non-authorised viewers.
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/notes"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to notes
        </Link>
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={NotebookPen}
              title="Note not found"
              description="It may have been archived, deleted, or you may not have access. Try the notes list."
              tone="muted"
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link to="/notes">Back to notes</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const note = data;
  const archived = note.archived_at !== null;
  const kind = note.kind as NoteKind;
  const decisionStatus = note.decision_status as DecisionStatus | null;
  const branchMeta = note.branch
    ? (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
        note.branch as BranchCode
      ]
    : null;

  const handleUpdate = async (
    payload: CreateNoteInput | UpdateNotePatches,
  ) => {
    await update.mutateAsync({
      noteId,
      patches: payload as UpdateNotePatches,
    });
    setEditing(false);
    toast({ title: 'Note updated' });
  };
  const handleArchive = async () => {
    if (!confirm('Archive this note? It stays visible with the Show archived filter.')) return;
    await archive.mutateAsync(noteId);
    toast({ title: 'Archived' });
  };
  const handleUnarchive = async () => {
    await unarchive.mutateAsync(noteId);
    toast({ title: 'Restored' });
    navigate(`/notes/${noteId}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        to="/notes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to notes
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <h1
            className={cn(
              'text-foreground text-3xl font-semibold tracking-tight leading-tight',
              archived && 'text-muted-foreground line-through',
            )}
          >
            {note.visibility === 'personal' && (
              <Lock className="mr-2 inline h-5 w-5 -translate-y-1" aria-label="Personal" />
            )}
            {note.title?.trim() || '(untitled note)'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip tone={KIND_TONE[kind]} size="sm">
              {NOTE_KIND_LABEL[kind]}
            </StatusChip>
            {kind === 'decision' && decisionStatus && (
              <StatusChip tone={DECISION_TONE[decisionStatus]} size="sm" dot>
                {DECISION_STATUS_LABEL[decisionStatus]}
              </StatusChip>
            )}
            {archived && (
              <StatusChip tone="muted" size="sm">
                Archived
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
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              updated {new Date(note.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {canMutate && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!archived && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                data-testid="note-edit-button"
              >
                Edit
              </Button>
            )}
            {!archived ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleArchive}
                disabled={archive.isPending}
                data-testid="note-archive-button"
              >
                <Archive className="mr-1 h-4 w-4" /> Archive
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleUnarchive}
                disabled={unarchive.isPending}
                data-testid="note-unarchive-button"
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Restore
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit note</div>
            <NoteForm
              initial={note}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save"
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
      ) : (
        <Card>
          <CardContent className="p-5">
            {note.body_md ? (
              <article
                className="prose prose-invert max-w-none text-sm leading-relaxed [&_a]:text-primary-ink [&_code]:bg-surface-1 [&_code]:px-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_pre]:bg-surface-1 [&_pre]:p-3 [&_table]:border [&_th]:border [&_td]:border [&_th]:px-2 [&_td]:px-2"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="text-muted-foreground text-sm">No content yet.</div>
            )}
          </CardContent>
        </Card>
      )}

      {!editing && (
        <LinkedRecordsPanel entityType="note" entityId={noteId} />
      )}

      {kind === 'decision' && !editing &&
        (note.decision_reason ||
          note.decision_impact ||
          note.decided_at ||
          decisionStatus) && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="text-section-label text-primary-ink/80 flex items-center gap-2">
                Decision details
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-subtle-foreground text-xs uppercase tracking-wide">
                    Status
                  </div>
                  <div className="text-foreground text-sm">
                    {decisionStatus
                      ? DECISION_STATUS_LABEL[decisionStatus]
                      : 'Not set'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-subtle-foreground text-xs uppercase tracking-wide">
                    Decided on
                  </div>
                  <div className="text-foreground text-sm">
                    {note.decided_at ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(note.decided_at).toLocaleDateString()}
                      </span>
                    ) : (
                      'Not set'
                    )}
                  </div>
                </div>
              </div>
              {note.decision_reason && (
                <div className="space-y-1">
                  <div className="text-subtle-foreground text-xs uppercase tracking-wide">
                    Why this decision
                  </div>
                  <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                    {note.decision_reason}
                  </p>
                </div>
              )}
              {note.decision_impact && (
                <div className="space-y-1">
                  <div className="text-subtle-foreground text-xs uppercase tracking-wide">
                    Expected impact
                  </div>
                  <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                    {note.decision_impact}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
