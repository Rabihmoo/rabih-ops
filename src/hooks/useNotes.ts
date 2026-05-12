import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveNote,
  createNote,
  getNote,
  listNotes,
  unarchiveNote,
  updateNote,
  type CreateNoteInput,
  type NoteListFilters,
  type UpdateNotePatches,
} from '@/lib/notes';

const KEY = ['notes'] as const;

export function useNotes(filters: NoteListFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: () => listNotes(filters),
  });
}

export function useNote(noteId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', noteId],
    queryFn: () => getNote(noteId!),
    enabled: !!noteId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (noteId?: string) => {
    qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    if (noteId) qc.invalidateQueries({ queryKey: [...KEY, 'detail', noteId] });
  };
}

export function useCreateNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => createNote(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      noteId,
      patches,
    }: {
      noteId: string;
      patches: UpdateNotePatches;
    }) => updateNote(noteId, patches),
    onSuccess: (_, { noteId }) => invalidate(noteId),
  });
}

export function useArchiveNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (noteId: string) => archiveNote(noteId),
    onSuccess: (_, noteId) => invalidate(noteId),
  });
}

export function useUnarchiveNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (noteId: string) => unarchiveNote(noteId),
    onSuccess: (_, noteId) => invalidate(noteId),
  });
}
