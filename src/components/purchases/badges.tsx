import { cn } from '@/lib/utils';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type {
  PaymentMethod,
  PaymentStatus,
  PurchaseStatus,
} from '@/types/database';

// Phase 4.4 — both PurchaseStatusBadge and PaymentStatusBadge graduate to
// the shared StatusChip primitive (rounded-pill, tracking-wide, premium
// tone tinting). Tone tables below map enums → StatusTone. PaymentMethod
// stays plain informational text since it isn't a status.

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

const STATUS_TONE: Record<PurchaseStatus, StatusTone> = {
  draft:              'muted',
  submitted:          'info',
  ordered:            'warning',
  partially_received: 'warning',
  fully_received:     'success',
  cancelled:          'muted',
};

export function PurchaseStatusBadge({
  status,
  className,
}: {
  status: PurchaseStatus;
  className?: string;
}) {
  return (
    <StatusChip tone={STATUS_TONE[status]} size="xs" className={className}>
      {STATUS_LABEL[status]}
    </StatusChip>
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

const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  unpaid:  'critical',
  partial: 'warning',
  paid:    'success',
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <StatusChip tone={PAYMENT_TONE[status]} size="xs" className={className}>
      {PAYMENT_LABEL[status]}
    </StatusChip>
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
        'text-foreground-72 inline-flex items-center text-xs',
        className,
      )}
    >
      {METHOD_LABEL[method]}
    </span>
  );
}
