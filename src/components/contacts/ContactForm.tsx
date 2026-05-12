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
import { useCompanies } from '@/hooks/useCompanies';
import type { CreateContactInput, UpdateContactPatch } from '@/lib/contacts';
import type { ContactRow } from '@/types/database';

const fieldClass =
  'bg-card border-border text-foreground h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const schema = z.object({
  full_name: z.string().min(1, 'Name is required').max(200),
  company_id: z.string().optional().or(z.literal('')),
  role: z.string().max(120).optional().or(z.literal('')),
  email: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(80).optional().or(z.literal('')),
  whatsapp: z.string().max(80).optional().or(z.literal('')),
  telegram_handle: z.string().max(80).optional().or(z.literal('')),
  notes: z.string().max(4000).optional().or(z.literal('')),
  branches: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

export interface ContactFormSeed {
  full_name?: string;
  company_id?: string;
}

export function ContactForm({
  initial,
  initialBranches,
  seed,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: ContactRow;
  initialBranches?: string[];
  seed?: ContactFormSeed;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: {
    create?: CreateContactInput;
    update?: UpdateContactPatch;
    branches: string[];
  }) => Promise<void>;
}) {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'ceo';
  const isEdit = !!initial;
  const companies = useCompanies({ limit: 200 });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          full_name: initial.full_name,
          company_id: initial.company_id ?? '',
          role: initial.role ?? '',
          email: initial.email ?? '',
          phone: initial.phone ?? '',
          whatsapp: initial.whatsapp ?? '',
          telegram_handle: initial.telegram_handle ?? '',
          notes: initial.notes ?? '',
          branches: initialBranches ?? [],
        }
      : {
          full_name: seed?.full_name ?? '',
          company_id: seed?.company_id ?? '',
          role: '',
          email: '',
          phone: '',
          whatsapp: '',
          telegram_handle: '',
          notes: '',
          branches: [],
        },
  });

  const handle = form.handleSubmit(async (values) => {
    try {
      const companyId = values.company_id ? values.company_id : null;
      // Non-admin must end up with at least one branch — either explicitly
      // picked or copied from the company by the RPC. If they pick none AND
      // no company is selected, that's a hard error.
      if (!isAdmin && values.branches.length === 0 && !companyId) {
        form.setError('branches', {
          type: 'manual',
          message:
            'Pick at least one branch you can access, or attach a company so its branches can be copied.',
        });
        return;
      }

      const sharedFields = {
        role: values.role?.trim() || null,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        whatsapp: values.whatsapp?.trim() || null,
        telegram_handle: values.telegram_handle?.trim() || null,
        notes: values.notes && values.notes.length > 0 ? values.notes : null,
      };

      if (isEdit) {
        await onSubmit({
          update: {
            full_name: values.full_name.trim(),
            company_id: companyId,
            ...sharedFields,
          },
          branches: values.branches,
        });
      } else {
        await onSubmit({
          create: {
            full_name: values.full_name.trim(),
            company_id: companyId,
            branches: values.branches,
            ...sharedFields,
          },
          branches: values.branches,
        });
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update contact' : 'Could not create contact',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  const branchesEmpty = (form.watch('branches') ?? []).length === 0;
  const companySelected = !!form.watch('company_id');

  return (
    <form onSubmit={handle} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" autoComplete="off" {...form.register('full_name')} />
        {form.formState.errors.full_name && (
          <p className="text-destructive text-xs">
            {form.formState.errors.full_name.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_id">Company (optional)</Label>
          <select id="company_id" className={fieldClass} {...form.register('company_id')}>
            <option value="">No company</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role (optional)</Label>
          <Input id="role" placeholder="Operations manager, Driver, …" {...form.register('role')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" type="email" {...form.register('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" {...form.register('phone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp (optional)</Label>
          <Input id="whatsapp" {...form.register('whatsapp')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telegram_handle">Telegram handle (optional)</Label>
          <Input id="telegram_handle" placeholder="without the @" {...form.register('telegram_handle')} />
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
              testId="contact-form-branches"
            />
          )}
        />
        {form.formState.errors.branches && (
          <p className="text-destructive text-xs">
            {form.formState.errors.branches.message as string}
          </p>
        )}
        {branchesEmpty && companySelected && (
          <p className="text-subtle-foreground text-xs">
            Leave empty to inherit the company's branches when this contact is created.
          </p>
        )}
        {branchesEmpty && !companySelected && !isAdmin && (
          <p className="text-subtle-foreground text-xs">
            Pick at least one branch you can access, or attach a company first.
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
