import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useCompanies } from '@/hooks/useCompanies';
import { useCompanyFiltersStore } from '@/stores/companyFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { BRANCH_LIST } from '@/lib/branches';
import { CompanyListItem } from '@/components/companies/CompanyListItem';
import { COMPANY_CATEGORIES, COMPANY_CATEGORY_LABEL } from '@/lib/companies';
import type { CompanyCategory } from '@/types/database';

const CATEGORIES: { id: CompanyCategory | null; label: string }[] = [
  { id: null, label: 'All' },
  ...COMPANY_CATEGORIES.map((c) => ({ id: c as CompanyCategory | null, label: COMPANY_CATEGORY_LABEL[c] })),
];

export function CompaniesPage() {
  const filters = useCompanyFiltersStore();
  const canMutate = useCanMutate();
  const { data, isLoading, error } = useCompanies({
    category: filters.category,
    branch: filters.branch,
    search: filters.search.trim() || null,
    includeInactive: filters.includeInactive,
    limit: 200,
  });

  const granularActive =
    filters.branch !== null
    || filters.includeInactive
    || filters.search.trim() !== '';

  const count = data?.length ?? 0;
  const archivedCount = (data ?? []).filter((c) => !c.active).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Directory"
        title="Companies"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/companies/new" data-testid="new-company-button">
                <Plus className="mr-1 h-4 w-4" /> New company
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat count={count} label={count === 1 ? 'company' : 'companies'} />
              {archivedCount > 0 && filters.includeInactive && (
                <HeaderStat count={archivedCount} label="archived" tone="muted" />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        Suppliers, contractors, landlords, agencies, partners. Branch-scoped.
      </p>

      <FilterPanel
        active={granularActive}
        buckets={
          <BucketGroup
            buckets={CATEGORIES.map((c) => ({ id: c.id ?? 'all', label: c.label }))}
            active={filters.category ?? 'all'}
            onSelect={(id) =>
              filters.setCategory(id === 'all' ? null : (id as CompanyCategory))
            }
          />
        }
        controls={
          <>
            <SearchField
              value={filters.search}
              onChange={filters.setSearch}
              placeholder="Search name or notes…"
            />
            <select
              aria-label="Branch"
              className={FILTER_SELECT_CLASS}
              value={filters.branch ?? ''}
              onChange={(e) => filters.setBranch(e.target.value || null)}
            >
              <option value="">All branches</option>
              {BRANCH_LIST.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <label className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={filters.includeInactive}
                onChange={(e) => filters.setIncludeInactive(e.target.checked)}
              />
              Show archived
            </label>
            {granularActive && (
              <button
                type="button"
                onClick={filters.reset}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </>
        }
      />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading companies…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load companies: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Building2}
            title="No companies yet"
            description="Add suppliers, contractors and other organisations you work with."
            tone="muted"
            action={
              canMutate ? (
                <Button size="sm" asChild>
                  <Link to="/companies/new">
                    <Plus className="mr-1 h-4 w-4" /> New company
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <ul>
            {(data ?? []).map((c) => (
              <li key={c.id} className="last:[&>a]:border-b-0">
                <CompanyListItem company={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
