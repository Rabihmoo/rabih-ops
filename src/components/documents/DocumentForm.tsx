import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { BRANCH_LIST } from '@/lib/branches';
import { MarkdownEditor } from './MarkdownEditor';
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from '@/lib/documents';
import type { DocumentTemplateDraft } from '@/lib/document-templates';
import type {
  DocumentCategory,
  DocumentRow,
  DocumentStatus,
  DocumentVisibility,
} from '@/types/database';

const CATEGORIES: DocumentCategory[] = [
  'sop',
  'policy',
  'checklist',
  'note',
  'reference',
  'personal',
];
const STATUSES: DocumentStatus[] = ['draft', 'active', 'archived'];
const VISIBILITIES: DocumentVisibility[] = ['work', 'personal'];

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const baseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300, 'Title too long'),
  category: z.enum(CATEGORIES as [DocumentCategory, ...DocumentCategory[]]),
  visibility: z.enum(VISIBILITIES as [DocumentVisibility, ...DocumentVisibility[]]),
  branch: z.string().optional().or(z.literal('')),
  status: z.enum(STATUSES as [DocumentStatus, ...DocumentStatus[]]),
  body_md: z.string().optional().or(z.literal('')),
  change_note: z.string().max(300).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof baseSchema>;

export function DocumentForm({
  initial,
  initialDraft,
  submitting,
  onSubmit,
  submitLabel,
  showStatus = true,
  showChangeNote = false,
}: {
  initial?: DocumentRow;
  initialDraft?: DocumentTemplateDraft;
  submitting?: boolean;
  submitLabel: string;
  showStatus?: boolean;
  showChangeNote?: boolean;
  onSubmit: (
    payload: CreateDocumentInput | UpdateDocumentInput,
    changeNote?: string | null,
  ) => Promise<void>;
}) {
  const isEdit = !!initial;
  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          category: initial.category as DocumentCategory,
          visibility: initial.visibility as DocumentVisibility,
          branch: initial.branch ?? '',
          status: initial.status as DocumentStatus,
          body_md: initial.body_md ?? '',
          change_note: '',
        }
      : initialDraft
        ? {
            title: initialDraft.title,
            category: initialDraft.category,
            visibility: initialDraft.visibility,
            branch: '',
            status: initialDraft.status ?? 'draft',
            body_md: initialDraft.body_md,
            change_note: '',
          }
        : {
            title: '',
            category: 'sop',
            visibility: 'work',
            branch: '',
            status: 'draft',
            body_md: '',
            change_note: '',
          },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const branch = values.branch && values.branch.trim() !== '' ? values.branch : null;
      const body_md = values.body_md && values.body_md.length > 0 ? values.body_md : null;
      if (isEdit) {
        const payload: UpdateDocumentInput = {
          title: values.title,
          category: values.category,
          visibility: values.visibility,
          branch,
          status: values.status,
          body_md,
        };
        await onSubmit(payload, values.change_note?.trim() || null);
      } else {
        const payload: CreateDocumentInput = {
          title: values.title,
          category: values.category,
          visibility: values.visibility,
          branch,
          status: values.status,
          body_md,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update document' : 'Could not create document',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" autoComplete="off" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-destructive-ink text-xs">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select id="category" className={fieldClass} {...form.register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="visibility">Visibility</Label>
          <select id="visibility" className={fieldClass} {...form.register('visibility')}>
            <option value="work">Work — branch / role scoped</option>
            <option value="personal">Personal — only you can see this</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">Branch (optional)</Label>
          <select id="branch" className={fieldClass} {...form.register('branch')}>
            <option value="">All branches / cross-branch</option>
            {BRANCH_LIST.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {showStatus && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select id="status" className={fieldClass} {...form.register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
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
              rows={18}
            />
          )}
        />
      </div>

      {showChangeNote && (
        <div className="space-y-2">
          <Label htmlFor="change_note">Change note (optional)</Label>
          <Input
            id="change_note"
            placeholder="What changed in this version?"
            {...form.register('change_note')}
          />
          <p className="text-subtle-foreground text-xs">
            Stored on the version row so future-you knows why.
          </p>
        </div>
      )}

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
