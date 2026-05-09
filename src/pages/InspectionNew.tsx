import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionForm } from '@/components/inspections/InspectionForm';
import { toast } from '@/components/ui/toaster';
import { useCreateInspection } from '@/hooks/useInspections';
import type { CreateInspectionInput, UpdateInspectionInput } from '@/lib/inspections';

export function InspectionNewPage() {
  const navigate = useNavigate();
  const create = useCreateInspection();

  const handleSubmit = async (input: CreateInspectionInput | UpdateInspectionInput) => {
    const row = await create.mutateAsync(input as CreateInspectionInput);
    toast({ title: 'Inspection created' });
    navigate(`/inspections/${row.id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/inspections"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to inspections
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          New inspection
        </h1>
        <p className="text-muted-foreground text-sm">
          Pick the branch and area, set the date. You can add findings on the next
          screen and mark the result when the audit is complete.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <InspectionForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create inspection"
          />
        </CardContent>
      </Card>
    </div>
  );
}
