import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useContacts } from '@/hooks/useContacts';
import { useCompanies } from '@/hooks/useCompanies';
import { useContactFiltersStore } from '@/stores/contactFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { BRANCH_LIST } from '@/lib/branches';
import { ContactListItem } from '@/components/contacts/ContactListItem';

export function ContactsPage() {
  const filters = useContactFiltersStore();
  const canMutate = useCanMutate();
  const { data, isLoading, error } = useContacts({
    companyId: filters.companyId,
    branch: filters.branch,
    search: filters.search.trim() || null,
    includeInactive: filters.includeInactive,
    limit: 200,
  });
  const companies = useCompanies({ limit: 200 });

  const granularActive =
    filters.companyId !== null
    || filters.branch !== null
    || filters.includeInactive
    || filters.search.trim() !== '';

  const count = data?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Directory"
        title="Contacts"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/contacts/new" data-testid="new-contact-button">
                <Plus className="mr-1 h-4 w-4" /> New contact
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <HeaderStat count={count} label={count === 1 ? 'contact' : 'contacts'} />
          ) : (
            <span>Loading…</span>
          )
        }
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        People you work with, attached to companies or independent.
      </p>

      <FilterPanel
        active={granularActive}
        // No quick-pivot buckets for contacts in V1 — controls only.
        buckets={null}
        controls={
          <>
            <SearchField
              value={filters.search}
              onChange={filters.setSearch}
              placeholder="Search name, role or email…"
            />
            <select
              aria-label="Company"
              className={FILTER_SELECT_CLASS}
              value={filters.companyId ?? ''}
              onChange={(e) => filters.setCompanyId(e.target.value || null)}
            >
              <option value="">All companies</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
          <div className="text-muted-foreground p-6 text-sm">Loading contacts…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load contacts: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Add the people you talk to at suppliers, contractors, and partners."
            tone="muted"
            action={
              canMutate ? (
                <Button size="sm" asChild>
                  <Link to="/contacts/new">
                    <Plus className="mr-1 h-4 w-4" /> New contact
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <ul>
            {(data ?? []).map((ct) => (
              <li key={ct.id} className="last:[&>a]:border-b-0">
                <ContactListItem contact={ct} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
