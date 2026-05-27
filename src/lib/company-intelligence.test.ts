import { describe, expect, it } from 'vitest';
import type { RecordRelation } from './record-relations';
import {
  computeLastContacted,
  countOpenIssues,
  filterByType,
  filterIssueHistory,
  filterOpen,
  isOpenStatus,
  recentTouches,
  totalTouchCount,
  typeCounts,
} from './company-intelligence';

// Minimal mock — only fields the helpers inspect.
function row(overrides: Partial<RecordRelation> = {}): RecordRelation {
  return {
    source_table: 'record_link',
    link_id: 1,
    direction: 'outbound',
    relationship: 'relates_to',
    to_entity_type: null,
    to_entity_id: null,
    to_entity_title: null,
    to_entity_status: null,
    external_app: null,
    external_record_type: null,
    external_record_id: null,
    external_url: null,
    external_label: null,
    external_snapshot: {},
    created_at: '2026-06-01T12:00:00Z',
    created_by: '00000000-0000-0000-0000-000000000000',
    ...overrides,
  };
}

// =====================================================================
// isOpenStatus
// =====================================================================

describe('isOpenStatus', () => {
  it('returns false when to_entity_status is null', () => {
    expect(isOpenStatus(row())).toBe(false);
  });

  it('returns true for an open task', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'task', to_entity_status: 'todo' })),
    ).toBe(true);
    expect(
      isOpenStatus(row({ to_entity_type: 'task', to_entity_status: 'in_progress' })),
    ).toBe(true);
  });

  it('returns false for a done task', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'task', to_entity_status: 'done' })),
    ).toBe(false);
  });

  it('returns false for a cancelled follow-up', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'follow_up', to_entity_status: 'cancelled' })),
    ).toBe(false);
  });

  it('returns true for a pending follow-up', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'follow_up', to_entity_status: 'pending' })),
    ).toBe(true);
  });

  it('handles purchase_request statuses', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'purchase_request', to_entity_status: 'ordered' })),
    ).toBe(true);
    expect(
      isOpenStatus(row({ to_entity_type: 'purchase_request', to_entity_status: 'fully_received' })),
    ).toBe(false);
  });

  it('handles inspection result', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'inspection', to_entity_status: 'issues_found' })),
    ).toBe(true);
    expect(
      isOpenStatus(row({ to_entity_type: 'inspection', to_entity_status: 'pass' })),
    ).toBe(false);
  });

  it('handles document status', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'document', to_entity_status: 'active' })),
    ).toBe(true);
    expect(
      isOpenStatus(row({ to_entity_type: 'document', to_entity_status: 'archived' })),
    ).toBe(false);
  });

  it('returns false for unknown entity types', () => {
    expect(
      isOpenStatus(row({ to_entity_type: 'company', to_entity_status: null })),
    ).toBe(false);
  });
});

// =====================================================================
// filterByType
// =====================================================================

describe('filterByType', () => {
  it('returns only matching rows', () => {
    const rows = [
      row({ to_entity_type: 'task' }),
      row({ to_entity_type: 'follow_up' }),
      row({ to_entity_type: 'task' }),
    ];
    expect(filterByType(rows, 'task')).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    expect(filterByType([row({ to_entity_type: 'task' })], 'contact')).toHaveLength(0);
  });
});

// =====================================================================
// filterOpen
// =====================================================================

describe('filterOpen', () => {
  it('returns only open rows', () => {
    const rows = [
      row({ to_entity_type: 'task', to_entity_status: 'todo' }),
      row({ to_entity_type: 'task', to_entity_status: 'done' }),
      row({ to_entity_type: 'follow_up', to_entity_status: 'pending' }),
    ];
    expect(filterOpen(rows)).toHaveLength(2);
  });
});

// =====================================================================
// filterIssueHistory
// =====================================================================

describe('filterIssueHistory', () => {
  it('returns only inspections and follow-ups', () => {
    const rows = [
      row({ to_entity_type: 'task' }),
      row({ to_entity_type: 'inspection' }),
      row({ to_entity_type: 'follow_up' }),
      row({ to_entity_type: 'purchase_request' }),
    ];
    expect(filterIssueHistory(rows)).toHaveLength(2);
  });
});

// =====================================================================
// typeCounts
// =====================================================================

describe('typeCounts', () => {
  it('counts by type', () => {
    const rows = [
      row({ to_entity_type: 'task' }),
      row({ to_entity_type: 'task' }),
      row({ to_entity_type: 'follow_up' }),
      row({ to_entity_type: null }), // external
    ];
    expect(typeCounts(rows)).toEqual({
      task: 2,
      follow_up: 1,
      _external: 1,
    });
  });

  it('returns empty object for empty input', () => {
    expect(typeCounts([])).toEqual({});
  });
});

// =====================================================================
// countOpenIssues
// =====================================================================

describe('countOpenIssues', () => {
  it('counts open inspections + follow-ups', () => {
    const rows = [
      row({ to_entity_type: 'inspection', to_entity_status: 'issues_found' }),
      row({ to_entity_type: 'inspection', to_entity_status: 'pass' }),
      row({ to_entity_type: 'follow_up', to_entity_status: 'pending' }),
      row({ to_entity_type: 'follow_up', to_entity_status: 'done' }),
      row({ to_entity_type: 'task', to_entity_status: 'todo' }), // not an issue type
    ];
    expect(countOpenIssues(rows)).toBe(2);
  });

  it('returns 0 for empty input', () => {
    expect(countOpenIssues([])).toBe(0);
  });
});

// =====================================================================
// computeLastContacted
// =====================================================================

describe('computeLastContacted', () => {
  it('returns null for empty array', () => {
    expect(computeLastContacted([])).toBeNull();
  });

  it('returns the most recent created_at', () => {
    const rows = [
      row({ created_at: '2026-06-01T12:00:00Z' }),
      row({ created_at: '2026-06-10T12:00:00Z' }),
      row({ created_at: '2026-06-05T12:00:00Z' }),
    ];
    expect(computeLastContacted(rows)).toBe('2026-06-10T12:00:00Z');
  });

  it('works with a single row', () => {
    expect(computeLastContacted([row({ created_at: '2026-01-01T00:00:00Z' })])).toBe(
      '2026-01-01T00:00:00Z',
    );
  });
});

// =====================================================================
// recentTouches
// =====================================================================

describe('recentTouches', () => {
  it('returns up to N most recent', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({ created_at: `2026-06-${String(i + 1).padStart(2, '0')}T12:00:00Z` }),
    );
    const recent = recentTouches(rows, 5);
    expect(recent).toHaveLength(5);
    expect(recent[0].created_at).toBe('2026-06-30T12:00:00Z');
    expect(recent[4].created_at).toBe('2026-06-26T12:00:00Z');
  });

  it('returns all if fewer than N', () => {
    expect(recentTouches([row()], 10)).toHaveLength(1);
  });

  it('does not mutate input', () => {
    const rows = [
      row({ created_at: '2026-06-01T12:00:00Z' }),
      row({ created_at: '2026-06-10T12:00:00Z' }),
    ];
    const copy = [...rows];
    recentTouches(rows, 1);
    expect(rows).toEqual(copy);
  });
});

// =====================================================================
// totalTouchCount
// =====================================================================

describe('totalTouchCount', () => {
  it('returns length', () => {
    expect(totalTouchCount([row(), row(), row()])).toBe(3);
  });

  it('returns 0 for empty', () => {
    expect(totalTouchCount([])).toBe(0);
  });
});
