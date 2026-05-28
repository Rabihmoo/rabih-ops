// Report RPC wrappers + pure display helpers.

import { callRpc } from './rpc';

// =====================================================================
// Types
// =====================================================================

export interface TaskVelocityRow {
  week_start: string;
  created: number;
  finished: number;
}

export interface CurrencyBreakdown {
  currency: string;
  total_amount: number;
  amount_paid: number;
  count: number;
}

export interface SupplierSpendRow {
  supplier_name: string;
  order_count: number;
  total_mzn: number;
  paid_mzn: number;
  currency_breakdown: CurrencyBreakdown[];
}

export interface InspectionPassRateRow {
  week_start: string;
  total: number;
  pass: number;
  issues_found: number;
  failed: number;
}

export interface FollowUpCloseRateRow {
  week_start: string;
  opened: number;
  closed: number;
}

export interface ReportFilters {
  branch?: string | null;
  from?: string; // ISO date
  to?: string;   // ISO date
}

// =====================================================================
// RPC wrappers
// =====================================================================

export async function reportTaskVelocity(f: ReportFilters = {}): Promise<TaskVelocityRow[]> {
  const data = await callRpc<TaskVelocityRow[] | null>('rpc_report_task_velocity', {
    p_branch: f.branch ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
  });
  return data ?? [];
}

export async function reportSupplierSpend(f: ReportFilters = {}): Promise<SupplierSpendRow[]> {
  const data = await callRpc<SupplierSpendRow[] | null>('rpc_report_supplier_spend', {
    p_branch: f.branch ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
  });
  return data ?? [];
}

export async function reportInspectionPassRate(f: ReportFilters = {}): Promise<InspectionPassRateRow[]> {
  const data = await callRpc<InspectionPassRateRow[] | null>('rpc_report_inspection_pass_rate', {
    p_branch: f.branch ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
  });
  return data ?? [];
}

export async function reportFollowUpCloseRate(f: ReportFilters = {}): Promise<FollowUpCloseRateRow[]> {
  const data = await callRpc<FollowUpCloseRateRow[] | null>('rpc_report_follow_up_close_rate', {
    p_branch: f.branch ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
  });
  return data ?? [];
}
