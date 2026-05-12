import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, NotebookPen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/shared/EmptyState';
import { NoteForm } from '@/components/notes/NoteForm';
import { useCreateNote } from '@/hooks/useNotes';
import { useCanMutate } from '@/hooks/usePermissions';
import type { CreateNoteInput, UpdateNotePatches } from '@/lib/notes';

export function NoteNewPage() {
  const navigate = useNavigate();
  const create = useCreateNote();
  const canMutate = useCanMutate();

  // Viewer (or any role without mutate) gets a not-authorised EmptyState
  // instead of a form that would 42501 at submit time. Matches the spec:
  // viewer can read visible work notes but cannot create/update/archive.
  if (!canMutate) {
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
              title="You don't have permission to create notes"
              description="Viewers can read visible notes but not author or archive them. Ask an admin for a manager role if you need write access."
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

  const handleSubmit = async (
    payload: CreateNoteInput | UpdateNotePatches,
  ) => {
    const row = await create.mutateAsync(payload as CreateNoteInput);
    toast({ title: 'Note created' });
    navigate(`/notes/${row.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/notes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to notes
      </Link>
      <h1 className="text-foreground text-3xl font-semibold tracking-tight leading-tight">
        New note
      </h1>

      <Card>
        <CardContent className="space-y-3 p-5">
          <NoteForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create note"
          />
        </CardContent>
      </Card>
    </div>
  );
}
