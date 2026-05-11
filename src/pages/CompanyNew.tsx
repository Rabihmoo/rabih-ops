import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from '@/components/ui/toaster';
import { useCreateCompany, useSetCompanyBranches } from '@/hooks/useCompanies';
import { useCanMutate } from '@/hooks/usePermissions';

export function CompanyNewPage() {
  const navigate = useNavigate();
  const create = useCreateCompany();
  // create RPC already sets initial branches; set_branches isn't needed
  // for the create path. Keeping the hook unused-imported would be noisy.
  void useSetCompanyBranches; // hint to tree-shakers; no-op

  const canMutate = useCanMutate();

  if (!canMutate) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/companies"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to companies
        </Link>
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldAlert}
              tone="warning"
              size="tall"
              title="You can't create companies."
              description="Your role is read-only for the Directory. Ask an admin or manager to add this company for you."
              action={
                <Button variant="outline" asChild size="sm">
                  <Link to="/companies">Back to companies</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/companies"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to companies
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          New company
        </h1>
        <p className="text-muted-foreground text-sm">
          Add a supplier, contractor, or other organisation. Pick at least one
          branch unless you're admin/CEO.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <CompanyForm
            submitting={create.isPending}
            submitLabel="Create company"
            onSubmit={async ({ create: payload }) => {
              if (!payload) return;
              const row = await create.mutateAsync(payload);
              toast({ title: 'Company created' });
              navigate(`/companies/${row.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
