import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { BRANCH_LIST } from '@/lib/branches';
import { useAuthStore } from '@/stores/authStore';
import type {
  Currency,
  PaymentMethod,
  PurchaseRequestRow,
  TaskPriority,
} from '@/types/database';
import type {
  CreatePurchaseInput,
  UpdatePurchaseInput,
} from '@/lib/purchase-requests';

const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];
const CURRENCIES: Currency[] = ['MZN', 'USD', 'LBP'];
const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'mpesa',
  'card',
  'invoice',
  'other',
];

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  supplier_name: z.string().min(1, 'Supplier is required').max(200),
  supplier_website: z
    .string()
    .max(500, 'URL too long')
    .optional()
    .or(z.literal('')),
  branch: z.string().min(1, 'Branch is required'),
  priority: z.enum(PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
  payment_method: z
    .enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]])
    .optional()
    .or(z.literal('')),
  total_amount: z.string().optional().or(z.literal('')),
  qty_ordered: z.string().optional().or(z.literal('')),
  expected_delivery_date: z.string().optional().or(z.literal('')),
  reminder_date: z.string().optional().or(z.literal('')),
  notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const numericFieldClass = `${fieldClass} text-right tabular-nums`;

export function PurchaseForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: PurchaseRequestRow;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (input: CreatePurchaseInput | UpdatePurchaseInput) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const allowedBranches = BRANCH_LIST.filter((b) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'ceo') return true;
    return profile.branches.includes(b.code) || profile.branches.includes('all');
  });

  const isEdit = !!initial;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          title: initial.title,
          supplier_name: initial.supplier_name,
          supplier_website: initial.supplier_website ?? '',
          branch: initial.branch,
          priority: initial.priority as TaskPriority,
          currency: initial.currency as Currency,
          payment_method: (initial.payment_method as PaymentMethod | null) ?? '',
          total_amount: initial.total_amount?.toString() ?? '',
          qty_ordered: initial.qty_ordered?.toString() ?? '',
          expected_delivery_date: initial.expected_delivery_date ?? '',
          reminder_date: initial.reminder_date ?? '',
          notes: initial.notes ?? '',
        }
      : {
          title: '',
          supplier_name: '',
          supplier_website: '',
          branch: allowedBranches[0]?.code ?? '',
          priority: 'normal',
          currency: 'MZN',
          payment_method: '',
          total_amount: '',
          qty_ordered: '',
          expected_delivery_date: '',
          reminder_date: '',
          notes: '',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const supplier_website = values.supplier_website?.trim() || null;
      const payment_method = values.payment_method
        ? (values.payment_method as PaymentMethod)
        : null;
      const total_amount =
        values.total_amount && values.total_amount.trim() !== ''
          ? Number(values.total_amount)
          : null;
      const qty_ordered =
        values.qty_ordered && values.qty_ordered.trim() !== ''
          ? Number(values.qty_ordered)
          : null;
      const expected_delivery_date = values.expected_delivery_date || null;
      const reminder_date = values.reminder_date || null;
      const notes = values.notes?.trim() || null;

      if (isEdit) {
        const payload: UpdatePurchaseInput = {
          title: values.title,
          supplier_name: values.supplier_name,
          supplier_website,
          branch: values.branch,
          priority: values.priority,
          currency: values.currency,
          payment_method,
          total_amount,
          qty_ordered,
          expected_delivery_date,
          reminder_date,
          notes,
        };
        await onSubmit(payload);
      } else {
        const payload: CreatePurchaseInput = {
          title: values.title,
          supplier_name: values.supplier_name,
          supplier_website,
          branch: values.branch,
          priority: values.priority,
          currency: values.currency,
          payment_method,
          total_amount,
          qty_ordered,
          expected_delivery_date,
          reminder_date,
          notes,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update request' : 'Could not create request',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" autoComplete="off" {...form.register('title')} />
          {form.formState.errors.title && (
            <p className="text-destructive-ink text-xs">
              {form.formState.errors.title.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="supplier_name">Supplier</Label>
          <Input id="supplier_name" autoComplete="off" {...form.register('supplier_name')} />
          {form.formState.errors.supplier_name && (
            <p className="text-destructive-ink text-xs">
              {form.formState.errors.supplier_name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="supplier_website">Supplier website (optional)</Label>
          <Input
            id="supplier_website"
            type="url"
            placeholder="https://"
            {...form.register('supplier_website')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <select id="branch" className={fieldClass} {...form.register('branch')}>
            {allowedBranches.length === 0 && (
              <option value="">No branches available</option>
            )}
            {allowedBranches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" className={fieldClass} {...form.register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <select id="currency" className={fieldClass} {...form.register('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="payment_method">Payment method (optional)</Label>
          <select
            id="payment_method"
            className={fieldClass}
            {...form.register('payment_method')}
          >
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="total_amount">Total amount (optional)</Label>
          <Input
            id="total_amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            className={numericFieldClass}
            {...form.register('total_amount')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="qty_ordered">Quantity ordered (optional)</Label>
          <Input
            id="qty_ordered"
            type="number"
            step="0.001"
            placeholder="0"
            className={numericFieldClass}
            {...form.register('qty_ordered')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expected_delivery_date">Expected delivery</Label>
          <Input
            id="expected_delivery_date"
            type="date"
            {...form.register('expected_delivery_date')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reminder_date">Reminder date</Label>
          <Input id="reminder_date" type="date" {...form.register('reminder_date')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          rows={3}
          className={`${fieldClass} h-auto py-2`}
          placeholder="Additional context, constraints, references…"
          {...form.register('notes')}
        />
      </div>

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
