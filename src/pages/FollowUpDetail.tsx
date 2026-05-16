import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { FollowUpForm } from '@/components/follow-ups/FollowUpForm';
import {
  FollowUpStatusBadge,
  FollowUpCategoryBadge,
} from '@/components/follow-ups/badges';
import {
  BranchBadge,
  DueDateBadge,
  PriorityBadge,
} from '@/components/tasks/badges';
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { LinkedDocumentsCard } from '@/components/shared/LinkedDocumentsCard';
import { LinkedEmailsCard } from '@/components/shared/LinkedEmailsCard';
import { LinkedRecordsPanel } from '@/components/shared/LinkedRecordsPanel';
import { FollowUpHistoryFeed } from '@/components/follow-ups/FollowUpHistoryFeed';
import {
  useFollowUpDetail,
  useUpdateFollowUp,
  useMarkFollowUpDone,
  useSnoozeFollowUp,
  useAddFollowUpComment,
  useDeleteFollowUpComment,
  useAttachFileToFollowUp,
  useRemoveFollowUpAttachment,
} from '@/hooks/useFollowUps';
import { effectiveDueDate } from '@/lib/follow-ups';
import { useCanMutate } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import type { UpdateFollowUpInput } from '@/lib/follow-ups';
import type {
  FollowUpCategory,
  FollowUpStatus,
  TaskPriority,
} from '@/types/database';

export function FollowUpDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? null;

  const { data, isLoading, error } = useFollowUpDetail(id);
  const update = useUpdateFollowUp();
  const markDone = useMarkFollowUpDone();
  const snooze = useSnoozeFollowUp();
  const addComment = useAddFollowUpComment();
  const deleteComment = useDeleteFollowUpComment();
  const attach = useAttachFileToFollowUp();
  const removeAttachment = useRemoveFollowUpAttachment();
  const profile = useAuthStore((s) => s.profile);
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozeReason, setSnoozeReason] = useState('');

  if (isLoading || !id) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading follow-up…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/follow-ups" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to follow-ups
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load follow-up: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { follow_up: row, audit, comments, attachments } = data;
  // F1.2: events default to [] for tolerance against older RPC bodies
  // (the migration is staging-only at first; defensive client code
  // means the feed simply shows its empty-state if the field is
  // missing).
  const events = data.events ?? [];
  const status = row.status as FollowUpStatus;
  const priority = row.priority as TaskPriority;
  const closed = status === 'done' || status === 'cancelled';
  const due = effectiveDueDate(row);

  const assigneeLabel =
    row.assigned_to == null
      ? 'Unassigned'
      : row.assigned_to === profile?.id
        ? `${profile?.full_name ?? 'me'}`
        : 'Other user';

  const handleUpdate = async (payload: UpdateFollowUpInput) => {
    await update.mutateAsync({ id, updates: payload });
    setEditing(false);
    toast({ title: 'Follow-up updated' });
  };

  const handleMarkDone = async () => {
    const outcome = window.prompt('Outcome (optional):') ?? undefined;
    await markDone.mutateAsync({ id, outcome });
    toast({ title: 'Follow-up completed' });
  };

  const handleSnooze = async () => {
    if (!snoozeDate) return;
    await snooze.mutateAsync({
      id,
      newDueDate: snoozeDate,
      reason: snoozeReason || undefined,
    });
    setSnoozeOpen(false);
    setSnoozeDate('');
    setSnoozeReason('');
    toast({ title: 'Follow-up snoozed' });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/follow-ups"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to follow-ups
      </Link>

      {/* Header strip */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <h1
            className={cn(
              'text-foreground text-3xl font-semibold tracking-tight leading-tight',
              closed && 'text-muted-foreground line-through',
            )}
          >
            {row.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <FollowUpStatusBadge status={status} />
            <FollowUpCategoryBadge category={row.category as FollowUpCategory} />
            {row.branch && <BranchBadge branch={row.branch} />}
            {priority !== 'normal' && <PriorityBadge priority={priority} />}
            <DueDateBadge dueDate={due} status={status} />
            {row.snoozed_until && (
              <span className="text-subtle-foreground text-xs">
                originally due {row.due_date}
              </span>
            )}
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">{assigneeLabel}</span>
            {row.task_id && (
              <>
                <span className="text-subtle-foreground text-xs">·</span>
                <Link
                  to={`/tasks/${row.task_id}`}
                  className="text-primary-ink text-xs hover:underline"
                >
                  ↳ Linked to task
                </Link>
              </>
            )}
          </div>
        </div>
        {canMutate && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!closed && (
              <Button
                size="sm"
                onClick={handleMarkDone}
                disabled={markDone.isPending}
                data-testid="follow-up-complete-button"
              >
                {markDone.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark done
              </Button>
            )}
            {!closed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSnoozeOpen((v) => !v)}
                data-testid="follow-up-snooze-button"
              >
                <Clock className="mr-1 h-4 w-4" /> Snooze
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
      </div>

      {snoozeOpen && canMutate && !editing && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Snooze</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-foreground-72 text-xs font-medium" htmlFor="snooze-date">
                  Snooze until
                </label>
                <Input
                  id="snooze-date"
                  type="date"
                  value={snoozeDate}
                  onChange={(e) => setSnoozeDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-foreground-72 text-xs font-medium"
                  htmlFor="snooze-reason"
                >
                  Reason (optional)
                </label>
                <Input
                  id="snooze-reason"
                  value={snoozeReason}
                  onChange={(e) => setSnoozeReason(e.target.value)}
                  placeholder="Why are you snoozing this?"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSnooze}
                disabled={!snoozeDate || snooze.isPending}
              >
                {snooze.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm snooze
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSnoozeOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit form OR overview */}
      {editing ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit follow-up</div>
            <FollowUpForm
              initial={row}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save changes"
            />
            <Button
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : (
        (row.description || row.outcome) && (
          <Card>
            <CardContent className="space-y-4 p-5">
              {row.description && (
                <div className="space-y-2">
                  <div className="text-section-label">Description</div>
                  <p className="text-foreground-72 text-sm leading-relaxed whitespace-pre-wrap">
                    {row.description}
                  </p>
                </div>
              )}
              {row.outcome && (
                <div className="space-y-2">
                  <div className="text-section-label">Outcome</div>
                  <p className="text-foreground-72 text-sm leading-relaxed whitespace-pre-wrap">
                    {row.outcome}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      )}

      {/* F1.2: user-facing History feed driven by follow_up_events.
          The Activity card at the bottom keeps showing audit_log entries
          as the back-office record. */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            History
            {events.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({events.length})
              </span>
            )}
          </div>
          <FollowUpHistoryFeed events={events} />
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Comments
            {comments.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({comments.length})
              </span>
            )}
          </div>
          <CommentList
            comments={comments}
            onAdd={(body) => addComment.mutateAsync({ id, body })}
            onDelete={(commentId) =>
              deleteComment.mutateAsync({ commentId, followUpId: id })
            }
            isAdding={addComment.isPending}
            isDeleting={deleteComment.isPending}
          />
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Attachments
            {attachments.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({attachments.length})
              </span>
            )}
          </div>
          <AttachmentList
            entityType="follow_up"
            entityId={id}
            attachments={attachments}
            onAttach={(uploaded) =>
              attach.mutateAsync({
                followUpId: id,
                storagePath: uploaded.storagePath,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                fileSize: uploaded.fileSize,
              })
            }
            onRemove={(attachmentId) =>
              removeAttachment.mutateAsync({ attachmentId, followUpId: id })
            }
            isAttaching={attach.isPending}
            isRemoving={removeAttachment.isPending}
          />
        </CardContent>
      </Card>

      {/* Linked SOPs / policies / notes */}
      <LinkedDocumentsCard entityType="follow_up" entityId={id!} />

      {/* Linked Gmail messages */}
      <LinkedEmailsCard entityType="follow_up" entityId={id!} />

      <LinkedRecordsPanel entityType="follow_up" entityId={id!} />

      {/* Activity */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label">Activity</div>
          <AuditList entries={audit} />
        </CardContent>
      </Card>
    </div>
  );
}
