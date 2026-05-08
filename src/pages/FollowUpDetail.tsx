import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { FollowUpForm } from '@/components/follow-ups/FollowUpForm';
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
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
import { useCanMutate } from '@/hooks/usePermissions';
import type { UpdateFollowUpInput } from '@/lib/follow-ups';
import type { FollowUpStatus } from '@/types/database';

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
        <div className="text-destructive text-sm">
          Could not load follow-up: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { follow_up: row, audit, comments, attachments } = data;

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
    <div className="space-y-4">
      <Link
        to="/follow-ups"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to follow-ups
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
          {row.task_id && (
            <Link
              to={`/tasks/${row.task_id}`}
              className="text-primary mt-1 inline-block text-xs hover:underline"
            >
              ↳ Linked to task
            </Link>
          )}
        </div>
        {canMutate && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!editing && row.status !== 'done' && (
              <Button
                size="sm"
                onClick={handleMarkDone}
                disabled={markDone.isPending}
                data-testid="follow-up-complete-button"
              >
                {markDone.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Mark done
              </Button>
            )}
            {!editing && row.status !== 'done' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSnoozeOpen((v) => !v)}
                data-testid="follow-up-snooze-button"
              >
                <Clock className="mr-1 h-4 w-4" /> Snooze
              </Button>
            )}
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {snoozeOpen && canMutate && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="snooze-date">
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
                <label className="text-xs font-medium" htmlFor="snooze-reason">
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

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            <FollowUpForm
              initial={row}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save changes"
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 px-0"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <DetailRow
              label="Status"
              value={(row.status as FollowUpStatus).replace('_', ' ')}
            />
            <DetailRow label="Category" value={row.category.replace('_', ' ')} />
            <DetailRow label="Priority" value={row.priority} />
            <DetailRow label="Branch" value={row.branch ?? 'cross-branch'} />
            <DetailRow label="Due" value={row.due_date} />
            {row.snoozed_until && (
              <DetailRow label="Snoozed until" value={row.snoozed_until} />
            )}
            <DetailRow label="Person" value={row.person ?? '—'} />
            <DetailRow
              label="Assigned to"
              value={row.assigned_to ? row.assigned_to : 'Unassigned'}
            />
            {row.description && (
              <DetailRow label="Description" value={row.description} multiline />
            )}
            {row.outcome && <DetailRow label="Outcome" value={row.outcome} multiline />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attachments</CardTitle>
        </CardHeader>
        <CardContent>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditList entries={audit} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? 'space-y-1' : 'flex items-baseline justify-between gap-3'}>
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className={multiline ? 'text-sm whitespace-pre-wrap' : 'text-sm'}>{value}</div>
    </div>
  );
}
