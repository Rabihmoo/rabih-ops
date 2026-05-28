import { useRef, useState } from 'react';
import { ListChecks, NotebookPen, PhoneCall, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateTask } from '@/hooks/useTasks';
import { useCreateNote } from '@/hooks/useNotes';
import { useCreateFollowUp } from '@/hooks/useFollowUps';
import { useCanMutate } from '@/hooks/usePermissions';
import { useUiStore } from '@/stores/uiStore';
import { BRANCH_LIST, type BranchCode } from '@/lib/branches';
import { toast } from '@/components/ui/toast';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function QuickCaptureRow() {
  const canMutate = useCanMutate();
  const branchFilter = useUiStore((s) => s.branchFilter);
  const userBranches = BRANCH_LIST.map((b) => b.code);

  // Default branch: use uiStore filter if it's a specific branch, else first available
  const defaultBranch: BranchCode =
    branchFilter !== 'all' ? branchFilter : (userBranches[0] as BranchCode) ?? 'bbqhouse';

  const [branch, setBranch] = useState<BranchCode>(defaultBranch);

  if (!canMutate) return null;

  return (
    <div className="space-y-2" data-testid="quick-capture-row">
      {/* Branch chip row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-foreground-56 text-xs">Branch:</span>
        {BRANCH_LIST.map((b) => (
          <button
            key={b.code}
            type="button"
            onClick={() => setBranch(b.code as BranchCode)}
            data-testid={`quick-branch-${b.code}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              branch === b.code
                ? 'border-primary bg-primary-soft text-primary-ink'
                : 'border-border text-foreground-56 hover:bg-surface-2',
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: b.color }}
              aria-hidden
            />
            {b.name}
          </button>
        ))}
      </div>

      {/* Three capture inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TaskCapture branch={branch} />
        <NoteCapture branch={branch} />
        <FollowUpCapture branch={branch} />
      </div>
    </div>
  );
}

function TaskCapture({ branch }: { branch: BranchCode }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateTask();

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setError('');
    try {
      await create.mutateAsync({
        title: trimmed,
        branch,
        category: 'operations',
        priority: 'normal',
      });
      setTitle('');
      toast({ title: 'Task created' });
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <CaptureBox
      ref={inputRef}
      icon={ListChecks}
      placeholder="Quick task…"
      value={title}
      onChange={setTitle}
      onSubmit={submit}
      error={error}
      submitting={create.isPending}
      testId="quick-task"
    />
  );
}

function NoteCapture({ branch }: { branch: BranchCode }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateNote();

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Note text is required');
      return;
    }
    setError('');
    try {
      await create.mutateAsync({
        body_md: trimmed,
        branch: branch ?? null,
        kind: 'note',
        module: 'general',
        visibility: 'work',
      });
      setText('');
      toast({ title: 'Note created' });
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <CaptureBox
      ref={inputRef}
      icon={NotebookPen}
      placeholder="Quick note…"
      value={text}
      onChange={setText}
      onSubmit={submit}
      error={error}
      submitting={create.isPending}
      testId="quick-note"
    />
  );
}

function FollowUpCapture({ branch }: { branch: BranchCode }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateFollowUp();

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setError('');
    try {
      await create.mutateAsync({
        title: trimmed,
        category: 'call',
        due_date: todayIso(),
        branch: branch ?? null,
        priority: 'normal',
      });
      setTitle('');
      toast({ title: 'Follow-up created' });
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <CaptureBox
      ref={inputRef}
      icon={PhoneCall}
      placeholder="Quick follow-up…"
      value={title}
      onChange={setTitle}
      onSubmit={submit}
      error={error}
      submitting={create.isPending}
      testId="quick-followup"
    />
  );
}

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

interface CaptureBoxProps {
  icon: LucideIcon;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  error: string;
  submitting: boolean;
  testId: string;
}

const CaptureBox = forwardRef<HTMLInputElement, CaptureBoxProps>(
  ({ icon: Icon, placeholder, value, onChange, onSubmit, error, submitting, testId }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    };

    return (
      <div>
        <div
          className={cn(
            'bg-surface-1 border-border flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
            'focus-within:ring-ring focus-within:border-primary focus-within:ring-2',
            error && 'border-destructive',
          )}
        >
          <Icon className="text-foreground-40 h-4 w-4 shrink-0" aria-hidden />
          <input
            ref={ref}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (error) onChange(e.target.value); // clear error on type
            }}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            data-testid={`${testId}-input`}
            className="text-foreground placeholder:text-foreground-40 flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            data-testid={`${testId}-submit`}
            aria-label="Submit"
            className="text-foreground-56 hover:text-primary disabled:text-foreground-24 shrink-0 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <div className="text-destructive-ink mt-1 text-xs" data-testid={`${testId}-error`}>
            {error}
          </div>
        )}
      </div>
    );
  },
);
CaptureBox.displayName = 'CaptureBox';
