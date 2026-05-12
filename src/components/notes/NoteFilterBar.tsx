import {
  BucketGroup,
  FILTER_SELECT_CLASS,
  FilterPanel,
  SearchField,
} from '@/components/shared/FilterPanel';
import { BRANCH_LIST } from '@/lib/branches';
import {
  NOTE_KIND_LABEL,
  NOTE_KIND_ORDER,
  NOTE_MODULE_LABEL,
  NOTE_MODULE_ORDER,
} from '@/lib/notes';
import type { NoteKind, NoteModule, NoteVisibility } from '@/types/database';

export interface NoteFilterValues {
  kind: NoteKind | null;
  module: NoteModule | null;
  visibility: NoteVisibility | null;
  branch: string | null;
  search: string;
  includeArchived: boolean;
}

export interface NoteFilterHandlers {
  setKind: (v: NoteKind | null) => void;
  setModule: (v: NoteModule | null) => void;
  setVisibility: (v: NoteVisibility | null) => void;
  setBranch: (v: string | null) => void;
  setSearch: (v: string) => void;
  setIncludeArchived: (v: boolean) => void;
  reset: () => void;
}

// Kind buckets — segmented control across the top. Mirrors how Documents
// surfaces categories, but with Notes' kind taxonomy.
const KIND_BUCKETS: { id: NoteKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...NOTE_KIND_ORDER.map((k) => ({ id: k, label: NOTE_KIND_LABEL[k] })),
];

export function NoteFilterBar({
  values,
  handlers,
}: {
  values: NoteFilterValues;
  handlers: NoteFilterHandlers;
}) {
  const granularActive =
    values.module !== null ||
    values.visibility !== null ||
    values.branch !== null ||
    values.includeArchived ||
    values.search.trim() !== '';

  return (
    <FilterPanel
      active={granularActive}
      buckets={
        <BucketGroup
          buckets={KIND_BUCKETS}
          active={values.kind ?? 'all'}
          onSelect={(id) =>
            handlers.setKind(id === 'all' ? null : (id as NoteKind))
          }
        />
      }
      controls={
        <>
          <SearchField
            value={values.search}
            onChange={handlers.setSearch}
            placeholder="Search title or body…"
          />
          <select
            aria-label="Module"
            className={FILTER_SELECT_CLASS}
            value={values.module ?? ''}
            onChange={(e) =>
              handlers.setModule((e.target.value as NoteModule) || null)
            }
            data-testid="note-filter-module"
          >
            <option value="">All modules</option>
            {NOTE_MODULE_ORDER.map((m) => (
              <option key={m} value={m}>
                {NOTE_MODULE_LABEL[m]}
              </option>
            ))}
          </select>
          <select
            aria-label="Branch"
            className={FILTER_SELECT_CLASS}
            value={values.branch ?? ''}
            onChange={(e) => handlers.setBranch(e.target.value || null)}
            data-testid="note-filter-branch"
          >
            <option value="">All branches</option>
            {BRANCH_LIST.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Visibility"
            className={FILTER_SELECT_CLASS}
            value={values.visibility ?? ''}
            onChange={(e) =>
              handlers.setVisibility((e.target.value as NoteVisibility) || null)
            }
            data-testid="note-filter-visibility"
          >
            <option value="">Work + personal</option>
            <option value="work">Work only</option>
            <option value="personal">Personal only</option>
          </select>
          <label className="text-foreground-72 inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={values.includeArchived}
              onChange={(e) => handlers.setIncludeArchived(e.target.checked)}
              className="accent-primary h-3.5 w-3.5"
              data-testid="note-filter-archived"
            />
            Show archived
          </label>
          {granularActive && (
            <button
              type="button"
              onClick={handlers.reset}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              data-testid="note-filter-clear"
            >
              Clear
            </button>
          )}
        </>
      }
    />
  );
}
