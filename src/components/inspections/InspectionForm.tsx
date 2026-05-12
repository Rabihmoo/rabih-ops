import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { BRANCH_LIST } from '@/lib/branches';
import { useAuthStore } from '@/stores/authStore';
import type {
  InspectionArea,
  InspectionResult,
  InspectionRow,
} from '@/types/database';
import type {
  CreateInspectionInput,
  UpdateInspectionInput,
} from '@/lib/inspections';

const AREAS: InspectionArea[] = [
  'kitchen',
  'storage',
  'service_area',
  'cold_room',
  'dry_store',
  'staff_area',
  'full_branch',
];

const RESULTS: InspectionResult[] = ['pending', 'pass', 'issues_found', 'failed'];

const schema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  area: z.enum(AREAS as [InspectionArea, ...InspectionArea[]]),
  date: z.string().min(1, 'Date is required'),
  general_notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),
  result: z.enum(RESULTS as [InspectionResult, ...InspectionResult[]]).optional(),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function InspectionForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: InspectionRow;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (input: CreateInspectionInput | UpdateInspectionInput) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  // Admin/CEO see every branch — they're the only roles that reach this form.
  const allowedBranches = BRANCH_LIST.filter(() => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'ceo') return true;
    return false;
  });

  const isEdit = !!initial;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          branch: initial.branch,
          area: initial.area as InspectionArea,
          date: initial.inspection_date,
          general_notes: initial.general_notes ?? '',
          result: initial.result as InspectionResult,
        }
      : {
          branch: allowedBranches[0]?.code ?? '',
          area: 'kitchen',
          date: new Date().toISOString().slice(0, 10),
          general_notes: '',
        },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const general_notes =
        values.general_notes && values.general_notes.length > 0
          ? values.general_notes
          : null;

      if (isEdit) {
        const payload: UpdateInspectionInput = {
          branch: values.branch,
          area: values.area,
          inspection_date: values.date,
          general_notes,
          result: values.result,
        };
        await onSubmit(payload);
      } else {
        const payload: CreateInspectionInput = {
          branch: values.branch,
          area: values.area,
          date: values.date,
          general_notes,
        };
        await onSubmit(payload);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update inspection' : 'Could not create inspection',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <select id="branch" className={fieldClass} {...form.register('branch')}>
            {allowedBranches.length === 0 && (
              <option value="">No branches available</option>
            )}
            {allowedBranches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          {form.formState.errors.branch && (
            <p className="text-destructive-ink text-xs">
              {form.formState.errors.branch.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="area">Area</Label>
          <select id="area" className={fieldClass} {...form.register('area')}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Inspection date</Label>
          <Input id="date" type="date" {...form.register('date')} />
          {form.formState.errors.date && (
            <p className="text-destructive-ink text-xs">
              {form.formState.errors.date.message}
            </p>
          )}
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="result">Result</Label>
            <select id="result" className={fieldClass} {...form.register('result')}>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="general_notes">General notes (optional)</Label>
        <textarea
          id="general_notes"
          rows={3}
          className={`${fieldClass} h-auto py-2`}
          {...form.register('general_notes')}
        />
      </div>

      <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
        {(submitting || form.formState.isSubmitting) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
