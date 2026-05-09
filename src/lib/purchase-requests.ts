import { callRpc } from './rpc';
import type {
  PurchaseRequestRow,
  CommentRow,
  AttachmentRow,
  PurchaseStatus,
  PaymentStatus,
  PaymentMethod,
  Currency,
  TaskPriority,
} from '@/types/database';

// =========================================================
// Read RPCs
// =========================================================

export interface PurchaseListFilters {
  branch?: string | null;
  status?: PurchaseStatus | null;
  priority?: TaskPriority | null;
  paymentStatus?: PaymentStatus | null;
  requestedBy?: string | null;
  search?: string | null;
  dateBefore?: string | null;
  dateAfter?: string | null;
  includeDone?: boolean;
  limit?: number;
}

export interface PurchaseListItem extends PurchaseRequestRow {
  requested_by_name: string;
  created_by_name: string;
  is_overdue: boolean;
}

export async function listPurchaseRequests(
  filters: PurchaseListFilters = {},
): Promise<PurchaseListItem[]> {
  const result = await callRpc<PurchaseListItem[] | null>('rpc_list_purchase_requests', {
    p_branch: filters.branch ?? null,
    p_status: filters.status ?? null,
    p_priority: filters.priority ?? null,
    p_payment_status: filters.paymentStatus ?? null,
    p_requested_by: filters.requestedBy ?? null,
    p_search: filters.search?.trim() ? filters.search.trim() : null,
    p_date_before: filters.dateBefore ?? null,
    p_date_after: filters.dateAfter ?? null,
    p_include_done: filters.includeDone ?? false,
    p_limit: filters.limit ?? 100,
  });
  return result ?? [];
}

export interface CommentWithAuthor extends CommentRow {
  author_name: string;
}

export interface AttachmentWithUploader extends AttachmentRow {
  uploader_name: string;
}

export interface PurchaseAuditEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string;
}

export interface PurchaseDetailPayload {
  purchase_request: PurchaseRequestRow & {
    requested_by_name: string;
    created_by_name: string;
    is_overdue: boolean;
  };
  comments: CommentWithAuthor[];
  attachments: AttachmentWithUploader[];
  audit: PurchaseAuditEntry[];
}

export async function getPurchaseRequest(id: string): Promise<PurchaseDetailPayload> {
  return callRpc<PurchaseDetailPayload>('rpc_get_purchase_request', { p_id: id });
}

export interface PendingDelivery {
  id: string;
  title: string;
  supplier_name: string;
  branch: string;
  status: PurchaseStatus;
  expected_delivery_date: string | null;
  qty_ordered: number | null;
  qty_received: number | null;
  currency: Currency;
  total_amount: number | null;
  is_overdue: boolean;
}

export interface UnpaidPurchase {
  id: string;
  title: string;
  supplier_name: string;
  branch: string;
  status: PurchaseStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  currency: Currency;
  total_amount: number | null;
  amount_paid: number | null;
  order_date: string | null;
}

export interface PurchaseReminder {
  id: string;
  title: string;
  supplier_name: string;
  branch: string;
  status: PurchaseStatus;
  reminder_date: string;
  expected_delivery_date: string | null;
  currency: Currency;
  total_amount: number | null;
}

export interface PurchaseDashboard {
  pending_deliveries: PendingDelivery[];
  unpaid: UnpaidPurchase[];
  reminders_today: PurchaseReminder[];
}

export async function listPurchaseDashboard(limit = 20): Promise<PurchaseDashboard> {
  return callRpc<PurchaseDashboard>('rpc_list_purchase_dashboard', { p_limit: limit });
}

// =========================================================
// Mutation RPCs
// =========================================================

export interface CreatePurchaseInput {
  title: string;
  supplier_name: string;
  branch: string;
  priority?: TaskPriority;
  currency?: Currency;
  supplier_website?: string | null;
  total_amount?: number | null;
  qty_ordered?: number | null;
  expected_delivery_date?: string | null;
  reminder_date?: string | null;
  payment_method?: PaymentMethod | null;
  notes?: string | null;
  requested_by?: string | null;
}

export async function createPurchaseRequest(
  input: CreatePurchaseInput,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_create_purchase_request', {
    p_title: input.title,
    p_supplier_name: input.supplier_name,
    p_branch: input.branch,
    p_priority: input.priority ?? 'normal',
    p_currency: input.currency ?? 'MZN',
    p_supplier_website: input.supplier_website ?? null,
    p_total_amount: input.total_amount ?? null,
    p_qty_ordered: input.qty_ordered ?? null,
    p_expected_delivery_date: input.expected_delivery_date ?? null,
    p_reminder_date: input.reminder_date ?? null,
    p_payment_method: input.payment_method ?? null,
    p_notes: input.notes ?? null,
    p_requested_by: input.requested_by ?? null,
  });
}

export interface UpdatePurchaseInput {
  title?: string;
  supplier_name?: string;
  supplier_website?: string | null;
  branch?: string;
  priority?: TaskPriority;
  currency?: Currency;
  payment_method?: PaymentMethod | null;
  total_amount?: number | null;
  qty_ordered?: number | null;
  expected_delivery_date?: string | null;
  reminder_date?: string | null;
  notes?: string | null;
  requested_by?: string | null;
}

export async function updatePurchaseRequest(
  id: string,
  updates: UpdatePurchaseInput,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_update_purchase_request', {
    p_id: id,
    p_updates: updates,
  });
}

export async function submitPurchaseRequest(id: string): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_submit_purchase_request', { p_id: id });
}

export interface ApprovePurchaseInput {
  total_amount?: number | null;
  payment_method?: PaymentMethod | null;
  order_date?: string | null;
}

export async function approvePurchaseRequest(
  id: string,
  input: ApprovePurchaseInput = {},
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_approve_purchase_request', {
    p_id: id,
    p_total_amount: input.total_amount ?? null,
    p_payment_method: input.payment_method ?? null,
    p_order_date: input.order_date ?? null,
  });
}

export interface RecordDeliveryInput {
  qty_received: number;
  delivery_date?: string | null;
  status?: PurchaseStatus | null;
}

export async function recordDelivery(
  id: string,
  input: RecordDeliveryInput,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_record_delivery', {
    p_id: id,
    p_qty_received: input.qty_received,
    p_delivery_date: input.delivery_date ?? null,
    p_status: input.status ?? null,
  });
}

export interface RecordPaymentInput {
  amount_paid: number;
  payment_method?: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
}

export async function recordPayment(
  id: string,
  input: RecordPaymentInput,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_record_payment', {
    p_id: id,
    p_amount_paid: input.amount_paid,
    p_payment_method: input.payment_method ?? null,
    p_payment_status: input.payment_status ?? null,
  });
}

export async function setPurchaseReminder(
  id: string,
  reminderDate: string | null,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_set_purchase_reminder', {
    p_id: id,
    p_reminder_date: reminderDate,
  });
}

export async function cancelPurchaseRequest(
  id: string,
  reason?: string,
): Promise<PurchaseRequestRow> {
  return callRpc<PurchaseRequestRow>('rpc_cancel_purchase_request', {
    p_id: id,
    p_reason: reason ?? null,
  });
}

export async function softDeletePurchaseRequest(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_soft_delete_purchase_request', {
    p_id: id,
  });
}

// =========================================================
// Comment + attachment wrappers
// =========================================================

export async function addPurchaseComment(
  id: string,
  body: string,
): Promise<CommentRow> {
  return callRpc<CommentRow>('rpc_add_purchase_comment', { p_id: id, p_body: body });
}

export async function deletePurchaseComment(
  commentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_delete_purchase_comment', {
    p_comment_id: commentId,
  });
}

export interface AttachFileInput {
  purchaseId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export async function attachFileToPurchase(
  input: AttachFileInput,
): Promise<AttachmentRow> {
  return callRpc<AttachmentRow>('rpc_attach_file_to_purchase', {
    p_id: input.purchaseId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_file_size: input.fileSize,
  });
}

export async function removePurchaseAttachment(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return callRpc<{ success: boolean; id: string }>('rpc_remove_purchase_attachment', {
    p_attachment_id: attachmentId,
  });
}

// =========================================================
// Helpers
// =========================================================

export function formatCurrency(
  amount: number | null | undefined,
  currency: Currency,
): string {
  if (amount == null) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  try {
    return formatter.format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatQty(value: number | null | undefined): string {
  if (value == null) return '—';
  // Trim trailing zeros for whole numbers; keep up to 3 decimals.
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, '');
}
