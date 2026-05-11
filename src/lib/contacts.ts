import { callRpc } from './rpc';
import type { ContactRow } from '@/types/database';

export interface ContactCompanySnapshot {
  id: string;
  name: string;
  category: string;
}

export interface ContactListItem extends ContactRow {
  branches: string[];
  company: ContactCompanySnapshot | null;
}

export interface ContactDetail extends ContactRow {
  branches: string[];
  company: ContactCompanySnapshot | null;
}

export interface ContactListFilters {
  companyId?: string | null;
  branch?: string | null;
  search?: string | null;
  includeInactive?: boolean;
  limit?: number;
}

export interface CreateContactInput {
  full_name: string;
  company_id?: string | null;
  branches?: string[];
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  telegram_handle?: string | null;
  notes?: string | null;
}

export interface UpdateContactPatch {
  full_name?: string;
  company_id?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  telegram_handle?: string | null;
  notes?: string | null;
}

export async function listContacts(
  filters: ContactListFilters = {},
): Promise<ContactListItem[]> {
  const rows = await callRpc<ContactListItem[]>('rpc_list_contacts', {
    p_company_id: filters.companyId ?? null,
    p_branch: filters.branch ?? null,
    p_search: filters.search ?? null,
    p_include_inactive: filters.includeInactive ?? false,
    p_limit: filters.limit ?? 50,
  });
  return rows ?? [];
}

export async function getContact(id: string): Promise<ContactDetail | null> {
  return callRpc<ContactDetail | null>('rpc_get_contact', { p_id: id });
}

export async function createContact(input: CreateContactInput): Promise<ContactDetail> {
  return callRpc<ContactDetail>('rpc_create_contact', {
    p_full_name: input.full_name,
    p_company_id: input.company_id ?? null,
    p_branches: input.branches ?? [],
    p_role: input.role ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_whatsapp: input.whatsapp ?? null,
    p_telegram_handle: input.telegram_handle ?? null,
    p_notes: input.notes ?? null,
  });
}

export async function updateContact(
  id: string,
  patches: UpdateContactPatch,
): Promise<ContactDetail> {
  return callRpc<ContactDetail>('rpc_update_contact', {
    p_id: id,
    p_patches: patches,
  });
}

export async function setContactBranches(
  id: string,
  branches: string[],
): Promise<ContactDetail> {
  return callRpc<ContactDetail>('rpc_set_contact_branches', {
    p_id: id,
    p_branches: branches,
  });
}

export async function archiveContact(id: string): Promise<ContactDetail> {
  return callRpc<ContactDetail>('rpc_archive_contact', { p_id: id });
}

export async function unarchiveContact(id: string): Promise<ContactDetail> {
  return callRpc<ContactDetail>('rpc_unarchive_contact', { p_id: id });
}
