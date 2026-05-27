import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import {
  PER_TYPE_LIMIT,
  parseQuery,
  shouldFanOut,
  loadRecents,
  saveRecents,
  pushRecent,
  taskToResultRow,
  followUpToResultRow,
  noteToResultRow,
  documentToResultRow,
  purchaseToResultRow,
  inspectionToResultRow,
  companyToResultRow,
  contactToResultRow,
} from '@/lib/global-search';
import type { SearchResultRow, SearchEntityType } from '@/lib/global-search';

import { listTasks } from '@/lib/tasks';
import { listFollowUps } from '@/lib/follow-ups';
import { listNotes } from '@/lib/notes';
import { listDocuments } from '@/lib/documents';
import { listPurchaseRequests } from '@/lib/purchase-requests';
import { listInspections } from '@/lib/inspections';
import { listCompanies } from '@/lib/companies';
import { listContacts } from '@/lib/contacts';

// =====================================================================
// Debounce helper (local — mirrors RecordLinkDialog pattern)
// =====================================================================

const DEBOUNCE_MS = 150;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// =====================================================================
// Fan-out descriptor — one entry per SearchEntityType
// =====================================================================

interface FanoutEntry {
  type: SearchEntityType;
  fn: (search: string) => Promise<SearchResultRow[]>;
}

const FANOUT: FanoutEntry[] = [
  {
    type: 'task',
    fn: (s) =>
      listTasks({ search: s, limit: PER_TYPE_LIMIT, includeDone: false, includeArchived: false, includeTemplates: false })
        .then((rows) => rows.map(taskToResultRow)),
  },
  {
    type: 'follow_up',
    fn: (s) =>
      listFollowUps({ search: s, limit: PER_TYPE_LIMIT, includeDone: false })
        .then((rows) => rows.map(followUpToResultRow)),
  },
  {
    type: 'note',
    fn: (s) =>
      listNotes({ search: s, limit: PER_TYPE_LIMIT })
        .then((rows) => rows.map((r) => noteToResultRow({ ...r, title: r.title ?? '(untitled)' }))),
  },
  {
    type: 'document',
    fn: (s) =>
      listDocuments({ search: s, limit: PER_TYPE_LIMIT })
        .then((rows) => rows.map(documentToResultRow)),
  },
  {
    type: 'purchase',
    fn: (s) =>
      listPurchaseRequests({ search: s, limit: PER_TYPE_LIMIT, includeDone: false })
        .then((rows) => rows.map(purchaseToResultRow)),
  },
  {
    type: 'inspection',
    fn: (s) =>
      listInspections({ search: s, limit: PER_TYPE_LIMIT })
        .then((rows) => rows.map(inspectionToResultRow)),
  },
  {
    type: 'company',
    fn: (s) =>
      listCompanies({ search: s, limit: PER_TYPE_LIMIT })
        .then((rows) => rows.map(companyToResultRow)),
  },
  {
    type: 'contact',
    fn: (s) =>
      listContacts({ search: s, limit: PER_TYPE_LIMIT })
        .then((rows) => rows.map(contactToResultRow)),
  },
];

// =====================================================================
// Hook
// =====================================================================

export interface UseGlobalSearchReturn {
  results: SearchResultRow[];
  isLoading: boolean;
  isError: boolean;
  recents: SearchResultRow[];
  isShowingRecents: boolean;
  selectResult: (row: SearchResultRow) => void;
}

export function useGlobalSearch(rawInput: string): UseGlobalSearchReturn {
  const debouncedText = useDebouncedValue(rawInput, DEBOUNCE_MS);
  const parsed = parseQuery(debouncedText);
  const fanOut = shouldFanOut(parsed);

  const [recents, setRecents] = useState<SearchResultRow[]>(() => loadRecents());

  const queries = useQueries({
    queries: FANOUT.map((desc) => ({
      queryKey: ['global-search', desc.type, parsed.text] as const,
      queryFn: () => desc.fn(parsed.text),
      enabled: fanOut,
      meta: { persist: false },
      staleTime: 30_000,
    })),
  });

  const results = useMemo(() => {
    if (!fanOut) return [];
    const merged: SearchResultRow[] = [];
    for (const q of queries) {
      if (q.data) merged.push(...q.data);
    }
    merged.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return merged;
  }, [fanOut, queries]);

  const isLoading = fanOut && queries.some((q) => q.isLoading);
  const isError = fanOut && queries.some((q) => q.isError);

  const selectResult = useCallback((row: SearchResultRow) => {
    setRecents((prev) => {
      const next = pushRecent(prev, row);
      saveRecents(next);
      return next;
    });
  }, []);

  return {
    results,
    isLoading,
    isError,
    recents,
    isShowingRecents: !fanOut,
    selectResult,
  };
}
