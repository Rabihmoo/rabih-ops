import { Link, useNavigate } from 'react-router-dom';
import { Plus, Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePurchaseList } from '@/hooks/usePurchaseRequests';
import { usePurchaseFiltersStore } from '@/stores/purchaseFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { PurchaseFilterBar } from '@/components/purchases/PurchaseFilterBar';
import { PurchaseListItem } from '@/components/purchases/PurchaseListItem';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import type { PaymentStatus, PurchaseStatus } from '@/types/database';

export function PurchasesPage() {
  const { data, isLoading, error } = usePurchaseList();
  const navigate = useNavigate();
  const canMutate = useCanMutate();
  const count = data?.length ?? 0;

  const overdueCount = data?.filter((p) => p.is_overdue).length ?? 0;
  const unpaidCount =
    data?.filter(
      (p) =>
        (p.status as PurchaseStatus) !== 'cancelled' &&
        ((p.payment_status as PaymentStatus) === 'unpaid' ||
          (p.payment_status as PaymentStatus) === 'partial'),
    ).length ?? 0;
  const awaitingApprovalCount =
    data?.filter((p) => (p.status as PurchaseStatus) === 'submitted').length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Procurement"
        title="Purchasing"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/purchases/new" data-testid="new-purchase-button">
                <Plus className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat
                count={count}
                label={count === 1 ? 'request' : 'requests'}
              />
              {overdueCount > 0 && (
                <HeaderStat
                  count={overdueCount}
                  label="overdue delivery"
                  tone="destructive"
                />
              )}
              {awaitingApprovalCount > 0 && (
                <HeaderStat
                  count={awaitingApprovalCount}
                  label="awaiting approval"
                  tone="primary"
                />
              )}
              {unpaidCount > 0 && (
                <HeaderStat
                  count={unpaidCount}
                  label="unpaid"
                  tone="warning"
                />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />

      <PurchaseFilterBar />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading purchases…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load purchases: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && <PurchasesEmpty />}
        {!isLoading && !error && data && data.length > 0 && (
          <ul>
            {data.map((purchase) => (
              <li key={purchase.id} className="last:[&>button]:border-b-0">
                <PurchaseListItem
                  purchase={purchase}
                  onSelect={(id) => navigate(`/purchases/${id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PurchasesEmpty() {
  const bucket = usePurchaseFiltersStore((s) => s.bucket);
  const canMutate = useCanMutate();

  const COPY: Record<typeof bucket, { title: string; description: string }> = {
    pending: {
      title: 'No pending approvals',
      description: 'Drafts and freshly-submitted requests will land here.',
    },
    awaiting_delivery: {
      title: 'No purchases awaiting delivery',
      description:
        'Once a request is approved and ordered, it will move into this view until fully received.',
    },
    unpaid: {
      title: 'No unpaid purchases',
      description: "Everything that's been ordered or received has been paid in full.",
    },
    mine: {
      title: 'No requests under your name',
      description: 'Requests you create will appear here.',
    },
    all: {
      title: 'No purchases match the current filters',
      description: 'Try clearing the filters or switching the bucket.',
    },
  };

  // True all-clear: the unfiltered "all" bucket is empty. Anything else
  // is a filter result, so it gets the muted treatment per Phase 4.2/4.4.
  const isAllClear = bucket === 'all';
  const c = COPY[bucket];
  return (
    <EmptyState
      icon={isAllClear ? ShieldCheck : Receipt}
      title={c.title}
      description={c.description}
      tone={isAllClear ? 'hero' : 'muted'}
      size={isAllClear ? 'tall' : 'default'}
      action={
        canMutate && bucket !== 'unpaid' ? (
          <Button size="sm" asChild>
            <Link to="/purchases/new">
              <Plus className="mr-1 h-4 w-4" /> New request
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
