// Deno-runtime copy of src/lib/timezone.ts.
//
// **SYNC-REQUIRED PAIR.** Keep this file in lockstep with
// `src/lib/timezone.ts`. Both ship the same `PROJECT_TZ` constant and
// `localMidnightUnix` algorithm so the client and the Edge Function
// agree on the boundary of "today". A drift between the two would
// cause an email to appear in one surface but not the other on a
// timezone-edge case.
//
// We duplicate rather than import because the Supabase CLI doesn't
// resolve repo-relative imports across the `supabase/functions/`
// tree out of the box, and pulling in a build step adds a fragility
// that's worse than ~50 lines of mirrored code.
//
// Unit tests for the algorithm live in `src/lib/timezone.test.ts`
// (vitest, Node runtime). Both runtimes implement Intl.DateTimeFormat
// with full ICU, so the algorithm transfers without behavioural
// change.

export const PROJECT_TZ = 'Africa/Maputo';

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

export function localMidnightUnix(
  date: Date = new Date(),
  tz: string = PROJECT_TZ,
): number {
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

  const naiveUtcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  let resultMs = naiveUtcMidnight - tzOffsetMs(new Date(naiveUtcMidnight), tz);

  const verifyMs = naiveUtcMidnight - tzOffsetMs(new Date(resultMs), tz);
  if (verifyMs !== resultMs) resultMs = verifyMs;

  return Math.floor(resultMs / 1000);
}
