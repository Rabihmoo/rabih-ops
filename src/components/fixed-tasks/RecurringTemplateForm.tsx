import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { BRANCH_LIST } from '@/lib/branches';
import { useAuthStore } from '@/stores/authStore';
import { displayTime } from '@/lib/recurring-templates';
import type {
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
} from '@/lib/recurring-templates';
import type {
  RecurrenceCadence,
  TaskCategory,
  TaskPriority,
  TaskRow,
} from '@/types/database';

const CATEGORIES: TaskCategory[] = [
  'operations',
  'hr',
  'training',
  'maintenance',
  'social_media',
  'follow_up',
  'other',
];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];
const CADENCES: RecurrenceCadence[] = ['daily', 'weekly', 'monthly', 'yearly'];

const DOW_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];
const MONTH_OPTIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const baseSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
    description: z
      .string()
      .max(2000, 'Description too long')
      .optional()
      .or(z.literal('')),
    branch: z.string().min(1, 'Branch is required'),
    category: z.enum(CATEGORIES as [TaskCategory, ...TaskCategory[]]),
    priority: z.enum(PRIORITIES as [TaskPriority, ...TaskPriority[]]),
    assignment: z.enum(['me', 'unassigned']),
    recurrence: z.enum(CADENCES as [RecurrenceCadence, ...RecurrenceCadence[]]),
    recurrence_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM'),
    recurrence_dow: z.array(z.number().int().min(0).max(6)).optional(),
    recurrence_dom: z.string().optional().or(z.literal('')),
    recurrence_month: z.string().optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence === 'weekly') {
      if (!v.recurrence_dow || v.recurrence_dow.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence_dow'],
          message: 'Pick at least one day',
        });
      }
    }
    if (v.recurrence === 'monthly') {
      const n = v.recurrence_dom ? Number(v.recurrence_dom) : NaN;
      if (!n || n < 1 || n > 31) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence_dom'],
          message: 'Day must be 1–31',
        });
      }
    }
    if (v.recurrence === 'yearly') {
      const d = v.recurrence_dom ? Number(v.recurrence_dom) : NaN;
      const m = v.recurrence_month ? Number(v.recurrence_month) : NaN;
      if (!d || d < 1 || d > 31) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence_dom'],
          message: 'Day must be 1–31',
        });
      }
      if (!m || m < 1 || m > 12) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence_month'],
          message: 'Month is required',
        });
      }
    }
  });

type FormValues = z.infer<typeof baseSchema>;

export function RecurringTemplateForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: TaskRow;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (
    input: CreateRecurringTemplateInput | UpdateRecurringTemplateInput,
  ) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const allowedBranches = BRANCH_LIST.filter((b) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'ceo') return true;
    return profile.branches.includes(b.code) || profile.branches.includes('all');
  });

  const isEdit = !!initial;
  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          description: initial.description ?? '',
          branch: initial.branch,
          category: initial.category as TaskCategory,
          priority: initial.priority as TaskPriority,
          assignment:
            initial.assigned_to && initial.assigned_to === profile?.id
              ? 'me'
              : 'unassigned',
          recurrence: (initial.recurrence as RecurrenceCadence) ?? 'daily',
          recurrence_time: displayTime(initial.recurrence_time) || '09:00',
          recurrence_dow: initial.recurrence_dow ?? [],
          recurrence_dom:
            initial.recurrence_dom != null ? String(initial.recurrence_dom) : '',
          recurrence_month:
            initial.recurrence_month != null
              ? String(initial.recurrence_month)
              : '',
        }
      : {
          title: '',
          description: '',
          branch: allowedBranches[0]?.code ?? '',
          category: 'operations',
          priority: 'normal',
          assignment: 'unassigned',
          recurrence: 'daily',
          recurrence_time: '09:00',
          recurrence_dow: [],
          recurrence_dom: '',
          recurrence_month: '',
        },
  });

  const cadence = form.watch('recurrence');
  const dowSelected = form.watch('recurrence_dow') ?? [];

  const toggleDow = (d: number) => {
    const cur = new Set(dowSelected);
    if (cur.has(d)) cur.delete(d);
    else cur.add(d);
    form.setValue('recurrence_dow', Array.from(cur), {
      shouldValidate: true,
    });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const assigned_to =
        values.assignment === 'me' ? (profile?.id ?? null) : null;
      const description =
        values.description && values.description.length > 0
          ? values.description
          : null;

      // Cadence-specific shape
      const recurrence_dow =
        values.recurrence === 'weekly' ? values.recurrence_dow ?? [] : null;
      const recurrence_dom =
        values.recurrence === 'monthly' || values.recurrence === 'yearly'
          ? Number(values.recurrence_dom)
          : null;
      const recurrence_month =
        values.recurrence === 'yearly' ? Number(values.recurrence_month) : null;

      // Pad time to HH:MM:SS for Postgres `time`.
      const recurrence_time =
        values.recurrence_time.length === 5
          ? `${values.recurrence_time}:00`
          : values.recurrence_time;

      if (isEdit) {
        const payload: UpdateRecurringTemplateInput = {
          title: values.title,
          description,
          branch: values.branch,
          category: values.category,
          priority: values.priority,
          assigned_to,
          recurrence: values.recurrence,
          recurrence_time,
          recurrence_dow,
          recurrence_dom,
          recurrence_month,
        };
        await onSubmit(payload);
      } else {
        const payload: CreateRecurringTemplateInput = {
          title: values.title,
          description,
          branch: values.branch,
          category: values.category,
          priority: values.priority,
          assigned_to,
          recurrence: values.recurrence,
          recurrence_time,
          recurrence_dow,
          recurrence_dom,
          recurrence_month,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update template' : 'Could not create template',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" autoComplete="off" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-destructive-ink text-xs">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          rows={3}
          className={`${fieldClass} h-auto py-2`}
          {...form.register('description')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Label htmlFor="category">Category</Label>
          <select id="category" className={fieldClass} {...form.register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
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
          <Label>Assignment on each instance</Label>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="unassigned" {...form.register('assignment')} />
              Unassigned
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="me" {...form.register('assignment')} />
              Me ({profile?.full_name ?? 'current user'})
            </label>
          </div>
        </div>
      </div>

      {/* Recurrence */}
      <div className="border-border space-y-4 rounded-md border p-4">
        <div className="text-section-label">Cadence</div>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <label
              key={c}
              className="border-border has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-ink hover:bg-surface-1 cursor-pointer rounded-md border px-3 py-1.5 text-sm capitalize"
            >
              <input
                type="radio"
                value={c}
                className="sr-only"
                {...form.register('recurrence')}
              />
              {c}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recurrence_time">Time (Africa/Maputo)</Label>
            <Input
              id="recurrence_time"
              type="time"
              {...form.register('recurrence_time')}
            />
            {form.formState.errors.recurrence_time && (
              <p className="text-destructive-ink text-xs">
                {form.formState.errors.recurrence_time.message}
              </p>
            )}
          </div>
        </div>

        {cadence === 'weekly' && (
          <div className="space-y-2">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-2">
              {DOW_OPTIONS.map((d) => {
                const checked = dowSelected.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDow(d.value)}
                    aria-pressed={checked}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-primary bg-primary-soft text-primary-ink'
                        : 'border-border text-foreground-72 hover:bg-surface-1'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {form.formState.errors.recurrence_dow && (
              <p className="text-destructive-ink text-xs">
                {form.formState.errors.recurrence_dow.message as string}
              </p>
            )}
          </div>
        )}

        {(cadence === 'monthly' || cadence === 'yearly') && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cadence === 'yearly' && (
              <div className="space-y-2">
                <Label htmlFor="recurrence_month">Month</Label>
                <select
                  id="recurrence_month"
                  className={fieldClass}
                  {...form.register('recurrence_month')}
                >
                  <option value="">Select month</option>
                  {MONTH_OPTIONS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                {form.formState.errors.recurrence_month && (
                  <p className="text-destructive-ink text-xs">
                    {form.formState.errors.recurrence_month.message}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="recurrence_dom">Day of month</Label>
              <Input
                id="recurrence_dom"
                type="number"
                min={1}
                max={31}
                {...form.register('recurrence_dom')}
              />
              {form.formState.errors.recurrence_dom && (
                <p className="text-destructive-ink text-xs">
                  {form.formState.errors.recurrence_dom.message}
                </p>
              )}
              {cadence === 'monthly' && (
                <p className="text-subtle-foreground text-xs">
                  Months without that day are skipped (e.g. day 31 → no Feb instance).
                </p>
              )}
            </div>
          </div>
        )}
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
