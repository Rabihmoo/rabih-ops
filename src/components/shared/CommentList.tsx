import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import { useCanMutate } from '@/hooks/usePermissions';
import type { CommentRow } from '@/types/database';

export interface CommentWithAuthor extends CommentRow {
  author_name: string;
}

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

// Entity-agnostic comment list. Callers wire in onAdd / onDelete from their
// module's mutation hooks, e.g. useAddTaskComment / useAddFollowUpComment.
export function CommentList({
  comments,
  onAdd,
  onDelete,
  isAdding,
  isDeleting,
}: {
  comments: CommentWithAuthor[];
  onAdd: (body: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
  isAdding?: boolean;
  isDeleting?: boolean;
}) {
  const profile = useAuthStore((s) => s.profile);
  const [body, setBody] = useState('');
  const canMutate = useCanMutate();

  const handleAdd = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await onAdd(trimmed);
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
      await onDelete(commentId);
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
        <ul className="space-y-4">
          {comments.map((c) => {
            const canDelete =
              profile &&
              (c.author_id === profile.id ||
                profile.role === 'admin' ||
                profile.role === 'ceo');
            const isMine = profile && c.author_id === profile.id;
            return (
              <li
                key={c.id}
                className="bg-surface-1 border-border rounded-md border px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-foreground font-semibold">{c.author_name}</span>
                    {isMine && (
                      <StatusChip tone="info" size="xs">you</StatusChip>
                    )}
                    <span className="text-subtle-foreground text-xs">
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={isDeleting}
                      className="text-muted-foreground hover:text-destructive-ink disabled:opacity-50"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {c.body}
                </div>
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
            rows={3}
            placeholder="Add a comment…"
            className="bg-card border-border focus-visible:ring-ring/70 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            maxLength={5000}
          />
          <div className="flex items-center justify-between">
            <span className="text-subtle-foreground text-xs">
              {body.length}/5000
            </span>
            <Button size="sm" disabled={!body.trim() || isAdding} onClick={handleAdd}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
