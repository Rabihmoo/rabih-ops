import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import { useAddTaskComment, useDeleteTaskComment } from '@/hooks/useTasks';
import { useCanMutate } from '@/hooks/usePermissions';
import type { TaskCommentWithAuthor } from '@/lib/tasks';

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CommentList({
  taskId,
  comments,
}: {
  taskId: string;
  comments: TaskCommentWithAuthor[];
}) {
  const profile = useAuthStore((s) => s.profile);
  const add = useAddTaskComment();
  const remove = useDeleteTaskComment();
  const [body, setBody] = useState('');
  const canMutate = useCanMutate();

  const handleAdd = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await add.mutateAsync({ taskId, body: trimmed });
      setBody('');
    } catch (err) {
      toast({
        title: 'Could not add comment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await remove.mutateAsync({ commentId, taskId });
    } catch (err) {
      toast({
        title: 'Could not delete comment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <div className="text-muted-foreground text-sm">No comments yet.</div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const canDelete =
              profile &&
              (c.author_id === profile.id ||
                profile.role === 'admin' ||
                profile.role === 'ceo');
            return (
              <li key={c.id} className="border-border border-l-2 pl-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">{c.author_name}</span>{' '}
                    <span className="text-muted-foreground text-xs">
                      · {relativeTime(c.created_at)}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{c.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      {canMutate && (
        <div className="space-y-2" data-testid="comment-composer">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Add a comment…"
            className="bg-card border-border focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            maxLength={5000}
          />
          <Button
            size="sm"
            disabled={!body.trim() || add.isPending}
            onClick={handleAdd}
          >
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post comment
          </Button>
        </div>
      )}
    </div>
  );
}
