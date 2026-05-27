import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MIN_FANOUT_CHARS,
  PER_TYPE_LIMIT,
  RECENTS_LIMIT,
  RECENTS_STORAGE_KEY,
  companyToResultRow,
  contactToResultRow,
  cycleIndex,
  documentToResultRow,
  entityTypeLabel,
  followUpToResultRow,
  relativeTime,
  inspectionToResultRow,
  loadRecents,
  noteToResultRow,
  parseQuery,
  purchaseToResultRow,
  pushRecent,
  saveRecents,
  shouldFanOut,
  taskToResultRow,
  type SearchResultRow,
} from './global-search';

// In-memory Storage shim so tests don't depend on jsdom's actual
// localStorage and don't leak between cases.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  } as Storage;
}

function makeRow(over: Partial<SearchResultRow> = {}): SearchResultRow {
  return {
    id: over.id ?? '00000000-0000-0000-0000-000000000001',
    type: over.type ?? 'task',
    title: over.title ?? 'Sample',
    branch: over.branch ?? 'salt',
    updated_at: over.updated_at ?? '2026-05-21T12:00:00Z',
    href: over.href ?? '/tasks/00000000-0000-0000-0000-000000000001',
  };
}

// =====================================================================
// parseQuery
// =====================================================================

describe('parseQuery', () => {
  it('returns empty text for empty input', () => {
    expect(parseQuery('')).toEqual({ text: '' });
  });

  it('returns empty text for whitespace-only input', () => {
    expect(parseQuery('   \t  \n ')).toEqual({ text: '' });
  });

  it('trims surrounding whitespace but preserves internal spaces', () => {
    expect(parseQuery('  gas cylinder  ')).toEqual({ text: 'gas cylinder' });
  });

  it('preserves case — RPCs handle case-insensitive matching', () => {
    expect(parseQuery('SALT branch')).toEqual({ text: 'SALT branch' });
  });

  it('passes through unicode', () => {
    expect(parseQuery('café')).toEqual({ text: 'café' });
  });
});

// =====================================================================
// shouldFanOut
// =====================================================================

describe('shouldFanOut', () => {
  it('is false for empty', () => {
    expect(shouldFanOut({ text: '' })).toBe(false);
  });

  it('is false for one char (single letter is too noisy)', () => {
    expect(shouldFanOut({ text: 'a' })).toBe(false);
  });

  it(`is true at the ${MIN_FANOUT_CHARS}-char threshold`, () => {
    expect(shouldFanOut({ text: 'a'.repeat(MIN_FANOUT_CHARS) })).toBe(true);
  });

  it('is true for longer input', () => {
    expect(shouldFanOut({ text: 'gas' })).toBe(true);
  });
});

// =====================================================================
// Constants — fail-loud if anyone bumps them by accident
// =====================================================================

describe('constants', () => {
  it('PER_TYPE_LIMIT is 8 (≤ 64 total)', () => {
    expect(PER_TYPE_LIMIT).toBe(8);
  });

  it('RECENTS_LIMIT is 8', () => {
    expect(RECENTS_LIMIT).toBe(8);
  });

  it('MIN_FANOUT_CHARS is 2', () => {
    expect(MIN_FANOUT_CHARS).toBe(2);
  });
});

// =====================================================================
// Adapters
// =====================================================================

describe('adapters — happy paths', () => {
  it('task → href /tasks/:id, preserves branch', () => {
    const out = taskToResultRow({
      id: 't1',
      title: 'Stock check',
      branch: 'salt',
      updated_at: '2026-05-20T10:00:00Z',
    });
    expect(out).toEqual({
      id: 't1',
      type: 'task',
      title: 'Stock check',
      branch: 'salt',
      updated_at: '2026-05-20T10:00:00Z',
      href: '/tasks/t1',
    });
  });

  it('follow_up → href /follow-ups/:id', () => {
    const out = followUpToResultRow({
      id: 'fu1',
      title: 'Chase Acme',
      branch: 'bbqhouse',
      updated_at: '2026-05-19T10:00:00Z',
    });
    expect(out.type).toBe('follow_up');
    expect(out.href).toBe('/follow-ups/fu1');
  });

  it('document → href /documents/:id', () => {
    expect(
      documentToResultRow({
        id: 'd1',
        title: 'Lease 2026',
        branch: 'salt',
        updated_at: '2026-05-18T10:00:00Z',
      }).href,
    ).toBe('/documents/d1');
  });

  it('purchase → href /purchases/:id', () => {
    expect(
      purchaseToResultRow({
        id: 'pr1',
        title: 'Frozen lamb',
        branch: 'centralkitchen',
        updated_at: '2026-05-17T10:00:00Z',
      }).href,
    ).toBe('/purchases/pr1');
  });

  it('inspection → projects area into title, href /inspections/:id', () => {
    const out = inspectionToResultRow({
      id: 'i1',
      area: 'Walk-in freezer',
      branch: 'salt',
      updated_at: '2026-05-16T10:00:00Z',
    });
    expect(out.title).toBe('Walk-in freezer');
    expect(out.href).toBe('/inspections/i1');
  });
});

describe('adapters — note branch nullability', () => {
  it('note with branch carries it through', () => {
    expect(
      noteToResultRow({
        id: 'n1',
        title: 'Q2 plan',
        branch: 'salt',
        updated_at: '2026-05-15T10:00:00Z',
      }).branch,
    ).toBe('salt');
  });

  it('note without branch (personal) is null', () => {
    expect(
      noteToResultRow({
        id: 'n2',
        title: 'Idea',
        branch: null,
        updated_at: '2026-05-15T10:00:00Z',
      }).branch,
    ).toBeNull();
  });
});

describe('adapters — company / contact special projections', () => {
  it('company: name → title, branches[0] → branch chip', () => {
    const out = companyToResultRow({
      id: 'c1',
      name: 'Acme Foods',
      branches: ['salt', 'bbqhouse'],
      updated_at: '2026-05-14T10:00:00Z',
    });
    expect(out.type).toBe('company');
    expect(out.title).toBe('Acme Foods');
    expect(out.branch).toBe('salt');
    expect(out.href).toBe('/companies/c1');
  });

  it('company with no branches → branch is null', () => {
    expect(
      companyToResultRow({
        id: 'c2',
        name: 'Lone Co',
        branches: [],
        updated_at: '2026-05-14T10:00:00Z',
      }).branch,
    ).toBeNull();
  });

  it('company with omitted branches → branch is null (defensive)', () => {
    expect(
      companyToResultRow({
        id: 'c3',
        name: 'Quiet Co',
        updated_at: '2026-05-14T10:00:00Z',
      }).branch,
    ).toBeNull();
  });

  it('contact: full_name → title, branch always null', () => {
    const out = contactToResultRow({
      id: 'p1',
      full_name: 'Jane Doe',
      updated_at: '2026-05-13T10:00:00Z',
    });
    expect(out.type).toBe('contact');
    expect(out.title).toBe('Jane Doe');
    expect(out.branch).toBeNull();
    expect(out.href).toBe('/contacts/p1');
  });
});

// =====================================================================
// Recents — LRU
// =====================================================================

describe('recents — load', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns [] when storage is empty', () => {
    expect(loadRecents(storage)).toEqual([]);
  });

  it('returns [] for corrupt JSON', () => {
    storage.setItem(RECENTS_STORAGE_KEY, '}}}{not json');
    expect(loadRecents(storage)).toEqual([]);
  });

  it('returns [] when stored value is not an array', () => {
    storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify({ rows: [] }));
    expect(loadRecents(storage)).toEqual([]);
  });

  it('filters out entries that fail the shape guard', () => {
    const good = makeRow({ id: 'good' });
    const bad = { id: 42 }; // missing fields + wrong types
    storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify([good, bad]));
    const out = loadRecents(storage);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('good');
  });

  it('caps loaded rows at RECENTS_LIMIT even if storage holds more', () => {
    const rows = Array.from({ length: RECENTS_LIMIT + 5 }, (_, i) =>
      makeRow({ id: `r${i}` }),
    );
    storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(rows));
    expect(loadRecents(storage)).toHaveLength(RECENTS_LIMIT);
  });

  it('returns [] when storage is undefined (SSR-safe)', () => {
    expect(loadRecents(undefined)).toEqual([]);
  });
});

describe('recents — save', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('round-trips through load', () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
    saveRecents(rows, storage);
    expect(loadRecents(storage)).toEqual(rows);
  });

  it('caps written rows at RECENTS_LIMIT', () => {
    const rows = Array.from({ length: RECENTS_LIMIT + 3 }, (_, i) =>
      makeRow({ id: `r${i}` }),
    );
    saveRecents(rows, storage);
    const written = storage.getItem(RECENTS_STORAGE_KEY);
    expect(written).toBeTruthy();
    const parsed = JSON.parse(written!) as unknown[];
    expect(parsed).toHaveLength(RECENTS_LIMIT);
  });

  it('no-ops when storage is undefined (SSR-safe)', () => {
    expect(() => saveRecents([makeRow()], undefined)).not.toThrow();
  });

  it('swallows quota-exceeded errors without throwing', () => {
    const throwingStorage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;
    expect(() => saveRecents([makeRow()], throwingStorage)).not.toThrow();
  });
});

describe('recents — pushRecent (pure)', () => {
  it('prepends a new entry to an empty list', () => {
    const row = makeRow({ id: 'new' });
    expect(pushRecent([], row)).toEqual([row]);
  });

  it('prepends a new entry to the front of an existing list', () => {
    const a = makeRow({ id: 'a' });
    const b = makeRow({ id: 'b' });
    const c = makeRow({ id: 'c' });
    expect(pushRecent([a, b], c)).toEqual([c, a, b]);
  });

  it('dedupes by (type, id) — re-selecting an existing row moves it to front', () => {
    const a = makeRow({ id: 'a', type: 'task' });
    const b = makeRow({ id: 'b', type: 'note' });
    const c = makeRow({ id: 'c', type: 'document' });
    // Re-push `a` — should be removed from its current position and
    // re-added to the front.
    expect(pushRecent([a, b, c], a)).toEqual([a, b, c]);
  });

  it('does NOT dedupe across types — same id under a different type is distinct', () => {
    const aTask = makeRow({ id: 'shared', type: 'task' });
    const aNote = makeRow({ id: 'shared', type: 'note' });
    const out = pushRecent([aTask], aNote);
    expect(out).toEqual([aNote, aTask]);
  });

  it('drops the oldest entry once cap is reached', () => {
    const initial = Array.from({ length: RECENTS_LIMIT }, (_, i) =>
      makeRow({ id: `r${i}` }),
    );
    const fresh = makeRow({ id: 'newest' });
    const out = pushRecent(initial, fresh);
    expect(out).toHaveLength(RECENTS_LIMIT);
    expect(out[0]).toEqual(fresh);
    expect(out.find((r) => r.id === `r${RECENTS_LIMIT - 1}`)).toBeUndefined();
  });

  it('returns a new array — does not mutate the input', () => {
    const a = makeRow({ id: 'a' });
    const b = makeRow({ id: 'b' });
    const input = [a, b];
    const out = pushRecent(input, makeRow({ id: 'c' }));
    expect(input).toEqual([a, b]);
    expect(out).not.toBe(input);
  });
});

describe('recents — selection round-trip via storage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it('reading after pushRecent + saveRecents reflects the LRU order', () => {
    const a = makeRow({ id: 'a' });
    const b = makeRow({ id: 'b' });
    saveRecents(pushRecent([], a), storage);
    saveRecents(pushRecent(loadRecents(storage), b), storage);
    expect(loadRecents(storage)).toEqual([b, a]);
  });
});

// =====================================================================
// cycleIndex
// =====================================================================

describe('cycleIndex', () => {
  it('returns -1 for empty list', () => {
    expect(cycleIndex(0, 1, 0)).toBe(-1);
  });

  it('moves forward', () => {
    expect(cycleIndex(0, 1, 5)).toBe(1);
    expect(cycleIndex(3, 1, 5)).toBe(4);
  });

  it('wraps forward', () => {
    expect(cycleIndex(4, 1, 5)).toBe(0);
  });

  it('moves backward', () => {
    expect(cycleIndex(3, -1, 5)).toBe(2);
  });

  it('wraps backward', () => {
    expect(cycleIndex(0, -1, 5)).toBe(4);
  });
});

// =====================================================================
// entityTypeLabel
// =====================================================================

describe('entityTypeLabel', () => {
  it('returns human labels', () => {
    expect(entityTypeLabel('task')).toBe('Task');
    expect(entityTypeLabel('follow_up')).toBe('Follow-up');
    expect(entityTypeLabel('company')).toBe('Company');
  });
});

// =====================================================================
// relativeTime
// =====================================================================

describe('relativeTime', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('returns "just now" for < 60s', () => {
    expect(relativeTime('2026-06-15T11:59:30Z', now)).toBe('just now');
  });

  it('returns minutes', () => {
    expect(relativeTime('2026-06-15T11:55:00Z', now)).toBe('5m ago');
  });

  it('returns hours', () => {
    expect(relativeTime('2026-06-15T09:00:00Z', now)).toBe('3h ago');
  });

  it('returns days', () => {
    expect(relativeTime('2026-06-13T12:00:00Z', now)).toBe('2d ago');
  });

  it('returns short date for > 7 days', () => {
    expect(relativeTime('2026-06-01T12:00:00Z', now)).toBe('Jun 1');
  });

  it('treats future timestamps as "just now"', () => {
    expect(relativeTime('2026-06-16T00:00:00Z', now)).toBe('just now');
  });
});
