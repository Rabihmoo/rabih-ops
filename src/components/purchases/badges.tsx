import { cn } from '@/lib/utils';
import type {
  PaymentMethod,
  PaymentStatus,
  PurchaseStatus,
} from '@/types/database';

const PILL_BASE =
  'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider';

// =========================================================
// Purchase status (lifecycle)
// =========================================================

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  ordered: 'Ordered',
  partially_received: 'Partial',
  fully_received: 'Received',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<PurchaseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary-soft text-primary-ink',
  ordered: 'bg-warning-soft text-warning-ink',
  partially_received: 'bg-warning-soft text-warning-ink',
  fully_received: 'bg-success-soft text-success-ink',
  cancelled: 'bg-muted text-subtle-foreground line-through',
};

export function PurchaseStatusBadge({
  status,
  className,
}: {
  status: PurchaseStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, STATUS_CLASSES[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// =========================================================
// Payment status
// =========================================================

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
};

const PAYMENT_CLASSES: Record<PaymentStatus, string> = {
  unpaid: 'bg-destructive-soft text-destructive-ink',
  partial: 'bg-warning-soft text-warning-ink',
  paid: 'bg-success-soft text-success-ink',
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, PAYMENT_CLASSES[status], className)}>
      {PAYMENT_LABEL[status]}
    </span>
  );
}

// =========================================================
// Payment method (informational chip; no urgency)
// =========================================================

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  mpesa: 'M-Pesa',
  card: 'Card',
  invoice: 'Invoice',
  other: 'Other',
};

export function PaymentMethodTag({
  method,
  className,
}: {
  method: PaymentMethod;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex items-center text-xs',
        className,
      )}
    >
      {METHOD_LABEL[method]}
    </span>
  );
}
