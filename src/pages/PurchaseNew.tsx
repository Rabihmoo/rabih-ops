import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { toast } from '@/components/ui/toaster';
import { useCreatePurchase } from '@/hooks/usePurchaseRequests';
import type {
  CreatePurchaseInput,
  UpdatePurchaseInput,
} from '@/lib/purchase-requests';

export function PurchaseNewPage() {
  const navigate = useNavigate();
  const create = useCreatePurchase();

  const handleSubmit = async (input: CreatePurchaseInput | UpdatePurchaseInput) => {
    const row = await create.mutateAsync(input as CreatePurchaseInput);
    toast({ title: 'Purchase request created' });
    navigate(`/purchases/${row.id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/purchases"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to purchases
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          New purchase request
        </h1>
        <p className="text-muted-foreground text-sm">
          The request starts as a draft. You can fill in everything you know now —
          amounts, quantities, dates — and submit it for approval when ready.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <PurchaseForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create draft"
          />
        </CardContent>
      </Card>
    </div>
  );
}
