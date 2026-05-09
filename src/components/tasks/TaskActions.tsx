import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  PlayCircle,
  Repeat2,
  TimerReset,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { TASK_STATUS_LABEL } from '@/lib/tasks';
import {
  useArchiveTask,
  useCompleteTask,
  useMarkTaskDelayed,
  useMarkTaskWaiting,
  useRequestTaskRepeat,
  useResumeWaitingTask,
  useSetTaskStatus,
} from '@/hooks/useTasks';
import type { TaskRow, TaskStatus } from '@/types/database';

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

type Panel = 'wait' | 'delay' | 'repeat' | 'finish' | 'archive' | null;

// Allowed simple status targets visible as quick chips. Filter out the current
// status so the chip set always represents transitions.
const QUICK_STATUSES: { id: 'not_started' | 'started' | 'working'; label: string }[] = [
  { id: 'not_started', label: 'Not started' },
  { id: 'started', label: 'Started' },
  { id: 'working', label: 'Working' },
];

export function TaskActions({ task }: { task: TaskRow }) {
  const status = task.status as TaskStatus;
  const setStatus = useSetTaskStatus();
  const markWaiting = useMarkTaskWaiting();
  const resumeWaiting = useResumeWaitingTask();
  const markDelayed = useMarkTaskDelayed();
  const requestRepeat = useRequestTaskRepeat();
  const archive = useArchiveTask();
  const complete = useCompleteTask();

  const [panel, setPanel] = useState<Panel>(null);
  const [waitLabel, setWaitLabel] = useState('');
  const [waitNote, setWaitNote] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [repeatReason, setRepeatReason] = useState('');
  const [completionNote, setCompletionNote] = useState(task.completion_note ?? '');
  const [outcome, setOutcome] = useState(task.outcome ?? '');
  const [archiveReason, setArchiveReason] = useState('');

  const togglePanel = (next: Panel) => setPanel((cur) => (cur === next ? null : next));

  const onQuickStatus = async (next: 'not_started' | 'started' | 'working') => {
    if (status === next) return;
    await setStatus.mutateAsync({ taskId: task.id, status: next });
    toast({ title: `Marked ${TASK_STATUS_LABEL[next].toLowerCase()}` });
  };

  const onResume = async () => {
    await resumeWaiting.mutateAsync({ taskId: task.id });
    toast({ title: 'Back to working' });
  };

  const onSubmitWaiting = async () => {
    const label = waitLabel.trim();
    if (!label) {
      toast({ title: 'Who or what are you waiting on?', variant: 'destructive' });
      return;
    }
    await markWaiting.mutateAsync({
      taskId: task.id,
      label,
      note: waitNote.trim() || null,
    });
    toast({ title: 'Marked waiting' });
    setWaitLabel('');
    setWaitNote('');
    setPanel(null);
  };

  const onSubmitDelay = async () => {
    if (!delayReason.trim()) {
      toast({ title: 'A delay reason is required', variant: 'destructive' });
      return;
    }
    await markDelayed.mutateAsync({ taskId: task.id, reason: delayReason });
    toast({ title: 'Marked delayed' });
    setDelayReason('');
    setPanel(null);
  };

  const onSubmitRepeat = async () => {
    if (!repeatReason.trim()) {
      toast({ title: 'A repeat reason is required', variant: 'destructive' });
      return;
    }
    await requestRepeat.mutateAsync({ taskId: task.id, reason: repeatReason });
    toast({ title: 'Marked needs repeat' });
    setRepeatReason('');
    setPanel(null);
  };

  const onSubmitComplete = async () => {
    await complete.mutateAsync({
      taskId: task.id,
      completionNote: completionNote.trim() || null,
      outcome: outcome.trim() || null,
    });
    toast({ title: 'Task finished' });
    setPanel(null);
  };

  const onSubmitArchive = async () => {
    if (!confirm('Archive this task? It stays in history but is hidden from active views.')) return;
    await archive.mutateAsync({
      taskId: task.id,
      reason: archiveReason.trim() || null,
    });
    toast({ title: 'Task archived' });
    setArchiveReason('');
    setPanel(null);
  };

  const isClosed = status === 'finished' || status === 'archived';
  const isWaiting = status === 'waiting_for_someone';
  const anyPending =
    setStatus.isPending ||
    markWaiting.isPending ||
    resumeWaiting.isPending ||
    markDelayed.isPending ||
    requestRepeat.isPending ||
    archive.isPending ||
    complete.isPending;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="text-section-label">Lifecycle</div>

        {/* Quick status chips for simple transitions */}
        {!isClosed && !isWaiting && (
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_STATUSES.map((qs) => (
              <button
                key={qs.id}
                type="button"
                onClick={() => onQuickStatus(qs.id)}
                disabled={status === qs.id || anyPending}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  status === qs.id
                    ? 'border-primary bg-primary-soft text-primary-ink cursor-default'
                    : 'border-border text-foreground/85 hover:bg-surface-1',
                )}
              >
                {qs.label}
              </button>
            ))}
          </div>
        )}

        {isWaiting && (
          <div className="bg-warning-soft text-warning-ink rounded-md p-3 text-sm">
            <div className="font-medium">
              Waiting on {task.waiting_on_label ?? 'someone'}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onResume}
              disabled={resumeWaiting.isPending}
              className="mt-2"
              data-testid="task-resume-waiting-button"
            >
              {resumeWaiting.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resume work
            </Button>
          </div>
        )}

        {/* Special-state action buttons */}
        {!isClosed && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isWaiting && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => togglePanel('wait')}
                data-testid="task-mark-waiting-button"
              >
                <Hand className="mr-1 h-4 w-4" /> Mark waiting
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => togglePanel('delay')}
              data-testid="task-mark-delayed-button"
            >
              <Clock className="mr-1 h-4 w-4" /> Mark delayed
            </Button>
            <Button
              size="sm"
              onClick={() => togglePanel('finish')}
              data-testid="task-finish-button"
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Mark finished
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => togglePanel('archive')}
              data-testid="task-archive-button"
            >
              <Archive className="mr-1 h-4 w-4" /> Archive
            </Button>
          </div>
        )}

        {/* Finished + want to redo? Need-repeat path */}
        {status === 'finished' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => togglePanel('repeat')}
              data-testid="task-request-repeat-button"
            >
              <Repeat2 className="mr-1 h-4 w-4" /> Request repeat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => togglePanel('archive')}
              data-testid="task-archive-button"
            >
              <Archive className="mr-1 h-4 w-4" /> Archive
            </Button>
          </div>
        )}

        {status === 'needs_repeat' && (
          <div className="bg-destructive-soft text-destructive-ink rounded-md p-3 text-sm">
            <div className="font-medium">Needs repeat</div>
            {task.repeat_reason && (
              <p className="mt-1 whitespace-pre-wrap">{task.repeat_reason}</p>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onQuickStatus('working')}
                disabled={anyPending}
              >
                <PlayCircle className="mr-1 h-4 w-4" /> Resume work
              </Button>
            </div>
          </div>
        )}

        {status === 'delayed' && task.delay_reason && (
          <div className="bg-destructive-soft text-destructive-ink rounded-md p-3 text-sm">
            <div className="font-medium">Delayed</div>
            <p className="mt-1 whitespace-pre-wrap">{task.delay_reason}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onQuickStatus('working')}
                disabled={anyPending}
              >
                <TimerReset className="mr-1 h-4 w-4" /> Resume on track
              </Button>
            </div>
          </div>
        )}

        {/* Inline panels (only one open at a time) */}
        {panel === 'wait' && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Mark waiting</div>
            <div className="space-y-2">
              <Label htmlFor="wait-label">Waiting on</Label>
              <Input
                id="wait-label"
                placeholder="e.g. Sara, MozTel support, charcoal supplier…"
                value={waitLabel}
                onChange={(e) => setWaitLabel(e.target.value)}
                data-testid="task-wait-label-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-note">Note (optional)</Label>
              <textarea
                id="wait-note"
                rows={2}
                className={`${fieldClass} h-auto py-2`}
                value={waitNote}
                onChange={(e) => setWaitNote(e.target.value)}
                placeholder="Filed as a comment on the task."
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSubmitWaiting}
                disabled={markWaiting.isPending || !waitLabel.trim()}
                data-testid="task-wait-submit-button"
              >
                {markWaiting.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm waiting
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'delay' && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Mark delayed</div>
            <div className="space-y-2">
              <Label htmlFor="delay-reason">Reason</Label>
              <textarea
                id="delay-reason"
                rows={3}
                className={`${fieldClass} h-auto py-2`}
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="Why is this delayed?"
                data-testid="task-delay-reason-input"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSubmitDelay}
                disabled={markDelayed.isPending || !delayReason.trim()}
                data-testid="task-delay-submit-button"
              >
                {markDelayed.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm delay
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'repeat' && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Request repeat</div>
            <div className="space-y-2">
              <Label htmlFor="repeat-reason">Why does this need to be redone?</Label>
              <textarea
                id="repeat-reason"
                rows={3}
                className={`${fieldClass} h-auto py-2`}
                value={repeatReason}
                onChange={(e) => setRepeatReason(e.target.value)}
                data-testid="task-repeat-reason-input"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSubmitRepeat}
                disabled={requestRepeat.isPending || !repeatReason.trim()}
                data-testid="task-repeat-submit-button"
              >
                {requestRepeat.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm repeat
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'finish' && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Mark finished</div>
            <div className="space-y-2">
              <Label htmlFor="completion-note">Process notes (optional)</Label>
              <textarea
                id="completion-note"
                rows={2}
                className={`${fieldClass} h-auto py-2`}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="How was it done?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outcome">Final outcome (optional)</Label>
              <textarea
                id="outcome"
                rows={2}
                className={`${fieldClass} h-auto py-2`}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="What was the result? (Stays in history)"
                data-testid="task-outcome-input"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSubmitComplete}
                disabled={complete.isPending}
                data-testid="task-finish-submit-button"
              >
                {complete.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm finished
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'archive' && (
          <div className="border-border space-y-3 rounded-md border p-4">
            <div className="text-section-label">Archive task</div>
            <p className="text-muted-foreground text-xs">
              Archived tasks stay in history (not deleted). Use this when work is closed
              from active operations.
            </p>
            <div className="space-y-2">
              <Label htmlFor="archive-reason">Reason (optional)</Label>
              <Input
                id="archive-reason"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Captured in audit log."
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={onSubmitArchive}
                disabled={archive.isPending}
                data-testid="task-archive-submit-button"
              >
                {archive.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm archive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
