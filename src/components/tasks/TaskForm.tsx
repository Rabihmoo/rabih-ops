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
  TaskStatus,
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
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];

const baseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
  branch: z.string().min(1, 'Branch is required'),
  category: z.enum(CATEGORIES as [TaskCategory, ...TaskCategory[]]),
  priority: z.enum(PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  status: z.enum(STATUSES as [TaskStatus, ...TaskStatus[]]).optional(),
  due_date: z.string().optional().or(z.literal('')),
  assignment: z.enum(['me', 'unassigned']),
});

type FormValues = z.infer<typeof baseSchema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function TaskForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: TaskRow;
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
          status: initial.status as TaskStatus,
          due_date: initial.due_date ?? '',
          assignment:
            initial.assigned_to && initial.assigned_to === profile?.id ? 'me' : 'unassigned',
        }
      : {
          title: '',
          description: '',
          branch: allowedBranches[0]?.code ?? '',
          category: 'operations',
          priority: 'normal',
          due_date: '',
          assignment: 'unassigned',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const assigned_to =
        values.assignment === 'me' ? (profile?.id ?? null) : null;
      const due_date = values.due_date && values.due_date.length > 0 ? values.due_date : null;
      const description =
        values.description && values.description.length > 0 ? values.description : null;

      if (isEdit) {
        const payload: UpdateTaskInput = {
          title: values.title,
          description,
          branch: values.branch,
          category: values.category,
          priority: values.priority,
          status: values.status,
          due_date,
          assigned_to,
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

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select id="status" className={fieldClass} {...form.register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        )}

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

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
