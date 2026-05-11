import { callRpc } from './rpc';
import type { CompanyCategory, CompanyRow } from '@/types/database';

// Shape returned by rpc_list_companies — base row + branches + contact_count.
export interface CompanyListItem extends CompanyRow {
  branches: string[];
  contact_count: number;
}

// Shape returned by rpc_get_company — same plus contact_count.
export interface CompanyDetail extends CompanyRow {
  branches: string[];
  contact_count: number;
}

export const COMPANY_CATEGORIES: CompanyCategory[] = [
  'supplier',
  'contractor',
  'landlord',
  'government',
  'agency',
  'partner',
  'customer',
  'other',
];

export const COMPANY_CATEGORY_LABEL: Record<CompanyCategory, string> = {
  supplier: 'Supplier',
  contractor: 'Contractor',
  landlord: 'Landlord',
  government: 'Government',
  agency: 'Agency',
  partner: 'Partner',
  customer: 'Customer',
  other: 'Other',
};

export interface CompanyListFilters {
  category?: CompanyCategory | null;
  branch?: string | null;
  search?: string | null;
  includeInactive?: boolean;
  limit?: number;
}

export interface CreateCompanyInput {
  name: string;
  category: CompanyCategory;
  branches: string[];
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateCompanyPatch {
  name?: string;
  category?: CompanyCategory;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export async function listCompanies(
  filters: CompanyListFilters = {},
): Promise<CompanyListItem[]> {
  const rows = await callRpc<CompanyListItem[]>('rpc_list_companies', {
    p_category: filters.category ?? null,
    p_branch: filters.branch ?? null,
    p_search: filters.search ?? null,
    p_include_inactive: filters.includeInactive ?? false,
    p_limit: filters.limit ?? 50,
  });
  return rows ?? [];
}

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  return callRpc<CompanyDetail | null>('rpc_get_company', { p_id: id });
}

export async function createCompany(input: CreateCompanyInput): Promise<CompanyDetail> {
  return callRpc<CompanyDetail>('rpc_create_company', {
    p_name: input.name,
    p_category: input.category,
    p_branches: input.branches,
    p_website: input.website ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_notes: input.notes ?? null,
  });
}

export async function updateCompany(
  id: string,
  patches: UpdateCompanyPatch,
): Promise<CompanyDetail> {
  return callRpc<CompanyDetail>('rpc_update_company', {
    p_id: id,
    p_patches: patches,
  });
}

export async function setCompanyBranches(
  id: string,
  branches: string[],
): Promise<CompanyDetail> {
  return callRpc<CompanyDetail>('rpc_set_company_branches', {
    p_id: id,
    p_branches: branches,
  });
}

export async function archiveCompany(id: string): Promise<CompanyDetail> {
  return callRpc<CompanyDetail>('rpc_archive_company', { p_id: id });
}

export async function unarchiveCompany(id: string): Promise<CompanyDetail> {
  return callRpc<CompanyDetail>('rpc_unarchive_company', { p_id: id });
}
