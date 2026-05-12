import { describe, expect, it } from 'vitest';

import { PROJECT_TZ, localMidnightUnix } from './timezone';

// ---------------------------------------------------------------------
// PROJECT_TZ constant
// ---------------------------------------------------------------------

describe('PROJECT_TZ', () => {
  it('is Africa/Maputo (project anchor)', () => {
    expect(PROJECT_TZ).toBe('Africa/Maputo');
  });
});

// ---------------------------------------------------------------------
// localMidnightUnix — Africa/Maputo (UTC+2, no DST)
//   All instants below fall within the same Maputo calendar day
//   (2026-05-12), so they must collapse to the same midnight.
// ---------------------------------------------------------------------

describe('localMidnightUnix in Africa/Maputo', () => {
  const expectedMidnightUtc =
    Date.UTC(2026, 4, 11, 22, 0, 0) / 1000; // 2026-05-12 00:00 Maputo

  it.each([
    ['2026-05-11T22:00:00Z', '2026-05-12 00:00 local'],
    ['2026-05-12T00:00:00Z', '2026-05-12 02:00 local'],
    ['2026-05-12T12:00:00Z', '2026-05-12 14:00 local'],
    ['2026-05-12T21:59:00Z', '2026-05-12 23:59 local'],
  ])('collapses %s (%s) to the same local midnight', (iso) => {
    expect(localMidnightUnix(new Date(iso), 'Africa/Maputo')).toBe(
      expectedMidnightUtc,
    );
  });

  it('handles the cross-year boundary', () => {
    // 2025-12-31T23:30:00Z is 2026-01-01 01:30 Maputo.
    // Local midnight of that day = 2026-01-01 00:00 Maputo = 2025-12-31 22:00 UTC.
    const input = new Date('2025-12-31T23:30:00Z');
    const expected = Date.UTC(2025, 11, 31, 22, 0, 0) / 1000;
    expect(localMidnightUnix(input, 'Africa/Maputo')).toBe(expected);
  });

  it('defaults tz to PROJECT_TZ when not supplied', () => {
    const input = new Date('2026-05-12T12:00:00Z');
    expect(localMidnightUnix(input)).toBe(
      localMidnightUnix(input, 'Africa/Maputo'),
    );
  });

  it('defaults date to now when not supplied', () => {
    // Result is the most recent local midnight; must be ≤ now and
    // within the past 26 hours (24h + 2h offset slack).
    const before = Math.floor(Date.now() / 1000);
    const result = localMidnightUnix();
    const after = Math.floor(Date.now() / 1000);
    expect(result).toBeLessThanOrEqual(after);
    expect(result).toBeGreaterThan(before - 26 * 3600);
  });
});

// ---------------------------------------------------------------------
// localMidnightUnix — DST-observing zone (America/New_York)
//   Confirms the helper generalizes past the no-DST happy path. We
//   never resolve "today" in this zone in production, but the test
//   guards against regressions if PROJECT_TZ ever moves.
// ---------------------------------------------------------------------

describe('localMidnightUnix in America/New_York (DST zone)', () => {
  it('winter: 2026-01-15 EST is UTC-5', () => {
    // 2026-01-15T12:00:00Z is 07:00 EST. Local midnight = 05:00 UTC.
    const input = new Date('2026-01-15T12:00:00Z');
    const expected = Date.UTC(2026, 0, 15, 5, 0, 0) / 1000;
    expect(localMidnightUnix(input, 'America/New_York')).toBe(expected);
  });

  it('summer: 2026-07-15 EDT is UTC-4', () => {
    // 2026-07-15T12:00:00Z is 08:00 EDT. Local midnight = 04:00 UTC.
    const input = new Date('2026-07-15T12:00:00Z');
    const expected = Date.UTC(2026, 6, 15, 4, 0, 0) / 1000;
    expect(localMidnightUnix(input, 'America/New_York')).toBe(expected);
  });

  it('spring-forward day (DST starts): local midnight is in EST', () => {
    // 2026-03-08 is the second Sunday of March — DST begins at 02:00 EST.
    // Local midnight 2026-03-08 = 00:00 EST = 05:00 UTC.
    const input = new Date('2026-03-08T15:00:00Z'); // 11:00 EDT (after transition)
    const expected = Date.UTC(2026, 2, 8, 5, 0, 0) / 1000;
    expect(localMidnightUnix(input, 'America/New_York')).toBe(expected);
  });

  it('fall-back day (DST ends): local midnight is in EDT', () => {
    // 2026-11-01 is the first Sunday of November — DST ends at 02:00 EDT.
    // Local midnight 2026-11-01 = 00:00 EDT = 04:00 UTC.
    const input = new Date('2026-11-01T15:00:00Z'); // 10:00 EST (after transition)
    const expected = Date.UTC(2026, 10, 1, 4, 0, 0) / 1000;
    expect(localMidnightUnix(input, 'America/New_York')).toBe(expected);
  });
});

// ---------------------------------------------------------------------
// Sanity: returned unix is consistent with Intl re-formatting.
//   If we feed result*1000 back through Intl in the same zone, we
//   should read 00:00:00 on the expected local date.
// ---------------------------------------------------------------------

describe('localMidnightUnix round-trip', () => {
  it.each(['Africa/Maputo', 'America/New_York', 'Asia/Tokyo'])(
    'returns an instant that formats as 00:00:00 in %s',
    (tz) => {
      const result = localMidnightUnix(new Date('2026-05-12T12:00:00Z'), tz);
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(result * 1000));
      expect(formatted).toMatch(/00:00:00$/);
    },
  );
});
