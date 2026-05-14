// Unit tests for the HTML entity decoder used by gmail-list-today and
// gmail-list-important. The decoder lives next to the Edge Functions
// (Deno-side) but it's pure — vitest imports it directly via relative
// path so we don't duplicate the source.

import { describe, expect, it } from 'vitest';

import { decodeHtmlEntities } from '../../supabase/functions/_shared/html-decode';

describe('decodeHtmlEntities', () => {
  // ---- Named entities ------------------------------------------------
  it.each([
    ['&amp;',  '&'],
    ['&lt;',   '<'],
    ['&gt;',   '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
    // &nbsp; → U+00A0 (non-breaking space), NOT a regular space
    ['&nbsp;', ' '],
  ])('named %s → %s', (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  // ---- Numeric decimal references -----------------------------------
  it.each([
    ['&#39;',  "'"],   // apostrophe — the one Gmail uses most
    ['&#34;',  '"'],
    ['&#38;',  '&'],
    ['&#171;', '«'],
    ['&#187;', '»'],
    ['&#8217;', '’'],  // curly apostrophe
  ])('numeric decimal %s → %s', (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  // ---- Numeric hex references ---------------------------------------
  it.each([
    ['&#x27;', "'"],
    ['&#X27;', "'"],
    ['&#x2019;', '’'],
  ])('numeric hex %s → %s', (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  // ---- Embedded in text ---------------------------------------------
  it('decodes entities embedded in surrounding text', () => {
    expect(decodeHtmlEntities("Rabih can&#39;t reply")).toBe("Rabih can't reply");
    expect(decodeHtmlEntities('A &lt;tag&gt; here')).toBe('A <tag> here');
    expect(decodeHtmlEntities('Cats &amp; dogs')).toBe('Cats & dogs');
  });

  // ---- No-op on plain text ------------------------------------------
  it('leaves plain text unchanged', () => {
    expect(decodeHtmlEntities('plain text')).toBe('plain text');
    expect(decodeHtmlEntities('subject without entities')).toBe(
      'subject without entities',
    );
  });

  // ---- Edge cases ---------------------------------------------------
  it('returns empty string for null / undefined', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('does NOT double-decode (single-pass; matches HTML5 spec)', () => {
    // &amp;amp; should decode to &amp;, not &
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
    // &amp;#39; should decode to &#39;, not '
    expect(decodeHtmlEntities('&amp;#39;')).toBe('&#39;');
  });

  it('leaves unknown named entities intact', () => {
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
    expect(decodeHtmlEntities('A &foo; B')).toBe('A &foo; B');
  });

  it('leaves out-of-range numeric refs intact', () => {
    // 0x110000 is just past the Unicode max
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;');
  });

  it('handles a realistic Gmail subject with multiple entities', () => {
    const raw = 'Rabih, your &amp;ldquo;security profile&#39; has changed';
    // ldquo is not in our named table → left as-is. The other two
    // decode. Single-pass keeps the leading &amp; literal.
    expect(decodeHtmlEntities(raw)).toBe(
      'Rabih, your &ldquo;security profile\' has changed',
    );
  });
});
