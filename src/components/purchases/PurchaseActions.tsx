import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  PackageCheck,
  Send,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import {
  useApprovePurchase,
  useCancelPurchase,
  useRecordDelivery,
  useRecordPayment,
  useSetPurchaseReminder,
  useSubmitPurchase,
} from '@/hooks/usePurchaseRequests';
import { useCanAdminPurchases, useCanMutate } from '@/hooks/usePermissions';
import { formatCurrency, formatQty } from '@/lib/purchase-requests';
import type {
  Currency,
  PaymentMethod,
  PurchaseRequestRow,
  PurchaseStatus,
} from '@/types/database';

const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'mpesa',
  'card',
  'invoice',
  'other',
];

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

type Panel =
  | null
  | 'submit'
  | 'approve'
  | 'cancel'
  | 'delivery'
  | 'payment'
  | 'reminder';

export function PurchaseActions({ purchase }: { purchase: PurchaseRequestRow }) {
  const status = purchase.status as PurchaseStatus;
  const canMutate = useCanMutate();
  const canAdmin = useCanAdminPurchases();

  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  // Visibility rules — closed/done states gate everything down to comments.
  const showSubmit = canMutate && status === 'draft';
  const showApprove = canAdmin && (status === 'draft' || status === 'submitted');
  const showCancel = canAdmin && status !== 'fully_received' && status !== 'cancelled';
  const showDelivery =
    canMutate &&
    (status === 'ordered' ||
      status === 'partially_received' ||
      status === 'fully_received');
  const showPayment = canAdmin && status !== 'draft' && status !== 'cancelled';
  const showReminder =
    canMutate && status !== 'fully_received' && status !== 'cancelled';

  const lifecycleHasActions = showSubmit || showApprove || showCancel;
  const opsHasActions = showDelivery || showPayment || showReminder;

  if (!lifecycleHasActions && !opsHasActions) return null;

  return (
    <div className="space-y-4">
      {lifecycleHasActions && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Lifecycle</div>
            <div className="flex flex-wrap gap-2">
              {showSubmit && (
                <Button
                  size="sm"
                  variant={panel === 'submit' ? 'default' : 'outline'}
                  onClick={() => setPanel(panel === 'submit' ? null : 'submit')}
                >
                  <Send className="mr-1.5 h-4 w-4" /> Submit for approval
                </Button>
              )}
              {showApprove && (
                <Button
                  size="sm"
                  variant={panel === 'approve' ? 'default' : 'outline'}
                  onClick={() => setPanel(panel === 'approve' ? null : 'approve')}
                  data-testid="purchase-approve-button"
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve and order
                </Button>
              )}
              {showCancel && (
                <Button
                  size="sm"
                  variant={panel === 'cancel' ? 'destructive' : 'outline'}
                  onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')}
                >
                  <XCircle className="mr-1.5 h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            {panel === 'submit' && <SubmitPanel purchase={purchase} onDone={close} />}
            {panel === 'approve' && <ApprovePanel purchase={purchase} onDone={close} />}
            {panel === 'cancel' && <CancelPanel purchase={purchase} onDone={close} />}
          </CardContent>
        </Card>
      )}

      {opsHasActions && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Operational</div>
            <div className="flex flex-wrap gap-2">
              {showDelivery && (
                <Button
                  size="sm"
                  variant={panel === 'delivery' ? 'default' : 'outline'}
                  onClick={() => setPanel(panel === 'delivery' ? null : 'delivery')}
                  data-testid="purchase-delivery-button"
                >
                  <PackageCheck className="mr-1.5 h-4 w-4" /> Record delivery
                </Button>
              )}
              {showPayment && (
                <Button
                  size="sm"
                  variant={panel === 'payment' ? 'default' : 'outline'}
                  onClick={() => setPanel(panel === 'payment' ? null : 'payment')}
                  data-testid="purchase-payment-button"
                >
                  <CircleDollarSign className="mr-1.5 h-4 w-4" /> Record payment
                </Button>
              )}
              {showReminder && (
                <Button
                  size="sm"
                  variant={panel === 'reminder' ? 'default' : 'outline'}
                  onClick={() => setPanel(panel === 'reminder' ? null : 'reminder')}
                >
                  <Bell className="mr-1.5 h-4 w-4" /> Set reminder
                </Button>
              )}
            </div>

            {panel === 'delivery' && <DeliveryPanel purchase={purchase} onDone={close} />}
            {panel === 'payment' && <PaymentPanel purchase={purchase} onDone={close} />}
            {panel === 'reminder' && <ReminderPanel purchase={purchase} onDone={close} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =========================================================
// Lifecycle panels
// =========================================================

function SubmitPanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const submit = useSubmitPurchase();
  return (
    <PanelShell>
      <p className="text-muted-foreground text-sm">
        Submit this draft for admin/CEO approval. You can still edit it until it's
        approved.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync(purchase.id);
              toast({ title: 'Submitted for approval' });
              onDone();
            } catch (err) {
              toast({
                title: 'Could not submit',
                description: err instanceof Error ? err.message : 'Unknown error',
                variant: 'destructive',
              });
            }
          }}
        >
          {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm submit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </PanelShell>
  );
}

function ApprovePanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const approve = useApprovePurchase();
  const [totalAmount, setTotalAmount] = useState(
    purchase.total_amount?.toString() ?? '',
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    purchase.payment_method ?? '',
  );
  const [orderDate, setOrderDate] = useState(
    purchase.order_date ?? new Date().toISOString().slice(0, 10),
  );

  const handle = async () => {
    try {
      await approve.mutateAsync({
        id: purchase.id,
        input: {
          total_amount: totalAmount ? Number(totalAmount) : null,
          payment_method: paymentMethod ? (paymentMethod as PaymentMethod) : null,
          order_date: orderDate || null,
        },
      });
      toast({ title: 'Approved and ordered' });
      onDone();
    } catch (err) {
      toast({
        title: 'Could not approve',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <PanelShell>
      <p className="text-muted-foreground text-sm">
        Moves this request from {purchase.status} to <strong>ordered</strong> and stamps
        the order date.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="approve-total">
            Total amount ({purchase.currency})
          </Label>
          <Input
            id="approve-total"
            type="number"
            step="0.01"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="text-right tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="approve-method">
            Payment method
          </Label>
          <select
            id="approve-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={fieldClass}
          >
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="approve-date">
            Order date
          </Label>
          <Input
            id="approve-date"
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handle} disabled={approve.isPending}>
          {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm approve
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </PanelShell>
  );
}

function CancelPanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const cancel = useCancelPurchase();
  const [reason, setReason] = useState('');

  const handle = async () => {
    try {
      await cancel.mutateAsync({
        id: purchase.id,
        reason: reason.trim() || undefined,
      });
      toast({ title: 'Purchase cancelled' });
      onDone();
    } catch (err) {
      toast({
        title: 'Could not cancel',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <PanelShell>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="cancel-reason">
          Reason (optional — appended as a system comment)
        </Label>
        <Input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being cancelled?"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={handle}
          disabled={cancel.isPending}
        >
          {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm cancel
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Keep open
        </Button>
      </div>
    </PanelShell>
  );
}

// =========================================================
// Operational panels
// =========================================================

function DeliveryPanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const record = useRecordDelivery();
  const [qty, setQty] = useState(
    purchase.qty_received?.toString() ?? purchase.qty_ordered?.toString() ?? '',
  );
  const [date, setDate] = useState(
    purchase.actual_delivery_date ?? new Date().toISOString().slice(0, 10),
  );

  const qtyNum = Number(qty);
  const ordered = purchase.qty_ordered ?? null;
  const isFull = ordered != null && Number.isFinite(qtyNum) && qtyNum >= ordered;
  const isPartial =
    ordered != null && Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum < ordered;

  const handle = async () => {
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast({ title: 'Enter a non-negative number', variant: 'destructive' });
      return;
    }
    try {
      await record.mutateAsync({
        id: purchase.id,
        input: { qty_received: qtyNum, delivery_date: date || null },
      });
      toast({ title: 'Delivery recorded' });
      onDone();
    } catch (err) {
      toast({
        title: 'Could not record delivery',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <PanelShell>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="delivery-qty">
            Quantity received
            {ordered != null && (
              <span className="text-subtle-foreground ml-2">
                of {formatQty(ordered)} ordered
              </span>
            )}
          </Label>
          <Input
            id="delivery-qty"
            type="number"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="text-right tabular-nums"
            data-testid="delivery-qty-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="delivery-date">
            Delivery date
          </Label>
          <Input
            id="delivery-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
      {ordered != null && qty.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Will mark this as{' '}
          {isFull ? (
            <span className="text-success-ink font-semibold">fully received</span>
          ) : isPartial ? (
            <span className="text-warning-ink font-semibold">partially received</span>
          ) : (
            <span>ordered (not yet received)</span>
          )}
          .
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={handle} disabled={record.isPending}>
          {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm delivery
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </PanelShell>
  );
}

function PaymentPanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const record = useRecordPayment();
  const [amount, setAmount] = useState(
    purchase.amount_paid?.toString() ?? purchase.total_amount?.toString() ?? '',
  );
  const [method, setMethod] = useState<string>(purchase.payment_method ?? '');

  const amountNum = Number(amount);
  const total = purchase.total_amount ?? null;
  const willBePaid =
    total != null && Number.isFinite(amountNum) && amountNum >= total;
  const willBePartial =
    total != null && Number.isFinite(amountNum) && amountNum > 0 && amountNum < total;

  const handle = async () => {
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast({ title: 'Enter a non-negative amount', variant: 'destructive' });
      return;
    }
    try {
      await record.mutateAsync({
        id: purchase.id,
        input: {
          amount_paid: amountNum,
          payment_method: method ? (method as PaymentMethod) : null,
        },
      });
      toast({ title: 'Payment recorded' });
      onDone();
    } catch (err) {
      toast({
        title: 'Could not record payment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <PanelShell>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="payment-amount">
            Amount paid ({purchase.currency})
            {total != null && (
              <span className="text-subtle-foreground ml-2">
                of {formatCurrency(total, purchase.currency as Currency)}
              </span>
            )}
          </Label>
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-right tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="payment-method">
            Payment method
          </Label>
          <select
            id="payment-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={fieldClass}
          >
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
      {total != null && amount.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Will mark payment as{' '}
          {willBePaid ? (
            <span className="text-success-ink font-semibold">paid</span>
          ) : willBePartial ? (
            <span className="text-warning-ink font-semibold">partial</span>
          ) : (
            <span className="text-destructive-ink font-semibold">unpaid</span>
          )}
          .
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={handle} disabled={record.isPending}>
          {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm payment
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </PanelShell>
  );
}

function ReminderPanel({
  purchase,
  onDone,
}: {
  purchase: PurchaseRequestRow;
  onDone: () => void;
}) {
  const set = useSetPurchaseReminder();
  const [date, setDate] = useState(purchase.reminder_date ?? '');

  const handle = async (clear: boolean) => {
    try {
      await set.mutateAsync({
        id: purchase.id,
        reminderDate: clear ? null : date || null,
      });
      toast({ title: clear ? 'Reminder cleared' : 'Reminder set' });
      onDone();
    } catch (err) {
      toast({
        title: 'Could not save reminder',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <PanelShell>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="reminder-date">
          Surface this purchase on the dashboard on
        </Label>
        <Input
          id="reminder-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => handle(false)} disabled={set.isPending}>
          {set.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        {purchase.reminder_date && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handle(true)}
            disabled={set.isPending}
          >
            Clear reminder
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface-1 mt-2 space-y-3 rounded-md border p-4">
      {children}
    </div>
  );
}
