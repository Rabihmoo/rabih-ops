import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskAuditList } from '@/components/tasks/TaskAuditList';
import { CommentList } from '@/components/tasks/CommentList';
import { AttachmentList } from '@/components/tasks/AttachmentList';
import {
  useTaskDetail,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
} from '@/hooks/useTasks';
import type { UpdateTaskInput } from '@/lib/tasks';
import type { TaskStatus } from '@/types/database';

export function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const taskId = params.id ?? null;

  const { data, isLoading, error } = useTaskDetail(taskId);
  const update = useUpdateTask();
  const complete = useCompleteTask();
  const remove = useDeleteTask();

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
        <div className="text-destructive text-sm">
          Could not load task: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { task, audit, comments, attachments } = data;

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
    <div className="space-y-4">
      <Link
        to="/tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to tasks
      </Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <div className="flex shrink-0 gap-2">
          {!editing && task.status !== 'done' && (
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={complete.isPending}
            >
              {complete.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mark done
            </Button>
          )}
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {!editing && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit task</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm
              initial={task}
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
            <DetailRow label="Status" value={(task.status as TaskStatus).replace('_', ' ')} />
            <DetailRow label="Priority" value={task.priority} />
            <DetailRow label="Branch" value={task.branch} />
            <DetailRow label="Category" value={task.category.replace('_', ' ')} />
            <DetailRow label="Due" value={task.due_date ?? '—'} />
            <DetailRow
              label="Assigned to"
              value={task.assigned_to ? task.assigned_to : 'Unassigned'}
            />
            {task.description && (
              <DetailRow label="Description" value={task.description} multiline />
            )}
            {task.completion_note && (
              <DetailRow
                label="Completion note"
                value={task.completion_note}
                multiline
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentList taskId={taskId} comments={comments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentList taskId={taskId} attachments={attachments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskAuditList entries={audit} />
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
