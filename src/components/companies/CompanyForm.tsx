import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { BranchMultiSelect } from '@/components/shared/BranchMultiSelect';
import { useAuthStore } from '@/stores/authStore';
import {
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_LABEL,
  type CreateCompanyInput,
  type UpdateCompanyPatch,
} from '@/lib/companies';
import type { CompanyCategory, CompanyRow } from '@/types/database';

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(COMPANY_CATEGORIES as [CompanyCategory, ...CompanyCategory[]]),
  website: z.string().max(500).optional().or(z.literal('')),
  phone: z.string().max(80).optional().or(z.literal('')),
  email: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(4000).optional().or(z.literal('')),
  branches: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export interface CompanyFormSeed {
  name?: string;
  category?: CompanyCategory;
  branches?: string[];
}

export function CompanyForm({
  initial,
  initialBranches,
  seed,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: CompanyRow;
  initialBranches?: string[];
  seed?: CompanyFormSeed;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: {
    create?: CreateCompanyInput;
    update?: UpdateCompanyPatch;
    branches: string[];
  }) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'ceo';
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          name: initial.name,
          category: initial.category as CompanyCategory,
          website: initial.website ?? '',
          phone: initial.phone ?? '',
          email: initial.email ?? '',
          notes: initial.notes ?? '',
          branches: initialBranches ?? [],
        }
      : {
          name: seed?.name ?? '',
          category: seed?.category ?? 'supplier',
          website: '',
          phone: '',
          email: '',
          notes: '',
          branches: seed?.branches ?? [],
        },
  });

  const handle = form.handleSubmit(async (values) => {
    try {
      // Non-admin must pick at least one branch.
      if (!isAdmin && values.branches.length === 0) {
        form.setError('branches', {
          type: 'manual',
          message: 'You must assign at least one branch you can access.',
        });
        return;
      }

      const sharedFields = {
        website: values.website?.trim() ? values.website.trim() : null,
        phone: values.phone?.trim() ? values.phone.trim() : null,
        email: values.email?.trim() ? values.email.trim() : null,
        notes: values.notes && values.notes.length > 0 ? values.notes : null,
      };

      if (isEdit) {
        await onSubmit({
          update: {
            name: values.name.trim(),
            category: values.category,
            ...sharedFields,
          },
          branches: values.branches,
        });
      } else {
        await onSubmit({
          create: {
            name: values.name.trim(),
            category: values.category,
            branches: values.branches,
            ...sharedFields,
          },
          branches: values.branches,
        });
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update company' : 'Could not create company',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <form onSubmit={handle} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="off" {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select id="category" className={fieldClass} {...form.register('category')}>
            {COMPANY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COMPANY_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" type="url" placeholder="https://" {...form.register('website')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" {...form.register('phone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" type="email" {...form.register('email')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Branches</Label>
        <Controller
          control={form.control}
          name="branches"
          render={({ field }) => (
            <BranchMultiSelect
              value={field.value}
              onChange={field.onChange}
              testId="company-form-branches"
            />
          )}
        />
        {form.formState.errors.branches && (
          <p className="text-destructive text-xs">
            {form.formState.errors.branches.message as string}
          </p>
        )}
        {!isAdmin && (
          <p className="text-subtle-foreground text-xs">
            You can only assign branches you have access to. Leave empty isn't allowed for
            your role — pick at least one.
          </p>
        )}
        {isAdmin && (
          <p className="text-subtle-foreground text-xs">
            Leave empty to lock the row to admin/CEO. Otherwise pick the branches that
            should see this company.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          rows={3}
          className={`${fieldClass} h-auto py-2`}
          {...form.register('notes')}
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
