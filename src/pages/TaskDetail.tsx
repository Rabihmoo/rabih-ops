import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { TaskForm } from '@/components/tasks/TaskForm';
import {
  BranchBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/tasks/badges';
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { FollowUpListItem } from '@/components/follow-ups/FollowUpListItem';
import { useCanMutate } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import {
  useTaskDetail,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
  useAddTaskComment,
  useDeleteTaskComment,
  useAttachFileToTask,
  useRemoveTaskAttachment,
} from '@/hooks/useTasks';
import { useFollowUpsForTask } from '@/hooks/useFollowUps';
import type { UpdateTaskInput } from '@/lib/tasks';
import type { TaskPriority, TaskStatus } from '@/types/database';

export function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const taskId = params.id ?? null;

  const { data, isLoading, error } = useTaskDetail(taskId);
  const update = useUpdateTask();
  const complete = useCompleteTask();
  const remove = useDeleteTask();
  const addComment = useAddTaskComment();
  const deleteComment = useDeleteTaskComment();
  const attach = useAttachFileToTask();
  const removeAttachment = useRemoveTaskAttachment();
  const followUps = useFollowUpsForTask(taskId);
  const profile = useAuthStore((s) => s.profile);
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);

  if (isLoading || !taskId) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading task…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/tasks" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to tasks
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load task: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { task, audit, comments, attachments } = data;
  const status = task.status as TaskStatus;
  const priority = task.priority as TaskPriority;
  const closed = status === 'done' || status === 'cancelled';

  const assigneeLabel =
    task.assigned_to == null
      ? 'Unassigned'
      : task.assigned_to === profile?.id
        ? `${profile?.full_name ?? 'me'}`
        : 'Other user';

  const handleUpdate = async (payload: UpdateTaskInput) => {
    await update.mutateAsync({ taskId, updates: payload });
    setEditing(false);
    toast({ title: 'Task updated' });
  };

  const handleComplete = async () => {
    await complete.mutateAsync({ taskId });
    toast({ title: 'Task completed' });
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task? This soft-deletes the row.')) return;
    await remove.mutateAsync(taskId);
    toast({ title: 'Task deleted' });
    navigate('/tasks');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to tasks
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
            {task.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={status} />
            <BranchBadge branch={task.branch} />
            {priority !== 'normal' && <PriorityBadge priority={priority} />}
            <DueDateBadge dueDate={task.due_date} status={status} />
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs capitalize">
              {task.category.replace('_', ' ')}
            </span>
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">{assigneeLabel}</span>
          </div>
        </div>
        {canMutate && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!closed && (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={complete.isPending}
                data-testid="task-complete-button"
              >
                {complete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark done
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              data-testid="task-edit-button"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
              data-testid="task-delete-button"
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Edit form OR overview */}
      {editing ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit task</div>
            <TaskForm
              initial={task}
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
        (task.description || task.completion_note) && (
          <Card>
            <CardContent className="space-y-4 p-5">
              {task.description && (
                <div className="space-y-2">
                  <div className="text-section-label">Description</div>
                  <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>
              )}
              {task.completion_note && (
                <div className="space-y-2">
                  <div className="text-section-label">Completion note</div>
                  <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                    {task.completion_note}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      )}

      {/* Linked follow-ups */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="text-section-label flex items-center gap-2">
              Follow-ups
              {(followUps.data?.length ?? 0) > 0 && (
                <span className="text-foreground/85 normal-case tracking-normal">
                  ({followUps.data!.length})
                </span>
              )}
            </div>
            {canMutate && (
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={`/follow-ups/new?task_id=${taskId}`}
                  data-testid="add-follow-up-button"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add follow-up
                </Link>
              </Button>
            )}
          </div>
          {followUps.isLoading && (
            <div className="text-muted-foreground py-2 text-sm">Loading…</div>
          )}
          {followUps.data && followUps.data.length === 0 && (
            <div className="text-muted-foreground py-2 text-sm">
              No follow-ups linked yet.
            </div>
          )}
          {followUps.data && followUps.data.length > 0 && (
            <ul className="border-border -mx-5 border-t">
              {followUps.data.map((fu) => (
                <li key={fu.id}>
                  <FollowUpListItem
                    followUp={fu}
                    onSelect={(id) => navigate(`/follow-ups/${id}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Comments
            {comments.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({comments.length})
              </span>
            )}
          </div>
          <CommentList
            comments={comments}
            onAdd={(body) => addComment.mutateAsync({ taskId, body })}
            onDelete={(commentId) => deleteComment.mutateAsync({ commentId, taskId })}
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
              <span className="text-foreground/85 normal-case tracking-normal">
                ({attachments.length})
              </span>
            )}
          </div>
          <AttachmentList
            entityType="task"
            entityId={taskId}
            attachments={attachments}
            onAttach={(uploaded) =>
              attach.mutateAsync({
                taskId,
                storagePath: uploaded.storagePath,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                fileSize: uploaded.fileSize,
              })
            }
            onRemove={(attachmentId) =>
              removeAttachment.mutateAsync({ attachmentId, taskId })
            }
            isAttaching={attach.isPending}
            isRemoving={removeAttachment.isPending}
          />
        </CardContent>
      </Card>

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
