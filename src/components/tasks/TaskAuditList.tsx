import type { TaskAuditEntry } from '@/lib/tasks';

const ACTION_VERB: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  complete: 'Completed',
  delete: 'Deleted',
  comment: 'Added a comment',
  comment_delete: 'Removed a comment',
  attach: 'Attached a file',
  detach: 'Removed an attachment',
};

const TRACKED_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'category',
  'branch',
  'assigned_to',
  'due_date',
] as const;

function diffSummary(before: unknown, after: unknown): string[] {
  if (before == null || after == null) return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const lines: string[] = [];
  for (const field of TRACKED_FIELDS) {
    const bv = b[field];
    const av = a[field];
    if (bv !== av) {
      lines.push(`${field}: ${formatVal(bv)} → ${formatVal(av)}`);
    }
  }
  return lines;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  return String(v);
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

export function TaskAuditList({ entries }: { entries: TaskAuditEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-muted-foreground text-sm">No audit entries yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const verb = ACTION_VERB[e.action] ?? e.action;
        const diff = e.action === 'update' ? diffSummary(e.before_state, e.after_state) : [];
        return (
          <li key={e.id} className="border-border border-l-2 pl-3">
            <div className="text-sm">
              <span className="font-medium">{e.user_name}</span>{' '}
              <span className="text-muted-foreground">{verb}</span>
            </div>
            <div className="text-muted-foreground text-xs">
              {relativeTime(e.created_at)}
            </div>
            {diff.length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {diff.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
