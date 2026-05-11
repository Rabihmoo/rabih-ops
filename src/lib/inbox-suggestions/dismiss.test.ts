import { beforeEach, describe, expect, it } from 'vitest';
import {
  dismissSuggestion,
  isDismissed,
  loadDismissed,
  pruneStale,
  saveDismissed,
  DEFAULT_KEY,
} from './dismiss';

// In-memory Storage so tests don't touch real localStorage and don't
// require the jsdom environment.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe('loadDismissed', () => {
  it('returns {} for an empty store', () => {
    expect(loadDismissed({ storage })).toEqual({});
  });

  it('returns {} when JSON is malformed', () => {
    storage.setItem(DEFAULT_KEY, 'not json{');
    expect(loadDismissed({ storage })).toEqual({});
  });

  it('returns {} when value is not an object', () => {
    storage.setItem(DEFAULT_KEY, JSON.stringify(['a', 'b']));
    expect(loadDismissed({ storage })).toEqual({});
  });

  it('returns {} when storage is unavailable (SSR / test env)', () => {
    expect(loadDismissed({ storage: null })).toEqual({});
  });

  it('round-trips through saveDismissed', () => {
    const map = { 'task:t1:rule-x': '2026-05-11T10:00:00.000Z' };
    saveDismissed(map, { storage });
    expect(loadDismissed({ storage })).toEqual(map);
  });
});

describe('dismissSuggestion', () => {
  it('adds the id with the current ISO timestamp', () => {
    const now = new Date('2026-05-11T10:00:00.000Z');
    const map = dismissSuggestion('task:t1:rule-x', { storage, now });
    expect(map['task:t1:rule-x']).toBe('2026-05-11T10:00:00.000Z');
    expect(loadDismissed({ storage })).toEqual(map);
  });

  it('preserves earlier dismissals when adding a new one', () => {
    dismissSuggestion('a', { storage, now: new Date('2026-05-01T00:00:00Z') });
    dismissSuggestion('b', { storage, now: new Date('2026-05-02T00:00:00Z') });
    const m = loadDismissed({ storage });
    expect(Object.keys(m).sort()).toEqual(['a', 'b']);
  });

  it('prunes entries older than maxAgeDays when dismissing', () => {
    // Pre-seed an old entry.
    saveDismissed(
      { 'old-id': '2026-01-01T00:00:00.000Z', 'fresh-id': '2026-05-01T00:00:00.000Z' },
      { storage },
    );
    const now = new Date('2026-05-11T00:00:00.000Z');
    // Default 30-day window — old-id (>4 months) is dropped, fresh-id (10d) survives.
    const after = dismissSuggestion('new-id', { storage, now });
    expect(after).toHaveProperty('fresh-id');
    expect(after).toHaveProperty('new-id');
    expect(after).not.toHaveProperty('old-id');
  });
});

describe('isDismissed', () => {
  it('returns true only for ids present in the map', () => {
    const map = { 'a:b': '2026-05-11T10:00:00.000Z' };
    expect(isDismissed('a:b', map)).toBe(true);
    expect(isDismissed('a:c', map)).toBe(false);
  });
});

describe('pruneStale', () => {
  it('keeps entries newer than the cutoff and drops older ones', () => {
    const now = new Date('2026-05-11T00:00:00Z');
    const input = {
      keep1: '2026-05-10T00:00:00Z',
      keep2: '2026-04-20T00:00:00Z',
      drop1: '2026-03-01T00:00:00Z',
      drop2: '2025-12-31T00:00:00Z',
    };
    const out = pruneStale(input, { maxAgeDays: 30, now });
    expect(Object.keys(out).sort()).toEqual(['keep1', 'keep2']);
  });

  it('drops entries with unparseable timestamps', () => {
    const out = pruneStale({ good: '2026-05-10T00:00:00Z', bad: 'not-a-date' }, {
      now: new Date('2026-05-11T00:00:00Z'),
    });
    expect(out).toEqual({ good: '2026-05-10T00:00:00Z' });
  });
});
