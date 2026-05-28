import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_ORDER,
  sortSections,
  togglePin,
  validatePins,
  type DashboardSectionKey,
} from './dashboard-pins-pure';

// =====================================================================
// validatePins
// =====================================================================

describe('validatePins', () => {
  it('returns empty for non-array input', () => {
    expect(validatePins(null)).toEqual([]);
    expect(validatePins('overdue')).toEqual([]);
    expect(validatePins(42)).toEqual([]);
  });

  it('filters valid keys', () => {
    expect(validatePins(['overdue', 'today', 'invalid_key'])).toEqual([
      'overdue',
      'today',
    ]);
  });

  it('deduplicates', () => {
    expect(validatePins(['overdue', 'overdue', 'today'])).toEqual([
      'overdue',
      'today',
    ]);
  });

  it('returns empty for empty array', () => {
    expect(validatePins([])).toEqual([]);
  });

  it('strips non-string items', () => {
    expect(validatePins([123, null, 'overdue'])).toEqual(['overdue']);
  });
});

// =====================================================================
// togglePin
// =====================================================================

describe('togglePin', () => {
  it('adds a key when missing', () => {
    expect(togglePin([], 'overdue')).toEqual(['overdue']);
  });

  it('removes a key when present', () => {
    expect(togglePin(['overdue', 'today'], 'overdue')).toEqual(['today']);
  });

  it('preserves order of other keys when removing', () => {
    expect(togglePin(['overdue', 'today', 'waiting'], 'today')).toEqual([
      'overdue',
      'waiting',
    ]);
  });

  it('appends when adding', () => {
    expect(togglePin(['overdue'], 'today')).toEqual(['overdue', 'today']);
  });
});

// =====================================================================
// sortSections
// =====================================================================

describe('sortSections', () => {
  it('pinned sections come first, in pin order', () => {
    const sections: DashboardSectionKey[] = ['overdue', 'today', 'waiting', 'reminders'];
    const pins: DashboardSectionKey[] = ['waiting', 'today'];
    const sorted = sortSections(sections, pins);
    expect(sorted).toEqual(['waiting', 'today', 'reminders', 'overdue']);
  });

  it('unpinned sections follow DEFAULT_SECTION_ORDER', () => {
    const sections: DashboardSectionKey[] = ['today', 'overdue', 'reminders'];
    const sorted = sortSections(sections, []);
    // Default order: reminders, ..., overdue, today
    expect(sorted).toEqual(['reminders', 'overdue', 'today']);
  });

  it('handles empty sections', () => {
    expect(sortSections([], ['overdue'])).toEqual([]);
  });

  it('handles empty pins', () => {
    const sections: DashboardSectionKey[] = ['overdue', 'today'];
    expect(sortSections(sections, [])).toEqual(['overdue', 'today']);
  });

  it('ignores pinned keys not in sections', () => {
    const sections: DashboardSectionKey[] = ['overdue'];
    const pins: DashboardSectionKey[] = ['today', 'overdue'];
    expect(sortSections(sections, pins)).toEqual(['overdue']);
  });

  it('returns all DEFAULT_SECTION_ORDER keys when all sections provided', () => {
    const sorted = sortSections([...DEFAULT_SECTION_ORDER], []);
    expect(sorted).toEqual(DEFAULT_SECTION_ORDER);
  });
});
