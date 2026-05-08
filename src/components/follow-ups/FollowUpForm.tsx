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
  FollowUpCategory,
  FollowUpRow,
  FollowUpStatus,
  TaskPriority,
} from '@/types/database';
import type { CreateFollowUpInput, UpdateFollowUpInput } from '@/lib/follow-ups';

const CATEGORIES: FollowUpCategory[] = [
  'call',
  'whatsapp',
  'email',
  'meeting',
  'check_in_person',
];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];
const STATUSES: FollowUpStatus[] = ['pending', 'done', 'snoozed', 'cancelled'];

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
  person: z.string().max(200, 'Name too long').optional().or(z.literal('')),
  branch: z.string().optional().or(z.literal('')),
  category: z.enum(CATEGORIES as [FollowUpCategory, ...FollowUpCategory[]]),
  priority: z.enum(PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  status: z.enum(STATUSES as [FollowUpStatus, ...FollowUpStatus[]]).optional(),
  due_date: z.string().min(1, 'Due date is required'),
  snoozed_until: z.string().optional().or(z.literal('')),
  assignment: z.enum(['me', 'unassigned']),
  task_id: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function FollowUpForm({
  initial,
  initialTaskId,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: FollowUpRow;
  initialTaskId?: string;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (input: CreateFollowUpInput | UpdateFollowUpInput) => Promise<void>;
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
          description: initial.description ?? '',
          person: initial.person ?? '',
          branch: initial.branch ?? '',
          category: initial.category as FollowUpCategory,
          priority: initial.priority as TaskPriority,
          status: initial.status as FollowUpStatus,
          due_date: initial.due_date,
          snoozed_until: initial.snoozed_until ?? '',
          assignment:
            initial.assigned_to && initial.assigned_to === profile?.id ? 'me' : 'unassigned',
          task_id: initial.task_id ?? '',
        }
      : {
          title: '',
          description: '',
          person: '',
          branch: '',
          category: 'call',
          priority: 'normal',
          due_date: new Date().toISOString().slice(0, 10),
          snoozed_until: '',
          assignment: 'unassigned',
          task_id: initialTaskId ?? '',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const assigned_to = values.assignment === 'me' ? (profile?.id ?? null) : null;
      const branch = values.branch && values.branch.length > 0 ? values.branch : null;
      const description =
        values.description && values.description.length > 0 ? values.description : null;
      const person =
        values.person && values.person.length > 0 ? values.person : null;
      const task_id =
        values.task_id && values.task_id.length > 0 ? values.task_id : null;

      if (isEdit) {
        const payload: UpdateFollowUpInput = {
          title: values.title,
          description,
          person,
          branch,
          category: values.category,
          priority: values.priority,
          status: values.status,
          due_date: values.due_date,
          snoozed_until:
            values.snoozed_until && values.snoozed_until.length > 0
              ? values.snoozed_until
              : null,
          assigned_to,
          task_id,
        };
        await onSubmit(payload);
      } else {
        const payload: CreateFollowUpInput = {
          category: values.category,
          title: values.title,
          due_date: values.due_date,
          branch,
          priority: values.priority,
          description,
          person,
          assigned_to,
          task_id,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update follow-up' : 'Could not create follow-up',
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="person">Person (optional)</Label>
          <Input id="person" autoComplete="off" {...form.register('person')} />
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
          <Label htmlFor="branch">Branch (optional — leave blank for cross-branch)</Label>
          <select id="branch" className={fieldClass} {...form.register('branch')}>
            <option value="">Cross-branch</option>
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
          <Label htmlFor="due_date">Due date</Label>
          <Input id="due_date" type="date" {...form.register('due_date')} />
          {form.formState.errors.due_date && (
            <p className="text-destructive text-xs">
              {form.formState.errors.due_date.message}
            </p>
          )}
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="snoozed_until">Snoozed until (optional)</Label>
            <Input id="snoozed_until" type="date" {...form.register('snoozed_until')} />
          </div>
        )}

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select id="status" className={fieldClass} {...form.register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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

      {/* task_id is a hidden field set by URL or by edit mode */}
      <input type="hidden" {...form.register('task_id')} />

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
