import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveCompany,
  createCompany,
  getCompany,
  listCompanies,
  setCompanyBranches,
  unarchiveCompany,
  updateCompany,
  type CompanyListFilters,
  type CreateCompanyInput,
  type UpdateCompanyPatch,
} from '@/lib/companies';

const KEY = ['companies'] as const;

export function useCompanies(filters: CompanyListFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: () => listCompanies(filters),
  });
}

export function useCompany(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => getCompany(id!),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    if (id) qc.invalidateQueries({ queryKey: [...KEY, 'detail', id] });
  };
}

export function useCreateCompany() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateCompanyInput) => createCompany(input),
    onSuccess: (row) => inv(row.id),
  });
}

export function useUpdateCompany() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patches }: { id: string; patches: UpdateCompanyPatch }) =>
      updateCompany(id, patches),
    onSuccess: (row) => inv(row.id),
  });
}

export function useSetCompanyBranches() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, branches }: { id: string; branches: string[] }) =>
      setCompanyBranches(id, branches),
    onSuccess: (row) => inv(row.id),
  });
}

export function useArchiveCompany() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveCompany(id),
    onSuccess: (row) => inv(row.id),
  });
}

export function useUnarchiveCompany() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unarchiveCompany(id),
    onSuccess: (row) => inv(row.id),
  });
}
