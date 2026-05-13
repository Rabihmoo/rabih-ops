import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import { StatusChip } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useLinkRecordInternal, useRecordRelations } from '@/hooks/useRecordLinks';
import { listTasks, TASK_STATUS_LABEL } from '@/lib/tasks';
import { listFollowUps } from '@/lib/follow-ups';
import { listPurchaseRequests } from '@/lib/purchase-requests';
import { listInspections } from '@/lib/inspections';
import { listDocuments } from '@/lib/documents';
import { listCompanies, COMPANY_CATEGORY_LABEL } from '@/lib/companies';
import { listContacts } from '@/lib/contacts';
import { listNotes } from '@/lib/notes';
import type {
  RecordLinkEntityType,
  RecordLinkRelationship,
} from '@/lib/record-links';

// =============================================================
// Phase H4.4 — RecordLinkDialog
// =============================================================
// Local, self-contained dialog for creating an internal record_link
// from the entity whose detail page mounts it. Five relationship
// verbs in V1 (relates_to / follow_up_for / caused_by / blocks /
// resolves); all eight whitelisted entity types are linkable to.
//
// Deliberately NOT a generic app-wide Dialog primitive — see the
// H4.4 design discussion. We mirror MobileDrawer's no-library
// a11y idioms (Escape, backdrop click, body scroll lock, auto
// focus). If a second consumer arrives, we can lift the modal
// shell into a small primitive then.

interface PickerRow {
  id: string;
  title: string;
  secondary: string | null;
}

type LoaderFn = (search: string) => Promise<PickerRow[]>;

const PICKER_LIMIT = 20;

// Per-type result loaders. Each wraps the existing list RPC and
// projects to the picker's row shape — RLS is enforced server-side
// already, so anything that comes back is a candidate the user can
// actually link to.
const LOADERS: Record<RecordLinkEntityType, LoaderFn> = {
  task: async (search) => {
    const rows = await listTasks({
      search: search || null,
      limit: PICKER_LIMIT,
      includeDone: false,
      includeArchived: false,
      includeTemplates: false,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      secondary: `${r.branch} · ${TASK_STATUS_LABEL[r.status as keyof typeof TASK_STATUS_LABEL] ?? r.status}`,
    }));
  },
  follow_up: async (search) => {
    const rows = await listFollowUps({
      search: search || null,
      limit: PICKER_LIMIT,
      includeDone: false,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      secondary: `${r.branch ?? 'cross-branch'} · ${r.status}`,
    }));
  },
  purchase_request: async (search) => {
    const rows = await listPurchaseRequests({
      search: search || null,
      limit: PICKER_LIMIT,
      includeDone: false,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      secondary: `${r.branch} · ${r.status}`,
    }));
  },
  inspection: async (search) => {
    const rows = await listInspections({
      search: search || null,
      limit: PICKER_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      title: `${r.area} (${r.inspection_date})`,
      secondary: `${r.branch} · ${r.result}`,
    }));
  },
  document: async (search) => {
    const rows = await listDocuments({
      search: search || null,
      limit: PICKER_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      secondary: `${r.category} · ${r.visibility}`,
    }));
  },
  company: async (search) => {
    const rows = await listCompanies({
      search: search || null,
      limit: PICKER_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.name,
      secondary:
        COMPANY_CATEGORY_LABEL[
          r.category as keyof typeof COMPANY_CATEGORY_LABEL
        ] ?? r.category,
    }));
  },
  contact: async (search) => {
    const rows = await listContacts({
      search: search || null,
      limit: PICKER_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.full_name,
      secondary: r.role || r.company?.name || r.email || null,
    }));
  },
  note: async (search) => {
    const rows = await listNotes({
      search: search || null,
      limit: PICKER_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title?.trim() || '(untitled note)',
      secondary: `${r.kind} · ${r.module}`,
    }));
  },
};

const ENTITY_TYPES: { value: RecordLinkEntityType; label: string }[] = [
  { value: 'task',             label: 'Task' },
  { value: 'follow_up',        label: 'Follow-up' },
  { value: 'purchase_request', label: 'Purchase' },
  { value: 'inspection',       label: 'Inspection' },
  { value: 'document',         label: 'Document' },
  { value: 'company',          label: 'Company' },
  { value: 'contact',          label: 'Contact' },
  { value: 'note',             label: 'Note' },
];

// V1: only the five generic verbs. The 9 domain-specific verbs
// (email_for, document_for, calendar_for, note_for, supplier_for,
// contractor_for, staff_for, decision_for, attachment_for) are
// reserved for the modules that own them.
const RELATIONSHIPS: { value: RecordLinkRelationship; label: string }[] = [
  { value: 'relates_to',    label: 'Relates to' },
  { value: 'follow_up_for', label: 'Follow up for' },
  { value: 'caused_by',     label: 'Caused by' },
  { value: 'blocks',        label: 'Blocks' },
  { value: 'resolves',      label: 'Resolves' },
];

// Default target type when the dialog opens. Tasks are by far the
// most common link target across the app.
const DEFAULT_TARGET_TYPE: RecordLinkEntityType = 'task';

interface RecordLinkDialogProps {
  open: boolean;
  onClose: () => void;
  fromType: RecordLinkEntityType;
  fromId: string;
}

export function RecordLinkDialog({
  open,
  onClose,
  fromType,
  fromId,
}: RecordLinkDialogProps) {
  const [targetType, setTargetType] =
    useState<RecordLinkEntityType>(DEFAULT_TARGET_TYPE);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relationship, setRelationship] =
    useState<RecordLinkRelationship>('relates_to');

  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const link = useLinkRecordInternal();

  // Existing relations from the parent's cache. Used to mark targets
  // that already have a link to this entity ("Linked" pill). The RPC
  // is idempotent so this is informational only — re-linking the
  // same (from, to, relationship) returns the existing row.
  const { data: existingRelations } = useRecordRelations(fromType, fromId);
  const existingKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of existingRelations ?? []) {
      if (r.source_table === 'record_link' && r.to_entity_type && r.to_entity_id) {
        s.add(`${r.to_entity_type}:${r.to_entity_id}`);
      }
    }
    return s;
  }, [existingRelations]);

  // Reset internal state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTargetType(DEFAULT_TARGET_TYPE);
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedId(null);
    setRelationship('relates_to');
  }, [open]);

  // Debounce the search input (~200ms) into debouncedSearch, which
  // is what the query key actually reads. Cheap, no library.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [searchInput, open]);

  // Reset selection when the target type changes — a selectedId
  // from the old type won't match the new candidate set. We do NOT
  // reset on debouncedSearch changes: that would race with a fast
  // pick → confirm flow (debounce fires after the row click and
  // would null out selectedId mid-confirm). The selectedRow useMemo
  // below auto-deselects the row if it falls out of the result set.
  useEffect(() => {
    setSelectedId(null);
  }, [targetType]);

  // Escape closes; body scroll lock; auto-focus the close button on
  // open. Same idiom as MobileDrawer.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const resultsQuery = useQuery({
    queryKey: ['record-link-picker', targetType, debouncedSearch],
    queryFn: () => LOADERS[targetType](debouncedSearch),
    enabled: open,
    staleTime: 15_000,
  });

  // Drop self-row from the candidate set (the RPC also rejects it,
  // but this avoids displaying a target the user can't actually link
  // to).
  const candidates = useMemo(() => {
    const rows = resultsQuery.data ?? [];
    if (targetType !== fromType) return rows;
    return rows.filter((r) => r.id !== fromId);
  }, [resultsQuery.data, targetType, fromType, fromId]);

  const selectedRow = useMemo(
    () => candidates.find((r) => r.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  async function handleConfirm() {
    if (!selectedRow) return;
    try {
      await link.mutateAsync({
        fromType,
        fromId,
        toType: targetType,
        toId: selectedRow.id,
        relationship,
      });
      toast({ title: 'Linked' });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not link',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop — z-[70] places the dialog above the toaster
          viewport (z-[60]) so a lingering "Linked" toast can't
          intercept clicks on the dialog's bottom-right action bar
          on mobile, where they share the same screen region. */}
      <div
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
        data-testid="record-link-backdrop"
      />

      {/* Panel — full-screen on mobile, centered overlay on sm+ */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link a record"
        data-testid="record-link-dialog"
        className={cn(
          'bg-card text-foreground fixed z-[70] flex flex-col',
          // Mobile full-screen
          'inset-0',
          // Desktop centered overlay
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-border sm:shadow-2xl',
        )}
      >
        {/* Header */}
        <div className="border-border flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Link2 className="h-4 w-4" aria-hidden />
            Link a record
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-72 hover:bg-surface-3 hover:text-foreground focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            data-testid="record-link-close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Type + search row */}
          <div className="space-y-2">
            <Label htmlFor="record-link-type">Type</Label>
            <select
              id="record-link-type"
              data-testid="record-link-type"
              value={targetType}
              onChange={(e) =>
                setTargetType(e.target.value as RecordLinkEntityType)
              }
              className="bg-surface-1 border-border text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="record-link-search">Search</Label>
            <SearchInput
              id="record-link-search"
              data-testid="record-link-search"
              ref={searchRef}
              placeholder="Type to search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Results */}
          <div className="space-y-1.5">
            <div className="text-section-label">Results</div>
            <ul
              data-testid="record-link-results"
              className="border-border bg-surface-1 max-h-64 overflow-y-auto rounded-md border"
            >
              {resultsQuery.isLoading && (
                <li className="text-muted-foreground p-3 text-xs">
                  <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
                  Loading…
                </li>
              )}
              {resultsQuery.error && !resultsQuery.isLoading && (
                <li
                  className="text-destructive-ink p-3 text-xs"
                  data-testid="record-link-results-error"
                >
                  Could not load: {(resultsQuery.error as Error).message}
                </li>
              )}
              {!resultsQuery.isLoading &&
                !resultsQuery.error &&
                candidates.length === 0 && (
                  <li
                    className="text-muted-foreground p-3 text-xs"
                    data-testid="record-link-results-empty"
                  >
                    No matches.
                  </li>
                )}
              {!resultsQuery.isLoading &&
                !resultsQuery.error &&
                candidates.map((row) => {
                  const isSelected = row.id === selectedId;
                  const isAlreadyLinked = existingKeys.has(
                    `${targetType}:${row.id}`,
                  );
                  return (
                    <li
                      key={row.id}
                      data-testid="record-link-result"
                      data-id={row.id}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          'hover:bg-surface-2 flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                          isSelected && 'bg-primary-soft',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground truncate text-sm">
                            {row.title}
                          </div>
                          {row.secondary && (
                            <div className="text-subtle-foreground truncate text-xs">
                              {row.secondary}
                            </div>
                          )}
                        </div>
                        {isAlreadyLinked && (
                          <StatusChip tone="muted" size="xs">
                            Linked
                          </StatusChip>
                        )}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>

          {/* Relationship */}
          <div className="space-y-2">
            <Label htmlFor="record-link-relationship">Relationship</Label>
            <select
              id="record-link-relationship"
              data-testid="record-link-relationship"
              value={relationship}
              onChange={(e) =>
                setRelationship(e.target.value as RecordLinkRelationship)
              }
              className="bg-surface-1 border-border text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer / sticky action bar */}
        <div className="border-border flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="record-link-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedRow || link.isPending}
            onClick={() => void handleConfirm()}
            data-testid="record-link-confirm"
          >
            {link.isPending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Linking…
              </>
            ) : (
              'Link'
            )}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
