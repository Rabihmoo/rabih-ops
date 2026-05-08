import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FollowUpForm } from '@/components/follow-ups/FollowUpForm';
import { toast } from '@/components/ui/toaster';
import { useCreateFollowUp } from '@/hooks/useFollowUps';
import type { CreateFollowUpInput, UpdateFollowUpInput } from '@/lib/follow-ups';

export function FollowUpNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTaskId = searchParams.get('task_id') ?? undefined;
  const create = useCreateFollowUp();

  const handleSubmit = async (input: CreateFollowUpInput | UpdateFollowUpInput) => {
    const row = await create.mutateAsync(input as CreateFollowUpInput);
    toast({ title: 'Follow-up created' });
    navigate(`/follow-ups/${row.id}`, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Link
        to="/follow-ups"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to follow-ups
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">New follow-up</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {initialTaskId ? 'Linked to task' : 'Create'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FollowUpForm
            initialTaskId={initialTaskId}
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create follow-up"
          />
        </CardContent>
      </Card>
    </div>
  );
}
