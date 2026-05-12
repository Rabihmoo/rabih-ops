/**
 * Project-wide timezone anchor + helpers.
 *
 * All "today" / "local day" computations in Rabih Ops resolve through
 * PROJECT_TZ so that the Telegram daily summary (08:00 PROJECT_TZ), the
 * Gmail "today" view, and any future scheduled work agree on what day
 * it is.
 *
 * Why Africa/Maputo and not Africa/Johannesburg: those IANA zones share
 * the same offset today (UTC+2, no DST), but the project's existing
 * telegram-tick fan-out and audit-log timestamps are already anchored
 * at Africa/Maputo. Keeping one zone constant avoids the silent split-
 * brain that would occur the day either zone adopts DST or we ship to
 * a second region.
 */
export const PROJECT_TZ = 'Africa/Maputo';

/**
 * Returns the offset (in milliseconds) such that:
 *   localTime = utcTime + offset
 * for the given IANA zone at the given instant. Positive for zones
 * east of UTC.
 *
 * Implemented via Intl.DateTimeFormat — works in browsers, Node ≥ 18,
 * and Deno (Edge Function runtime).
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, number>>(
    (acc, p) => {
      if (p.type !== 'literal') acc[p.type] = Number(p.value);
      return acc;
    },
    {},
  );
  const asUtcOfLocal = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtcOfLocal - date.getTime();
}

/**
 * Unix timestamp (seconds) of the start of the local day containing
 * `date` in the given IANA zone.
 *
 * Example: localMidnightUnix(new Date('2026-05-12T12:00:00Z'),
 * 'Africa/Maputo') returns the unix timestamp for 2026-05-12 00:00:00
 * in Maputo (= 2026-05-11 22:00:00 UTC), regardless of when the
 * caller is executing.
 *
 * Defaults: `date` = now, `tz` = PROJECT_TZ.
 *
 * Handles DST transitions by doing one verification pass — if the
 * first-guess instant lands in a different DST period than the local
 * day requires, recompute with the corrected offset.
 */
export function localMidnightUnix(
  date: Date = new Date(),
  tz: string = PROJECT_TZ,
): number {
  // Step 1: read the year/month/day in the target zone.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  const [y, m, d] = ymd;

  // Step 2: treat that calendar date's midnight as a UTC instant, then
  //   subtract the zone offset to get the real UTC instant.
  const naiveUtcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  let resultMs = naiveUtcMidnight - tzOffsetMs(new Date(naiveUtcMidnight), tz);

  // Step 3: verification pass for DST edges. If our first guess lands
  //   in a different DST period than the local midnight should fall
  //   in, recompute. Idempotent for non-DST zones (Africa/Maputo).
  const verifyMs = naiveUtcMidnight - tzOffsetMs(new Date(resultMs), tz);
  if (verifyMs !== resultMs) resultMs = verifyMs;

  return Math.floor(resultMs / 1000);
}
