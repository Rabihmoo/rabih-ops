import { describe, expect, it } from 'vitest';
import { toCsv } from './csv-export';

describe('toCsv', () => {
  it('generates header + data rows', () => {
    const csv = toCsv(['name', 'count'], [
      { name: 'Alice', count: 5 },
      { name: 'Bob', count: 3 },
    ]);
    // BOM + header + 2 rows
    expect(csv).toContain('name,count');
    expect(csv).toContain('Alice,5');
    expect(csv).toContain('Bob,3');
  });

  it('starts with BOM', () => {
    const csv = toCsv(['a'], []);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('quotes fields with commas', () => {
    const csv = toCsv(['desc'], [{ desc: 'a,b' }]);
    expect(csv).toContain('"a,b"');
  });

  it('quotes fields with double quotes and escapes them', () => {
    const csv = toCsv(['desc'], [{ desc: 'say "hello"' }]);
    expect(csv).toContain('"say ""hello"""');
  });

  it('quotes fields with newlines', () => {
    const csv = toCsv(['desc'], [{ desc: 'line1\nline2' }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('handles null/undefined values as empty', () => {
    const csv = toCsv(['a', 'b'], [{ a: null, b: undefined }]);
    expect(csv).toContain(',');
  });

  it('returns only BOM + header for empty rows', () => {
    const csv = toCsv(['a'], []);
    expect(csv).toBe('\uFEFFa');
  });

  it('uses CRLF line endings', () => {
    const csv = toCsv(['a'], [{ a: 1 }, { a: 2 }]);
    expect(csv).toContain('\r\n');
  });
});
