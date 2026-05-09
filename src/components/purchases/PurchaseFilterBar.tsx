import {
  usePurchaseFiltersStore,
  type PurchaseBucket,
} from '@/stores/purchaseFiltersStore';
import { BRANCH_LIST } from '@/lib/branches';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import type {
  PaymentStatus,
  PurchaseStatus,
  TaskPriority,
} from '@/types/database';

const BUCKETS: { id: PurchaseBucket; label: string }[] = [
  { id: 'awaiting_delivery', label: 'Awaiting delivery' },
  { id: 'pending', label: 'Pending approval' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'mine', label: 'Mine' },
  { id: 'all', label: 'All' },
];

const STATUSES: PurchaseStatus[] = [
  'draft',
  'submitted',
  'ordered',
  'partially_received',
  'fully_received',
  'cancelled',
];
const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'partial', 'paid'];
const PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

export function PurchaseFilterBar() {
  const { bucket, branch, status, priority, paymentStatus, search } =
    usePurchaseFiltersStore();
  const setBucket = usePurchaseFiltersStore((s) => s.setBucket);
  const setBranch = usePurchaseFiltersStore((s) => s.setBranch);
  const setStatus = usePurchaseFiltersStore((s) => s.setStatus);
  const setPriority = usePurchaseFiltersStore((s) => s.setPriority);
  const setPaymentStatus = usePurchaseFiltersStore((s) => s.setPaymentStatus);
  const setSearch = usePurchaseFiltersStore((s) => s.setSearch);
  const resetGranular = usePurchaseFiltersStore((s) => s.resetGranular);

  const granularActive =
    branch !== null ||
    status !== null ||
    priority !== null ||
    paymentStatus !== null ||
    search.trim() !== '';

  return (
    <FilterPanel
      active={granularActive}
      buckets={<BucketGroup buckets={BUCKETS} active={bucket} onSelect={setBucket} />}
      controls={
        <>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search title, supplier, notes…"
          />
          <select
            aria-label="Branch"
            className={FILTER_SELECT_CLASS}
            value={branch ?? ''}
            onChange={(e) => setBranch(e.target.value || null)}
          >
            <option value="">All branches</option>
            {BRANCH_LIST.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            className={FILTER_SELECT_CLASS}
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value as PurchaseStatus) || null)}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            aria-label="Payment"
            className={FILTER_SELECT_CLASS}
            value={paymentStatus ?? ''}
            onChange={(e) =>
              setPaymentStatus((e.target.value as PaymentStatus) || null)
            }
          >
            <option value="">Any payment</option>
            {PAYMENT_STATUSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className={FILTER_SELECT_CLASS}
            value={priority ?? ''}
            onChange={(e) => setPriority((e.target.value as TaskPriority) || null)}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {granularActive && (
            <button
              type="button"
              onClick={resetGranular}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
        </>
      }
    />
  );
}
