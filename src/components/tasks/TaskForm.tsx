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
  TaskCategory,
  TaskPriority,
  TaskRow,
} from '@/types/database';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/tasks';

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

// Helpers for the datetime-local <input> fields (no timezone bytes).
// We round-trip through the user's local timezone — the reminder engine in
// Phase B will assume Africa/Maputo as the canonical business timezone.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const baseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
  branch: z.string().min(1, 'Branch is required'),
  category: z.enum(CATEGORIES as [TaskCategory, ...TaskCategory[]]),
  priority: z.enum(PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  due_date: z.string().optional().or(z.literal('')),
  assignment: z.enum(['me', 'unassigned']),
  start_reminder_at: z.string().optional().or(z.literal('')),
  follow_up_reminder_at: z.string().optional().or(z.literal('')),
  deadline_reminder_at: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof baseSchema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export interface TaskFormSeed {
  title?: string;
  description?: string;
  branch?: string;
  priority?: TaskPriority;
  due_date?: string; // yyyy-mm-dd
}

export function TaskForm({
  initial,
  seed,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: TaskRow;
  seed?: TaskFormSeed;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const allowedBranches = BRANCH_LIST.filter((b) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'ceo') return true;
    return profile.branches.includes(b.code) || profile.branches.includes('all');
  });

  // Sanitise seed values against allowed enums + branch access. Reject
  // anything we don't recognise rather than letting it land in the form.
  const safeSeedBranch =
    seed?.branch && allowedBranches.some((b) => b.code === seed.branch)
      ? seed.branch
      : undefined;
  const safeSeedPriority =
    seed?.priority && (PRIORITIES as string[]).includes(seed.priority)
      ? seed.priority
      : undefined;
  const safeSeedDate =
    seed?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(seed.due_date)
      ? seed.due_date
      : undefined;

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
          due_date: initial.due_date ?? '',
          assignment:
            initial.assigned_to && initial.assigned_to === profile?.id ? 'me' : 'unassigned',
          start_reminder_at: toLocalInputValue(initial.start_reminder_at),
          follow_up_reminder_at: toLocalInputValue(initial.follow_up_reminder_at),
          deadline_reminder_at: toLocalInputValue(initial.deadline_reminder_at),
        }
      : {
          title: seed?.title?.slice(0, 200) ?? '',
          description: seed?.description?.slice(0, 2000) ?? '',
          branch: safeSeedBranch ?? allowedBranches[0]?.code ?? '',
          category: 'operations',
          priority: safeSeedPriority ?? 'normal',
          due_date: safeSeedDate ?? '',
          assignment: 'unassigned',
          start_reminder_at: '',
          follow_up_reminder_at: '',
          deadline_reminder_at: '',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const assigned_to =
        values.assignment === 'me' ? (profile?.id ?? null) : null;
      const due_date = values.due_date && values.due_date.length > 0 ? values.due_date : null;
      const description =
        values.description && values.description.length > 0 ? values.description : null;

      const start_reminder_at = fromLocalInputValue(values.start_reminder_at ?? '');
      const follow_up_reminder_at = fromLocalInputValue(values.follow_up_reminder_at ?? '');
      const deadline_reminder_at = fromLocalInputValue(values.deadline_reminder_at ?? '');

      if (isEdit) {
        const payload: UpdateTaskInput = {
          title: values.title,
          description,
          branch: values.branch,
          category: values.category,
          priority: values.priority,
          due_date,
          assigned_to,
          start_reminder_at,
          follow_up_reminder_at,
          deadline_reminder_at,
        };
        await onSubmit(payload);
      } else {
        const payload: CreateTaskInput = {
          title: values.title,
          description,
          branch: values.branch,
          category: values.category,
          priority: values.priority,
          due_date,
          assigned_to,
          start_reminder_at,
          follow_up_reminder_at,
          deadline_reminder_at,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update task' : 'Could not create task',
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
          <p className="text-destructive text-xs">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={3}
          className={`${fieldClass} h-auto py-2`}
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p className="text-destructive text-xs">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <select id="branch" className={fieldClass} {...form.register('branch')}>
            {allowedBranches.length === 0 && <option value="">No branches available</option>}
            {allowedBranches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          {form.formState.errors.branch && (
            <p className="text-destructive text-xs">{form.formState.errors.branch.message}</p>
          )}
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
          <Label htmlFor="due_date">Due date</Label>
          <Input id="due_date" type="date" {...form.register('due_date')} />
        </div>

        <div className="space-y-2">
          <Label>Assignment</Label>
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

      <div className="border-border space-y-3 rounded-md border p-4">
        <div className="text-section-label">Reminders (optional)</div>
        <p className="text-muted-foreground text-xs">
          Set when the system should nudge you. Reminder firing arrives in Phase B; values
          stored on the task are used as soon as the engine ships.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="start_reminder_at">Start by</Label>
            <Input
              id="start_reminder_at"
              type="datetime-local"
              {...form.register('start_reminder_at')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="follow_up_reminder_at">Mid-task check</Label>
            <Input
              id="follow_up_reminder_at"
              type="datetime-local"
              {...form.register('follow_up_reminder_at')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline_reminder_at">Pre-deadline</Label>
            <Input
              id="deadline_reminder_at"
              type="datetime-local"
              {...form.register('deadline_reminder_at')}
            />
          </div>
        </div>
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
