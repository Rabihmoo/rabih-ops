import { useEffect, useRef, useState } from 'react';
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
import { useCalendarLinkStatus } from '@/hooks/useGoogleCalendar';
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
// F1.1: status set widened (was pending/done/snoozed/cancelled).
const STATUSES: FollowUpStatus[] = [
  'pending', 'working', 'waiting', 'no_answer',
  'postponed', 'done', 'cancelled',
];

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

export interface FollowUpFormSeed {
  title?: string;
  description?: string;
  person?: string;
  branch?: string;
  due_date?: string; // yyyy-mm-dd
}

// Phase-2 orchestration inputs surfaced by create mode only. The form
// collects + validates these fields; the page runs the actual reminder
// + calendar mutations after rpc_create_follow_up succeeds. Edit mode
// never emits an extras object.
export interface FollowUpCreateExtras {
  reminderAt: string | null;
  calendar: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
    invitees: string[];
  } | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function composeIsoFromLocalDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${date}T${hhmmss}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseInviteeList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

function defaultCalendarStart(opts: {
  reminderIso: string | null;
  dueDate: string | null;
}): Date {
  if (opts.reminderIso) {
    const d = new Date(opts.reminderIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (opts.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueDate)) {
    const [y, m, d] = opts.dueDate.split('-').map((s) => parseInt(s, 10));
    return new Date(y, m - 1, d, 9, 0, 0, 0);
  }
  const f = new Date();
  f.setHours(f.getHours() + 1, 0, 0, 0);
  return f;
}

export function FollowUpForm({
  initial,
  initialTaskId,
  seed,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: FollowUpRow;
  initialTaskId?: string;
  seed?: FollowUpFormSeed;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (
    input: CreateFollowUpInput | UpdateFollowUpInput,
    extras?: FollowUpCreateExtras,
  ) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const allowedBranches = BRANCH_LIST.filter((b) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'ceo') return true;
    return profile.branches.includes(b.code) || profile.branches.includes('all');
  });

  const safeSeedBranch =
    seed?.branch && allowedBranches.some((b) => b.code === seed.branch)
      ? seed.branch
      : undefined;
  const safeSeedDate =
    seed?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(seed.due_date)
      ? seed.due_date
      : undefined;

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
          title: seed?.title?.slice(0, 200) ?? '',
          description: seed?.description?.slice(0, 2000) ?? '',
          person: seed?.person?.slice(0, 120) ?? '',
          branch: safeSeedBranch ?? '',
          category: 'call',
          priority: 'normal',
          due_date: safeSeedDate ?? new Date().toISOString().slice(0, 10),
          snoozed_until: '',
          assignment: 'unassigned',
          task_id: initialTaskId ?? '',
        },
  });

  // ===== Create-only state: optional reminder + calendar invitee fields.
  // These run after rpc_create_follow_up succeeds (best-effort phase 2 in
  // the page); the form is just the input surface. App assignment lives
  // on the row itself and never touches this state.
  const calendarStatus = useCalendarLinkStatus();
  const calendarConnected = calendarStatus.data?.connected === true;
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [calStart, setCalStart] = useState('');
  const [calEnd, setCalEnd] = useState('');
  const [invitees, setInvitees] = useState('');
  // Once the operator manually edits calStart/calEnd, suppress further
  // auto-rederivation from reminder/due_date changes. Resets when the
  // checkbox is unchecked.
  const calTouchedRef = useRef(false);

  const dueDateValue = form.watch('due_date');
  const composedReminder = composeIsoFromLocalDateTime(reminderDate, reminderTime);
  const reminderInPast =
    composedReminder !== null && new Date(composedReminder).getTime() < Date.now();

  useEffect(() => {
    if (!addToCalendar) {
      calTouchedRef.current = false;
      return;
    }
    if (calTouchedRef.current) return;
    const start = defaultCalendarStart({
      reminderIso: composedReminder,
      dueDate: dueDateValue ?? null,
    });
    setCalStart(toLocalInputValue(start));
    setCalEnd(toLocalInputValue(new Date(start.getTime() + 30 * 60 * 1000)));
  }, [addToCalendar, composedReminder, dueDateValue]);

  function handleCalStartChange(value: string) {
    calTouchedRef.current = true;
    setCalStart(value);
  }
  function handleCalEndChange(value: string) {
    calTouchedRef.current = true;
    setCalEnd(value);
  }

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

        let calendar: FollowUpCreateExtras['calendar'] = null;
        if (addToCalendar && calendarConnected) {
          const sDate = new Date(calStart);
          const eDate = new Date(calEnd);
          if (!calStart || !calEnd || isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
            toast({ title: 'Invalid calendar date/time', variant: 'destructive' });
            return;
          }
          if (eDate <= sDate) {
            toast({ title: 'Calendar end must be after start', variant: 'destructive' });
            return;
          }
          calendar = {
            start: sDate.toISOString(),
            end: eDate.toISOString(),
            invitees: parseInviteeList(invitees),
          };
        }

        const extras: FollowUpCreateExtras | undefined =
          composedReminder !== null || calendar !== null
            ? { reminderAt: composedReminder, calendar }
            : undefined;
        await onSubmit(payload, extras);
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

      {!isEdit && (
        <div
          className="border-border space-y-3 rounded-md border p-4"
          data-testid="follow-up-create-reminder-section"
        >
          <div className="text-section-label">Reminder (optional)</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-reminder-date" className="text-xs">Date</Label>
              <Input
                id="create-reminder-date"
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                data-testid="follow-up-create-reminder-date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-reminder-time" className="text-xs">Time</Label>
              <Input
                id="create-reminder-time"
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                data-testid="follow-up-create-reminder-time"
              />
            </div>
          </div>
          {reminderInPast && (
            <p
              data-testid="follow-up-create-reminder-past-warning"
              className="text-warning-ink text-xs"
            >
              That time is in the past — the reminder will fire on the next drain cycle.
            </p>
          )}
          <p className="text-subtle-foreground text-xs">
            Adds an in-app reminder. Manage other channels (Telegram, etc.) after creation.
          </p>
        </div>
      )}

      {!isEdit && calendarConnected && (
        <div
          className="border-border space-y-3 rounded-md border p-4"
          data-testid="follow-up-create-calendar-section"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addToCalendar}
              onChange={(e) => setAddToCalendar(e.target.checked)}
              data-testid="follow-up-create-add-to-calendar"
            />
            Add to Google Calendar
          </label>
          {addToCalendar && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-cal-start" className="text-xs">Starts</Label>
                  <Input
                    id="create-cal-start"
                    type="datetime-local"
                    value={calStart}
                    onChange={(e) => handleCalStartChange(e.target.value)}
                    data-testid="follow-up-create-cal-start"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-cal-end" className="text-xs">Ends</Label>
                  <Input
                    id="create-cal-end"
                    type="datetime-local"
                    value={calEnd}
                    onChange={(e) => handleCalEndChange(e.target.value)}
                    data-testid="follow-up-create-cal-end"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-cal-invitees" className="text-xs">
                  Calendar invitees (optional)
                </Label>
                <Input
                  id="create-cal-invitees"
                  type="text"
                  placeholder="email@example.com, another@example.com"
                  value={invitees}
                  onChange={(e) => setInvitees(e.target.value)}
                  data-testid="follow-up-create-cal-invitees"
                />
                <p className="text-subtle-foreground text-xs">
                  Comma-separated. Google sends each one a calendar invite. This does not change who's responsible in Rabih Ops.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
