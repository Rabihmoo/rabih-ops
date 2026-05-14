// Pure HTML-entity decoder for the small subset Gmail surfaces in
// message metadata (subjects, From display names, and snippet text).
// Used by gmail-list-today and gmail-list-important to render clean
// text on the client.
//
// Single-pass — `&amp;amp;` decodes to `&amp;`, not `&`, matching
// HTML5 spec behaviour and avoiding accidental over-decoding of
// content that legitimately contains an encoded ampersand.
//
// No DOM. Works under Deno (Edge Functions) and Node (vitest).
// Pure regex + lookup table.

const NAMED_ENTITIES: Record<string, string> = {
  amp:   '&',
  lt:    '<',
  gt:    '>',
  quot:  '"',
  apos:  "'",
  nbsp:  ' ',
};

/**
 * Replace HTML entity references with their character equivalents.
 * Handles:
 *   - named entities listed in NAMED_ENTITIES above
 *   - numeric decimal references (&#39;) → fromCharCode(39)
 *   - numeric hex references (&#x27; or &#X27;) → fromCharCode(0x27)
 * Unknown entities are left intact (defensive: better to show the
 * raw `&foo;` than misdecode).
 */
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (input == null) return '';
  return input.replace(
    /&(#[xX]([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z]+));/g,
    (match, _all, hex, dec, name) => {
      if (hex)  return safeFromCodePoint(parseInt(hex, 16), match);
      if (dec)  return safeFromCodePoint(parseInt(dec, 10), match);
      if (name) {
        const v = NAMED_ENTITIES[name];
        return v !== undefined ? v : match;
      }
      return match;
    },
  );
}

function safeFromCodePoint(cp: number, fallback: string): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF) return fallback;
  try {
    return String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}
