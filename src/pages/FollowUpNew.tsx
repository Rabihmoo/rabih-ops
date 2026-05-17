import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  FollowUpForm,
  type FollowUpCreateExtras,
  type FollowUpFormSeed,
} from '@/components/follow-ups/FollowUpForm';
import { toast } from '@/components/ui/toast';
import {
  useAddFollowUpEvent,
  useCreateFollowUp,
  useSetFollowUpReminder,
} from '@/hooks/useFollowUps';
import { useCreateCalendarEvent } from '@/hooks/useGoogleCalendar';
import {
  attachCalendarToFollowUp,
  type CreateFollowUpInput,
  type UpdateFollowUpInput,
} from '@/lib/follow-ups';

function readFollowUpSeed(params: URLSearchParams): FollowUpFormSeed {
  const seed: FollowUpFormSeed = {};
  const title = params.get('title');
  if (title && title.trim()) seed.title = title;
  const desc = params.get('description');
  if (desc && desc.trim()) seed.description = desc;
  const person = params.get('person');
  if (person && person.trim()) seed.person = person;
  const branch = params.get('branch');
  if (branch && branch.trim()) seed.branch = branch;
  const due = params.get('due_date');
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) seed.due_date = due;
  return seed;
}

export function FollowUpNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTaskId = searchParams.get('task_id') ?? undefined;
  const seed = readFollowUpSeed(searchParams);
  const create = useCreateFollowUp();
  const setReminder = useSetFollowUpReminder();
  const createCalEvent = useCreateCalendarEvent();
  const addEvent = useAddFollowUpEvent();

  // Two-phase commit:
  //   Phase 1 — rpc_create_follow_up. Source of truth for the row and
  //             its in-app `assigned_to`. Errors here propagate up to
  //             the form's catch block.
  //   Phase 2 — reminder + calendar. Independent best-effort steps.
  //             Each failure surfaces a toast but never rolls back the
  //             row. Assignment can't be affected here.
  const handleSubmit = async (
    input: CreateFollowUpInput | UpdateFollowUpInput,
    extras?: FollowUpCreateExtras,
  ) => {
    const row = await create.mutateAsync(input as CreateFollowUpInput);

    let warned = false;

    if (extras?.reminderAt) {
      try {
        await setReminder.mutateAsync({
          id: row.id,
          reminderAt: extras.reminderAt,
          channels: ['in_app'],
        });
      } catch (err) {
        toast({
          title: 'Follow-up created — reminder not set',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        warned = true;
      }
    }

    if (extras?.calendar) {
      try {
        const result = await createCalEvent.mutateAsync({
          entity_type: 'follow_up',
          entity_id: row.id,
          start: extras.calendar.start,
          end: extras.calendar.end,
          attendees:
            extras.calendar.invitees.length > 0
              ? extras.calendar.invitees
              : undefined,
        });
        try {
          await attachCalendarToFollowUp({
            followUpId: row.id,
            eventId: result.link.google_event_id,
            htmlLink: result.link.event_html_link,
          });
        } catch {
          // Calendar event already created on Google; history sync is best-effort.
        }
        for (const email of extras.calendar.invitees) {
          try {
            await addEvent.mutateAsync({
              id: row.id,
              kind: 'invitee_added',
              payload: { email },
            });
          } catch {
            // Best-effort.
          }
        }
      } catch (err) {
        toast({
          title: 'Follow-up created — calendar event failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        warned = true;
      }
    }

    if (!warned) {
      toast({ title: 'Follow-up created' });
    }
    navigate(`/follow-ups/${row.id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/follow-ups"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to follow-ups
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          New follow-up
        </h1>
        <p className="text-muted-foreground text-sm">
          {initialTaskId
            ? 'This follow-up will be linked to the task you came from.'
            : 'Schedule a call, message, or check-in. Set a due date and assign it to yourself or leave unassigned.'}
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <FollowUpForm
            initialTaskId={initialTaskId}
            seed={seed}
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create follow-up"
          />
        </CardContent>
      </Card>
    </div>
  );
}
