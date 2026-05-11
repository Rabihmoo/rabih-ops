import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveContact,
  createContact,
  getContact,
  listContacts,
  setContactBranches,
  unarchiveContact,
  updateContact,
  type ContactListFilters,
  type CreateContactInput,
  type UpdateContactPatch,
} from '@/lib/contacts';

const KEY = ['contacts'] as const;

export function useContacts(filters: ContactListFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: () => listContacts(filters),
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string, companyId?: string | null) => {
    qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    if (id) qc.invalidateQueries({ queryKey: [...KEY, 'detail', id] });
    // Contact count on the parent company refreshes via the companies key.
    if (companyId !== undefined) {
      qc.invalidateQueries({ queryKey: ['companies', 'list'] });
      qc.invalidateQueries({ queryKey: ['companies', 'detail', companyId] });
    }
  };
}

export function useCreateContact() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateContactInput) => createContact(input),
    onSuccess: (row) => inv(row.id, row.company_id),
  });
}

export function useUpdateContact() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patches }: { id: string; patches: UpdateContactPatch }) =>
      updateContact(id, patches),
    onSuccess: (row) => inv(row.id, row.company_id),
  });
}

export function useSetContactBranches() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, branches }: { id: string; branches: string[] }) =>
      setContactBranches(id, branches),
    onSuccess: (row) => inv(row.id),
  });
}

export function useArchiveContact() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveContact(id),
    onSuccess: (row) => inv(row.id),
  });
}

export function useUnarchiveContact() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unarchiveContact(id),
    onSuccess: (row) => inv(row.id),
  });
}
