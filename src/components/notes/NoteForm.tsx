import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { BRANCH_LIST } from '@/lib/branches';
import { MarkdownEditor } from '@/components/documents/MarkdownEditor';
import { useAuthStore } from '@/stores/authStore';
import {
  DECISION_STATUS_ORDER,
  DECISION_STATUS_LABEL,
  NOTE_KIND_LABEL,
  NOTE_KIND_ORDER,
  NOTE_MODULE_LABEL,
  NOTE_MODULE_ORDER,
  type CreateNoteInput,
  type UpdateNotePatches,
} from '@/lib/notes';
import type {
  DecisionStatus,
  NoteKind,
  NoteModule,
  NoteRow,
  NoteVisibility,
} from '@/types/database';

const KIND_VALUES = NOTE_KIND_ORDER as readonly NoteKind[];
const MODULE_VALUES = NOTE_MODULE_ORDER as readonly NoteModule[];
const VIS_VALUES = ['work', 'personal'] as const;
const STATUS_VALUES = DECISION_STATUS_ORDER as readonly DecisionStatus[];

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const baseSchema = z.object({
  title: z.string().max(300, 'Title too long').optional().or(z.literal('')),
  body_md: z.string().min(1, 'Body is required'),
  kind: z.enum(KIND_VALUES as unknown as [NoteKind, ...NoteKind[]]),
  module: z.enum(MODULE_VALUES as unknown as [NoteModule, ...NoteModule[]]),
  visibility: z.enum(VIS_VALUES),
  branch: z.string().optional().or(z.literal('')),
  decision_reason: z.string().max(2000).optional().or(z.literal('')),
  decision_impact: z.string().max(2000).optional().or(z.literal('')),
  decided_at: z.string().optional().or(z.literal('')),
  decision_status: z
    .enum(STATUS_VALUES as unknown as [DecisionStatus, ...DecisionStatus[]])
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof baseSchema>;

export function NoteForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: NoteRow;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: CreateNoteInput | UpdateNotePatches) => Promise<void>;
}) {
  const isEdit = !!initial;
  const role = useAuthStore((s) => s.profile?.role) ?? null;
  const isAdminLike = role === 'admin' || role === 'ceo';

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: initial
      ? {
          title: initial.title ?? '',
          body_md: initial.body_md,
          kind: initial.kind as NoteKind,
          module: initial.module as NoteModule,
          visibility: initial.visibility as NoteVisibility,
          branch: initial.branch ?? '',
          decision_reason: initial.decision_reason ?? '',
          decision_impact: initial.decision_impact ?? '',
          decided_at: initial.decided_at ?? '',
          decision_status: (initial.decision_status as DecisionStatus | null) ?? '',
        }
      : {
          title: '',
          body_md: '',
          kind: 'note',
          module: 'general',
          visibility: 'work',
          branch: '',
          decision_reason: '',
          decision_impact: '',
          decided_at: '',
          decision_status: '',
        },
  });

  // Personal visibility forces branch to null (DB CHECK enforces too; we
  // mirror it in the UI so users don't see a stale value).
  const visibility = form.watch('visibility');
  const kind = form.watch('kind');
  useEffect(() => {
    if (visibility === 'personal') {
      form.setValue('branch', '');
    }
  }, [visibility, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const branch =
        values.visibility === 'work' && values.branch && values.branch !== ''
          ? values.branch
          : null;

      // Non-admin/CEO + work + null branch is rejected by the RPC. We
      // surface that here instead of letting it 42501.
      if (values.visibility === 'work' && branch === null && !isAdminLike) {
        toast({
          title: 'Branch required',
          description:
            'Only admins and CEOs can create cross-branch work notes. Pick a branch or switch to Personal.',
          variant: 'destructive',
        });
        return;
      }

      const decisionStatus =
        values.kind === 'decision' && values.decision_status
          ? (values.decision_status as DecisionStatus)
          : null;
      const decisionReason =
        values.kind === 'decision' && values.decision_reason
          ? values.decision_reason
          : null;
      const decisionImpact =
        values.kind === 'decision' && values.decision_impact
          ? values.decision_impact
          : null;
      const decidedAt =
        values.kind === 'decision' && values.decided_at
          ? values.decided_at
          : null;

      if (isEdit) {
        const patches: UpdateNotePatches = {
          title: values.title?.trim() ? values.title.trim() : null,
          body_md: values.body_md,
          kind: values.kind,
          module: values.module,
          visibility: values.visibility,
          branch,
          decision_reason: decisionReason,
          decision_impact: decisionImpact,
          decided_at: decidedAt,
          decision_status: decisionStatus,
        };
        await onSubmit(patches);
      } else {
        const payload: CreateNoteInput = {
          body_md: values.body_md,
          title: values.title?.trim() ? values.title.trim() : null,
          kind: values.kind,
          module: values.module,
          visibility: values.visibility,
          branch,
          decision_reason: decisionReason,
          decision_impact: decisionImpact,
          decided_at: decidedAt,
          decision_status: decisionStatus,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update note' : 'Could not create note',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  const isDecision = kind === 'decision';

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input
          id="title"
          autoComplete="off"
          placeholder="Short headline — leave blank for a quick note"
          data-testid="note-title-input"
          {...form.register('title')}
        />
        {form.formState.errors.title && (
          <p className="text-destructive-ink text-xs">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            className={fieldClass}
            data-testid="note-kind-select"
            {...form.register('kind')}
          >
            {NOTE_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="module">Module</Label>
          <select
            id="module"
            className={fieldClass}
            data-testid="note-module-select"
            {...form.register('module')}
          >
            {NOTE_MODULE_ORDER.map((m) => (
              <option key={m} value={m}>
                {NOTE_MODULE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            className={fieldClass}
            data-testid="note-visibility-select"
            {...form.register('visibility')}
          >
            <option value="work">Work — branch / role scoped</option>
            <option value="personal">Personal — only you can see this</option>
          </select>
          {visibility === 'personal' && (
            <p className="text-subtle-foreground text-xs">
              Personal notes are creator-only. Admins and the CEO do not see them.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">
            Branch{visibility === 'work' && !isAdminLike ? '' : ' (optional)'}
          </Label>
          <select
            id="branch"
            className={fieldClass}
            disabled={visibility === 'personal'}
            data-testid="note-branch-select"
            {...form.register('branch')}
          >
            {visibility === 'personal' ? (
              <option value="">n/a</option>
            ) : (
              <>
                <option value="">
                  {isAdminLike ? 'Cross-branch (admin/CEO only)' : '— select branch —'}
                </option>
                {BRANCH_LIST.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Body</Label>
        <Controller
          control={form.control}
          name="body_md"
          render={({ field }) => (
            <MarkdownEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              rows={14}
              placeholder="Write the note, decision, meeting, idea… (Markdown supported)"
            />
          )}
        />
        {form.formState.errors.body_md && (
          <p className="text-destructive-ink text-xs">
            {form.formState.errors.body_md.message}
          </p>
        )}
      </div>

      {isDecision && (
        <div
          className="bg-surface-1 border-border space-y-4 rounded-lg border p-4"
          data-testid="note-decision-fields"
        >
          <div className="text-section-label text-primary-ink/80">Decision details</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="decided_at">Decided on</Label>
              <input
                id="decided_at"
                type="date"
                className={fieldClass}
                data-testid="note-decided-at-input"
                {...form.register('decided_at')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decision_status">Status</Label>
              <select
                id="decision_status"
                className={fieldClass}
                data-testid="note-decision-status-select"
                {...form.register('decision_status')}
              >
                <option value="">— select status —</option>
                {DECISION_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {DECISION_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="decision_reason">Why this decision?</Label>
            <textarea
              id="decision_reason"
              rows={3}
              className="bg-card border-border text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="The reasoning, constraints, options considered"
              data-testid="note-decision-reason-input"
              {...form.register('decision_reason')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decision_impact">Expected impact</Label>
            <textarea
              id="decision_impact"
              rows={3}
              className="bg-card border-border text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="What changes for the business once this lands"
              data-testid="note-decision-impact-input"
              {...form.register('decision_impact')}
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting || form.formState.isSubmitting}
        data-testid="note-submit-button"
      >
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
