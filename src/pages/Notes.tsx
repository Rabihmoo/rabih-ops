import { Link } from 'react-router-dom';
import { NotebookPen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { NoteFilterBar } from '@/components/notes/NoteFilterBar';
import { NoteListItem } from '@/components/notes/NoteListItem';
import { useNotes } from '@/hooks/useNotes';
import { useNoteFiltersStore } from '@/stores/noteFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { isPersonal } from '@/lib/notes';

export function NotesPage() {
  const filters = useNoteFiltersStore();
  const canMutate = useCanMutate();

  const { data, isLoading, error } = useNotes({
    kind: filters.kind,
    module: filters.module,
    visibility: filters.visibility,
    branch: filters.branch,
    search: filters.search.trim() || null,
    includeArchived: filters.includeArchived,
  });

  const notes = data ?? [];
  const count = notes.length;
  const personalCount = notes.filter(isPersonal).length;
  const decisionCount = notes.filter((n) => n.kind === 'decision').length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Knowledge"
        title="Notes & decisions"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/notes/new" data-testid="new-note-button">
                <Plus className="mr-1 h-4 w-4" /> New note
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat
                count={count}
                label={count === 1 ? 'note' : 'notes'}
              />
              {decisionCount > 0 && (
                <HeaderStat
                  count={decisionCount}
                  label="decisions"
                  tone="primary"
                />
              )}
              {personalCount > 0 && (
                <HeaderStat
                  count={personalCount}
                  label="personal"
                  tone="muted"
                />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        Unstructured memory — decisions, meetings, ideas, lessons, incidents,
        general notes. Search hits title and body. Personal notes are private
        to you (admins and CEOs do not see them).
      </p>

      <NoteFilterBar
        values={{
          kind: filters.kind,
          module: filters.module,
          visibility: filters.visibility,
          branch: filters.branch,
          search: filters.search,
          includeArchived: filters.includeArchived,
        }}
        handlers={{
          setKind: filters.setKind,
          setModule: filters.setModule,
          setVisibility: filters.setVisibility,
          setBranch: filters.setBranch,
          setSearch: filters.setSearch,
          setIncludeArchived: filters.setIncludeArchived,
          reset: filters.reset,
        }}
      />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading notes…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load notes: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && count === 0 && (
          <EmptyState
            icon={NotebookPen}
            title="No notes yet"
            description="Capture a decision, meeting takeaway, idea, lesson, or incident. Personal notes stay private to you."
            tone="muted"
            action={
              canMutate ? (
                <Button size="sm" asChild>
                  <Link to="/notes/new">
                    <Plus className="mr-1 h-4 w-4" /> New note
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
        {!isLoading && !error && count > 0 && (
          <ul>
            {notes.map((n) => (
              <li key={n.id} className="last:[&>a]:border-b-0">
                <NoteListItem note={n} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
