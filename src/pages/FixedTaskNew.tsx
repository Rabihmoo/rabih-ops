import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { RecurringTemplateForm } from '@/components/fixed-tasks/RecurringTemplateForm';
import { useCreateRecurringTemplate } from '@/hooks/useRecurringTemplates';
import type {
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
} from '@/lib/recurring-templates';

export function FixedTaskNewPage() {
  const navigate = useNavigate();
  const create = useCreateRecurringTemplate();

  const handleSubmit = async (
    input: CreateRecurringTemplateInput | UpdateRecurringTemplateInput,
  ) => {
    const row = await create.mutateAsync(input as CreateRecurringTemplateInput);
    toast({ title: 'Recurring template created' });
    navigate(`/fixed-tasks/${row.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/fixed-tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to fixed tasks
      </Link>
      <h1 className="text-foreground text-3xl font-semibold tracking-tight leading-tight">
        New fixed task
      </h1>
      <Card>
        <CardContent className="space-y-3 p-5">
          <RecurringTemplateForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create template"
          />
        </CardContent>
      </Card>
    </div>
  );
}
