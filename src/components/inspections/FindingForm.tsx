import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type {
  FindingSeverity,
  FindingStatus,
  InspectionFindingRow,
} from '@/types/database';
import type {
  AddFindingInput,
  UpdateFindingInput,
} from '@/lib/inspections';

const SEVERITIES: FindingSeverity[] = ['minor', 'major', 'critical'];
const STATUSES: FindingStatus[] = ['open', 'in_progress', 'resolved', 'escalated'];

const schema = z.object({
  severity: z.enum(SEVERITIES as [FindingSeverity, ...FindingSeverity[]]),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(2000, 'Description too long'),
  action_required: z
    .string()
    .max(2000, 'Too long')
    .optional()
    .or(z.literal('')),
  responsible: z.string().max(200, 'Too long').optional().or(z.literal('')),
  follow_up_date: z.string().optional().or(z.literal('')),
  status: z.enum(STATUSES as [FindingStatus, ...FindingStatus[]]).optional(),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function FindingForm({
  initial,
  inspectionId,
  submitting,
  onAdd,
  onUpdate,
  onCancel,
}: {
  initial?: InspectionFindingRow;
  inspectionId: string;
  submitting?: boolean;
  onAdd?: (input: AddFindingInput) => Promise<unknown>;
  onUpdate?: (
    findingId: string,
    updates: UpdateFindingInput,
  ) => Promise<unknown>;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          severity: initial.severity as FindingSeverity,
          description: initial.description,
          action_required: initial.action_required ?? '',
          responsible: initial.responsible ?? '',
          follow_up_date: initial.follow_up_date ?? '',
          status: initial.status as FindingStatus,
        }
      : {
          severity: 'minor',
          description: '',
          action_required: '',
          responsible: '',
          follow_up_date: '',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const action_required =
        values.action_required && values.action_required.length > 0
          ? values.action_required
          : null;
      const responsible =
        values.responsible && values.responsible.length > 0
          ? values.responsible
          : null;
      const follow_up_date =
        values.follow_up_date && values.follow_up_date.length > 0
          ? values.follow_up_date
          : null;

      if (isEdit && initial && onUpdate) {
        await onUpdate(initial.id, {
          severity: values.severity,
          description: values.description,
          action_required,
          responsible,
          follow_up_date,
          status: values.status,
        });
      } else if (!isEdit && onAdd) {
        await onAdd({
          inspectionId,
          severity: values.severity,
          description: values.description,
          action_required,
          responsible,
          follow_up_date,
        });
      }
      onCancel();
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update finding' : 'Could not add finding',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={2}
          className={`${fieldClass} h-auto py-2`}
          placeholder="What was found?"
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p className="text-destructive-ink text-xs">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="severity">Severity</Label>
          <select id="severity" className={fieldClass} {...form.register('severity')}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select id="status" className={fieldClass} {...form.register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="responsible">Responsible (optional)</Label>
          <Input
            id="responsible"
            placeholder="Person or team accountable"
            {...form.register('responsible')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="follow_up_date">Follow-up date (optional)</Label>
          <Input id="follow_up_date" type="date" {...form.register('follow_up_date')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="action_required">Action required (optional)</Label>
        <textarea
          id="action_required"
          rows={2}
          className={`${fieldClass} h-auto py-2`}
          placeholder="What needs to happen to resolve this?"
          {...form.register('action_required')}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting || form.formState.isSubmitting}>
          {(submitting || form.formState.isSubmitting) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {isEdit ? 'Save changes' : 'Add finding'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
