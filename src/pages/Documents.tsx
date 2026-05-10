import { Link } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDocuments } from '@/hooks/useDocuments';
import { useDocumentFiltersStore } from '@/stores/documentFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { BRANCH_LIST } from '@/lib/branches';
import { DocumentListItem } from '@/components/documents/DocumentListItem';
import type {
  DocumentCategory,
  DocumentStatus,
  DocumentVisibility,
} from '@/types/database';

const CATEGORIES: { id: DocumentCategory | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'sop', label: 'SOPs' },
  { id: 'policy', label: 'Policies' },
  { id: 'checklist', label: 'Checklists' },
  { id: 'note', label: 'Notes' },
  { id: 'reference', label: 'Reference' },
  { id: 'personal', label: 'Personal' },
];

const STATUSES: DocumentStatus[] = ['draft', 'active', 'archived'];

export function DocumentsPage() {
  const filters = useDocumentFiltersStore();
  const canMutate = useCanMutate();
  const { data, isLoading, error } = useDocuments({
    category: filters.category,
    branch: filters.branch,
    status: filters.status,
    visibility: filters.visibility,
    search: filters.search.trim() || null,
  });

  const granularActive =
    filters.branch !== null ||
    filters.status !== null ||
    filters.visibility !== null ||
    filters.search.trim() !== '';

  const count = data?.length ?? 0;
  const personalCount = (data ?? []).filter((d) => d.visibility === 'personal').length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Knowledge"
        title="Documents"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/documents/new" data-testid="new-document-button">
                <Plus className="mr-1 h-4 w-4" /> New document
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat count={count} label={count === 1 ? 'document' : 'documents'} />
              {personalCount > 0 && (
                <HeaderStat count={personalCount} label="personal" tone="muted" />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        SOPs, policies, checklists, reference material, and personal notes.
        Search hits title and body. Personal documents are visible only to you.
      </p>

      <FilterPanel
        active={granularActive}
        buckets={
          <BucketGroup
            buckets={CATEGORIES.map((c) => ({ id: c.id ?? 'all', label: c.label }))}
            active={filters.category ?? 'all'}
            onSelect={(id) =>
              filters.setCategory(id === 'all' ? null : (id as DocumentCategory))
            }
          />
        }
        controls={
          <>
            <SearchField
              value={filters.search}
              onChange={filters.setSearch}
              placeholder="Search title or body…"
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
            <select
              aria-label="Status"
              className={FILTER_SELECT_CLASS}
              value={filters.status ?? ''}
              onChange={(e) =>
                filters.setStatus((e.target.value as DocumentStatus) || null)
              }
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Visibility"
              className={FILTER_SELECT_CLASS}
              value={filters.visibility ?? ''}
              onChange={(e) =>
                filters.setVisibility(
                  (e.target.value as DocumentVisibility) || null,
                )
              }
            >
              <option value="">Work + personal</option>
              <option value="work">Work only</option>
              <option value="personal">Personal only</option>
            </select>
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
          <div className="text-muted-foreground p-6 text-sm">Loading documents…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load documents: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Create your first SOP, policy, or note. Personal notes are private to you."
            tone="muted"
            action={
              canMutate ? (
                <Button size="sm" asChild>
                  <Link to="/documents/new">
                    <Plus className="mr-1 h-4 w-4" /> New document
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <ul>
            {(data ?? []).map((d) => (
              <li key={d.id} className="last:[&>a]:border-b-0">
                <DocumentListItem doc={d} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
