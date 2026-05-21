// Pure helpers for Phase 3 — Global Search / Cmd-K.
//
// This file is intentionally side-effect-free except for localStorage
// access in loadRecents / saveRecents. The hook in chunk 3.2 wires
// useQueries to the 8 list RPCs, calls these adapters to normalize
// each row, and reads/writes recents on selection.
//
// Why structural adapter inputs and not the module-lib types:
//   Coupling global-search to TaskListItem, NoteListItem, etc. would
//   make every future module addition touch this file. The adapters
//   declare the minimum shape they need so the hook passes whatever
//   each rpc_list_* returns and the compiler enforces the contract
//   at the call site instead of here.

// =====================================================================
// Constants
// =====================================================================

/** Per-type cap requested from each rpc_list_*. Eight types × eight rows
 *  = 64 results max per keystroke, which keeps the palette scannable. */
export const PER_TYPE_LIMIT = 8;

/** LRU cap for recents stored in localStorage. */
export const RECENTS_LIMIT = 8;

/** Below this length, the palette shows recents only — no fan-out. */
export const MIN_FANOUT_CHARS = 2;

export const RECENTS_STORAGE_KEY = 'rabih-ops:cmd-k:recents';

// =====================================================================
// Types
// =====================================================================

export type SearchEntityType =
  | 'task'
  | 'follow_up'
  | 'note'
  | 'document'
  | 'purchase'
  | 'inspection'
  | 'company'
  | 'contact';

export interface SearchResultRow {
  id: string;
  type: SearchEntityType;
  title: string;
  /** Null when the entity has no single branch (contacts, personal
   *  notes, companies attached to zero branches). The UI elides the
   *  branch chip in that case rather than rendering "—". */
  branch: string | null;
  updated_at: string;
  /** Pre-resolved navigation target so the consumer doesn't repeat the
   *  type → route mapping. */
  href: string;
}

/** Result of parsing the raw input string. V1 carries `text` only.
 *  Kept as a struct so V2 operators (`status:overdue`, `branch:salt`)
 *  can extend it without touching adapter / hook signatures. */
export interface ParsedQuery {
  text: string;
}

// =====================================================================
// Query parsing + fan-out gate
// =====================================================================

/** Trims surrounding whitespace but preserves internal spacing so
 *  multi-word queries like "gas cylinder" survive intact. Does not
 *  lowercase — each rpc_list_* already does case-insensitive ILIKE. */
export function parseQuery(input: string): ParsedQuery {
  return { text: input.trim() };
}

/** True iff the parsed text is long enough to warrant fanning out to
 *  all eight list RPCs. Single letters return too much noise; the
 *  palette shows recents instead. */
export function shouldFanOut(parsed: ParsedQuery): boolean {
  return parsed.text.length >= MIN_FANOUT_CHARS;
}

// =====================================================================
// Adapters — minimal structural input per type
// =====================================================================

interface CommonRow {
  id: string;
  branch?: string | null;
  updated_at: string;
}

export function taskToResultRow(row: CommonRow & { title: string }): SearchResultRow {
  return {
    id: row.id,
    type: 'task',
    title: row.title,
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/tasks/${row.id}`,
  };
}

export function followUpToResultRow(row: CommonRow & { title: string }): SearchResultRow {
  return {
    id: row.id,
    type: 'follow_up',
    title: row.title,
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/follow-ups/${row.id}`,
  };
}

export function noteToResultRow(row: CommonRow & { title: string }): SearchResultRow {
  return {
    id: row.id,
    type: 'note',
    title: row.title,
    // Notes can legitimately have a null branch (personal notes).
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/notes/${row.id}`,
  };
}

export function documentToResultRow(row: CommonRow & { title: string }): SearchResultRow {
  return {
    id: row.id,
    type: 'document',
    title: row.title,
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/documents/${row.id}`,
  };
}

export function purchaseToResultRow(row: CommonRow & { title: string }): SearchResultRow {
  return {
    id: row.id,
    type: 'purchase',
    title: row.title,
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/purchases/${row.id}`,
  };
}

/** Inspections have an `area` field rather than a `title`. We project
 *  area → title for palette display; the inspection detail page
 *  itself uses area in the header so the operator sees the same string. */
export function inspectionToResultRow(
  row: CommonRow & { area: string },
): SearchResultRow {
  return {
    id: row.id,
    type: 'inspection',
    title: row.area,
    branch: row.branch ?? null,
    updated_at: row.updated_at,
    href: `/inspections/${row.id}`,
  };
}

/** Companies return `name` not `title`, and the list RPC joins a
 *  `branches: string[]` array. First branch wins for the chip; an
 *  empty array drops the chip via the null branch convention. */
export function companyToResultRow(
  row: Omit<CommonRow, 'branch'> & { name: string; branches?: string[] | null },
): SearchResultRow {
  const branches = row.branches ?? [];
  return {
    id: row.id,
    type: 'company',
    title: row.name,
    branch: branches.length > 0 ? branches[0] : null,
    updated_at: row.updated_at,
    href: `/companies/${row.id}`,
  };
}

/** Contacts return `full_name` not `title`, and the list does not
 *  surface a single branch. The chip is intentionally elided. */
export function contactToResultRow(
  row: Omit<CommonRow, 'branch'> & { full_name: string },
): SearchResultRow {
  return {
    id: row.id,
    type: 'contact',
    title: row.full_name,
    branch: null,
    updated_at: row.updated_at,
    href: `/contacts/${row.id}`,
  };
}

// =====================================================================
// Recents — LRU stored in localStorage
// =====================================================================

function isSearchResultRow(value: unknown): value is SearchResultRow {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    (v.branch === null || typeof v.branch === 'string') &&
    typeof v.updated_at === 'string' &&
    typeof v.href === 'string'
  );
}

/** Reads recents from localStorage. Corrupt JSON, non-array values,
 *  and rows that fail the shape guard are all treated as "no recents"
 *  — returns [] without throwing. SSR-safe via the typeof window
 *  check; the build doesn't SSR today, but the guard costs nothing. */
export function loadRecents(
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): SearchResultRow[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSearchResultRow).slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

/** Persists the recents array. Silently no-ops if storage is
 *  unavailable (private-mode browsers throw on setItem). */
export function saveRecents(
  rows: SearchResultRow[],
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(rows.slice(0, RECENTS_LIMIT)));
  } catch {
    // localStorage quota exceeded / private mode / disabled — swallow.
  }
}

/** Pure function — given the current recents and a newly-selected
 *  row, returns the next array with the row prepended, the previous
 *  entry for the same (type, id) removed, and the cap applied.
 *
 *  Does NOT touch localStorage. Caller persists via saveRecents()
 *  so tests can drive this in isolation. */
export function pushRecent(
  current: SearchResultRow[],
  row: SearchResultRow,
): SearchResultRow[] {
  const key = `${row.type}:${row.id}`;
  const filtered = current.filter((r) => `${r.type}:${r.id}` !== key);
  return [row, ...filtered].slice(0, RECENTS_LIMIT);
}
