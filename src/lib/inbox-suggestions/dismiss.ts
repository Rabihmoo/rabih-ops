// Local persistence of dismissed suggestion IDs.
//
// We keep this in localStorage rather than the database for a few reasons:
//   1. Dismissals are UI noise reduction, not a business event — there's
//      nothing on the server to audit or replay.
//   2. localStorage is per-device, which matches the per-device nature of
//      "I read this on my laptop already." Cross-device dismissal is a
//      Phase G3 feature if usage demands it.
//   3. Zero new server surface.
//
// Storage shape:
//   key   = DEFAULT_KEY
//   value = JSON object mapping suggestion id -> ISO timestamp when dismissed.
//
// Entries are pruned to <= STALE_AFTER_DAYS days on every load so the
// localStorage payload stays tiny even after months of triage.

export const DEFAULT_KEY = 'inbox-suggestion-dismissed';
export const STALE_AFTER_DAYS = 30;

export interface DismissedMap {
  [suggestionId: string]: string; // ISO timestamp
}

// Soft accessor — returns null in SSR / test environments without window.
function getDefaultStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* localStorage can throw on some privacy modes */
  }
  return null;
}

export interface DismissStoreOptions {
  storage?: Storage | null;
  key?: string;
  now?: Date;
  maxAgeDays?: number;
}

export function loadDismissed(opts: DismissStoreOptions = {}): DismissedMap {
  const storage = opts.storage === undefined ? getDefaultStorage() : opts.storage;
  if (!storage) return {};
  const key = opts.key ?? DEFAULT_KEY;
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as DismissedMap;
  } catch {
    return {};
  }
}

export function saveDismissed(
  map: DismissedMap,
  opts: DismissStoreOptions = {},
): void {
  const storage = opts.storage === undefined ? getDefaultStorage() : opts.storage;
  if (!storage) return;
  const key = opts.key ?? DEFAULT_KEY;
  try {
    storage.setItem(key, JSON.stringify(map));
  } catch {
    /* full disk, private mode, etc — silent */
  }
}

export function dismissSuggestion(
  id: string,
  opts: DismissStoreOptions = {},
): DismissedMap {
  const now = opts.now ?? new Date();
  const map = pruneStale(loadDismissed(opts), opts);
  map[id] = now.toISOString();
  saveDismissed(map, opts);
  return map;
}

export function isDismissed(id: string, map: DismissedMap): boolean {
  return Object.prototype.hasOwnProperty.call(map, id);
}

export function pruneStale(
  map: DismissedMap,
  opts: DismissStoreOptions = {},
): DismissedMap {
  const max = opts.maxAgeDays ?? STALE_AFTER_DAYS;
  const now = (opts.now ?? new Date()).getTime();
  const cutoff = now - max * 24 * 60 * 60 * 1000;
  const out: DismissedMap = {};
  for (const [id, iso] of Object.entries(map)) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t >= cutoff) {
      out[id] = iso;
    }
  }
  return out;
}
