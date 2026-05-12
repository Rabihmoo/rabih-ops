import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BranchBadge, TONE_BAR } from '@/components/tasks/badges';
import { StatusChip } from '@/components/ui/status-chip';
import {
  formatCurrency,
  formatQty,
  type PurchaseListItem as PurchaseListItemType,
} from '@/lib/purchase-requests';
import type {
  Currency,
  PaymentStatus,
  PurchaseStatus,
} from '@/types/database';
import { PaymentStatusBadge, PurchaseStatusBadge } from './badges';

// Tone hierarchy:
//   destructive — delivery overdue, OR unpaid + already received
//   warning     — payment partial / awaiting delivery near term / partial receive
//   primary     — submitted (awaiting approval)
//   muted       — draft / fully done / cancelled
function tone(row: PurchaseListItemType) {
  const status = row.status as PurchaseStatus;
  const paymentStatus = row.payment_status as PaymentStatus;
  if (row.is_overdue) return 'destructive';
  if (status === 'fully_received' && paymentStatus === 'unpaid') return 'destructive';
  if (status === 'submitted') return 'primary';
  if (status === 'partially_received') return 'warning';
  if (paymentStatus === 'partial') return 'warning';
  return 'muted';
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function dueLabel(row: PurchaseListItemType): { text: string; tone: string } {
  const status = row.status as PurchaseStatus;
  if (status === 'fully_received' && row.actual_delivery_date) {
    return { text: `received ${formatDate(row.actual_delivery_date)}`, tone: 'text-muted-foreground' };
  }
  if (!row.expected_delivery_date) {
    return { text: 'no date', tone: 'text-subtle-foreground' };
  }
  if (row.is_overdue) {
    return {
      text: `overdue · ${formatDate(row.expected_delivery_date)}`,
      tone: 'text-destructive-ink',
    };
  }
  return {
    text: `expected ${formatDate(row.expected_delivery_date)}`,
    tone: 'text-muted-foreground',
  };
}

export function PurchaseListItem({
  purchase,
  onSelect,
}: {
  purchase: PurchaseListItemType;
  onSelect?: (id: string) => void;
}) {
  const status = purchase.status as PurchaseStatus;
  const paymentStatus = purchase.payment_status as PaymentStatus;
  const t = tone(purchase);
  const due = dueLabel(purchase);
  const closed = status === 'fully_received' || status === 'cancelled';

  const showQtyProgress =
    purchase.qty_ordered != null && purchase.qty_received != null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(purchase.id)}
      className="group border-border bg-card hover:bg-surface-1 focus-visible:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors focus-visible:outline-none"
    >
      <span aria-hidden className={cn('w-1 shrink-0 self-stretch', TONE_BAR[t])} />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'truncate text-[15px] font-medium leading-snug',
                closed && 'text-muted-foreground',
              )}
            >
              {purchase.title}
            </div>
            <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
              {purchase.supplier_name}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {purchase.total_amount != null && (
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  closed && status !== 'fully_received'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {formatCurrency(purchase.total_amount, purchase.currency as Currency)}
              </span>
            )}
            <span className={cn('text-xs font-medium tabular-nums', due.tone)}>
              {purchase.is_overdue && (
                <AlertTriangle className="mr-1 inline h-3 w-3 -translate-y-px" />
              )}
              {due.text}
            </span>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <PurchaseStatusBadge status={status} />
          <PaymentStatusBadge status={paymentStatus} />
          <BranchBadge branch={purchase.branch} />
          {showQtyProgress && (
            <span
              className={cn(
                'text-[11px] font-medium tabular-nums',
                purchase.qty_received! >= purchase.qty_ordered!
                  ? 'text-success-ink'
                  : 'text-muted-foreground',
              )}
            >
              {formatQty(purchase.qty_received)} / {formatQty(purchase.qty_ordered)} received
            </span>
          )}
          {purchase.priority === 'urgent' && (
            <StatusChip tone="critical" size="xs">urgent</StatusChip>
          )}
          <span className="text-subtle-foreground text-xs">
            by {purchase.requested_by_name}
          </span>
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground/0 group-hover:text-muted-foreground mr-3 h-4 w-4 self-center shrink-0 transition-colors"
      />
    </button>
  );
}
