// CSV export helper — RFC 4180 compliant with BOM for Excel.
// Pure, env-free, vitest-safe.

/** Escape a field per RFC 4180: quote if it contains comma, newline, or double-quote. */
function escapeField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Convert headers + rows to a CSV string with BOM prefix for Excel. */
export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const bom = '\uFEFF';
  const headerLine = headers.map(escapeField).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeField(row[h])).join(','),
  );
  return bom + [headerLine, ...dataLines].join('\r\n');
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
