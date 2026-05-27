import { describe, expect, it } from 'vitest';

import {
  ENTITY_PATH,
  RELATION_GROUP_ORDER,
  groupRelations,
  parseExternalUrl,
  relationGroupKey,
  relationHref,
  relationLabel,
  type RecordRelation,
} from './record-relations';

// ---------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------

function row(overrides: Partial<RecordRelation>): RecordRelation {
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
    created_at: '2026-05-12T20:00:00Z',
    created_by: '00000000-0000-0000-0000-000000000000',
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// relationGroupKey — every source_table × entity_type combination
// ---------------------------------------------------------------------

describe('relationGroupKey', () => {
  it('email_link rows → emails', () => {
    expect(relationGroupKey(row({ source_table: 'email_link' }))).toBe('emails');
  });

  it('calendar_event_link rows → calendar', () => {
    expect(relationGroupKey(row({ source_table: 'calendar_event_link' }))).toBe('calendar');
  });

  it('document_link rows → documents', () => {
    expect(relationGroupKey(row({ source_table: 'document_link' }))).toBe('documents');
  });

  it('record_link external gmail → emails (folded back into the natural category)', () => {
    expect(
      relationGroupKey(
        row({ external_app: 'gmail', external_record_id: 'abc' }),
      ),
    ).toBe('emails');
  });

  it('record_link external calendar → calendar', () => {
    expect(
      relationGroupKey(
        row({ external_app: 'calendar', external_record_id: 'evt-1' }),
      ),
    ).toBe('calendar');
  });

  it('record_link external drive → external', () => {
    expect(
      relationGroupKey(
        row({ external_app: 'drive', external_record_id: 'd-1' }),
      ),
    ).toBe('external');
  });

  it('record_link external url → external', () => {
    expect(
      relationGroupKey(
        row({ external_app: 'url', external_record_id: 'https://example.com' }),
      ),
    ).toBe('external');
  });

  it.each([
    ['task', 'tasks'],
    ['follow_up', 'follow_ups'],
    ['purchase_request', 'purchases'],
    ['inspection', 'inspections'],
    ['document', 'documents'],
    ['company', 'companies'],
    ['contact', 'contacts'],
    ['note', 'notes'],
  ] as const)('internal record_link to %s → %s group', (to, group) => {
    expect(
      relationGroupKey(row({ to_entity_type: to, to_entity_id: 'x' })),
    ).toBe(group);
  });

  it('inbound direction does not affect grouping (group reflects the OTHER side, which the RPC normalises to to_entity_*)', () => {
    expect(
      relationGroupKey(
        row({ direction: 'inbound', to_entity_type: 'task', to_entity_id: 'x' }),
      ),
    ).toBe('tasks');
  });
});

// ---------------------------------------------------------------------
// groupRelations — ordering, emptiness suppression, within-group sort
// ---------------------------------------------------------------------

describe('groupRelations', () => {
  it('respects RELATION_GROUP_ORDER', () => {
    const out = groupRelations([
      row({ to_entity_type: 'task', to_entity_id: 't', link_id: 1 }),
      row({ source_table: 'email_link', link_id: 2 }),
      row({ to_entity_type: 'note', to_entity_id: 'n', link_id: 3 }),
    ]);
    expect(out.map((g) => g.key)).toEqual(['emails', 'notes', 'tasks']);
    // Spot-check that the order matches the declared canonical order.
    const idxEmail = RELATION_GROUP_ORDER.indexOf('emails');
    const idxNote  = RELATION_GROUP_ORDER.indexOf('notes');
    const idxTask  = RELATION_GROUP_ORDER.indexOf('tasks');
    expect(idxEmail).toBeLessThan(idxNote);
    expect(idxNote).toBeLessThan(idxTask);
  });

  it('omits empty groups (no zero-row cards in the UI)', () => {
    const out = groupRelations([
      row({ source_table: 'email_link', link_id: 1 }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].key).toBe('emails');
  });

  it('returns empty array on empty input', () => {
    expect(groupRelations([])).toEqual([]);
  });

  it('sorts within a group by created_at descending (newest first)', () => {
    const older = row({
      to_entity_type: 'task',
      to_entity_id: 'old',
      link_id: 1,
      created_at: '2026-05-10T00:00:00Z',
    });
    const newer = row({
      to_entity_type: 'task',
      to_entity_id: 'new',
      link_id: 2,
      created_at: '2026-05-12T00:00:00Z',
    });
    const out = groupRelations([older, newer]);
    expect(out[0].rows.map((r) => r.link_id)).toEqual([2, 1]);
  });

  it('attaches label + icon metadata to every group', () => {
    const out = groupRelations([
      row({ source_table: 'email_link', link_id: 1 }),
      row({ to_entity_type: 'company', to_entity_id: 'c', link_id: 2 }),
    ]);
    for (const g of out) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(typeof g.icon).toBe('object'); // lucide icons are components/objects
    }
  });
});

// ---------------------------------------------------------------------
// relationHref / relationLabel
// ---------------------------------------------------------------------

describe('relationHref', () => {
  it('prefers external_url for external rows', () => {
    expect(
      relationHref(
        row({
          external_app: 'drive',
          external_url: 'https://drive.google.com/file/d/abc/view',
          external_record_id: 'abc',
        }),
      ),
    ).toBe('https://drive.google.com/file/d/abc/view');
  });

  it('builds an internal route for internal rows', () => {
    expect(
      relationHref(
        row({ to_entity_type: 'note', to_entity_id: 'n-123' }),
      ),
    ).toBe('/notes/n-123');
  });

  it('returns null when both target sides are missing', () => {
    expect(relationHref(row({}))).toBeNull();
  });

  it('uses the H3.2 /notes path for note targets', () => {
    expect(ENTITY_PATH.note).toBe('/notes');
  });

  it.each([
    ['task', '/tasks'],
    ['follow_up', '/follow-ups'],
    ['purchase_request', '/purchases'],
    ['inspection', '/inspections'],
    ['document', '/documents'],
    ['company', '/companies'],
    ['contact', '/contacts'],
    ['note', '/notes'],
  ] as const)('ENTITY_PATH[%s] = %s', (type, path) => {
    expect(ENTITY_PATH[type]).toBe(path);
  });
});

describe('relationLabel', () => {
  it('uses external_label first', () => {
    expect(
      relationLabel(
        row({
          external_label: 'Smoke spreadsheet',
          external_snapshot: { subject: 'fallback' },
        }),
      ),
    ).toBe('Smoke spreadsheet');
  });

  it('falls back to snapshot.subject (gmail)', () => {
    expect(
      relationLabel(
        row({ external_snapshot: { subject: 'Re: invoice 042' } }),
      ),
    ).toBe('Re: invoice 042');
  });

  it('falls back to snapshot.title (calendar/document snapshots)', () => {
    expect(
      relationLabel(row({ external_snapshot: { title: 'Q3 OKR review' } })),
    ).toBe('Q3 OKR review');
  });

  it('falls back to external_record_id when nothing better is set', () => {
    expect(
      relationLabel(row({ external_record_id: 'hex-msg-id-9001' })),
    ).toBe('hex-msg-id-9001');
  });

  it('returns "(missing)" when nothing is set', () => {
    expect(relationLabel(row({}))).toBe('(missing)');
  });

  it('treats whitespace-only label as empty and falls through', () => {
    expect(
      relationLabel(
        row({
          external_label: '   ',
          external_snapshot: { subject: 'real subject' },
        }),
      ),
    ).toBe('real subject');
  });
});

// ---------------------------------------------------------------------
// parseExternalUrl — every supported shape + the fallback
// ---------------------------------------------------------------------

describe('parseExternalUrl — Gmail', () => {
  it('parses inbox URL', () => {
    const r = parseExternalUrl(
      'https://mail.google.com/mail/u/0/#inbox/FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq',
    );
    expect(r?.app).toBe('gmail');
    expect(r?.recordType).toBe('message');
    expect(r?.recordId).toBe('FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq');
  });

  it('parses #all URL', () => {
    const r = parseExternalUrl(
      'https://mail.google.com/mail/u/0/#all/FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq',
    );
    expect(r?.app).toBe('gmail');
  });

  it('parses a search-result URL (id is the last segment)', () => {
    const r = parseExternalUrl(
      'https://mail.google.com/mail/u/0/#search/from%3Asupplier/FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq',
    );
    expect(r?.app).toBe('gmail');
    expect(r?.recordId).toBe('FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq');
  });
});

describe('parseExternalUrl — Calendar', () => {
  it('parses ?eid= query-string form', () => {
    const r = parseExternalUrl(
      'https://calendar.google.com/calendar/event?eid=YWJjZGVmZ2hpag',
    );
    expect(r?.app).toBe('calendar');
    expect(r?.recordType).toBe('event');
    expect(r?.recordId).toBe('YWJjZGVmZ2hpag');
  });

  it('parses /r/eventedit/ path form', () => {
    const r = parseExternalUrl(
      'https://calendar.google.com/calendar/u/0/r/eventedit/YWJjZGVmZ2hpag',
    );
    expect(r?.app).toBe('calendar');
    expect(r?.recordId).toBe('YWJjZGVmZ2hpag');
  });
});

describe('parseExternalUrl — Drive', () => {
  it('parses file URL', () => {
    const r = parseExternalUrl(
      'https://drive.google.com/file/d/1A2B3C4D5E6F7G/view',
    );
    expect(r?.app).toBe('drive');
    expect(r?.recordType).toBe('file');
    expect(r?.recordId).toBe('1A2B3C4D5E6F7G');
  });

  it('parses Google Doc URL (docs.google.com/document)', () => {
    const r = parseExternalUrl(
      'https://docs.google.com/document/d/1A2B3C4D5E6F7G/edit',
    );
    expect(r?.app).toBe('drive');
    expect(r?.recordId).toBe('1A2B3C4D5E6F7G');
  });

  it('parses Drive folder URL', () => {
    const r = parseExternalUrl(
      'https://drive.google.com/drive/folders/1A2B3C4D5E6F7G',
    );
    expect(r?.app).toBe('drive');
    expect(r?.recordType).toBe('folder');
    expect(r?.recordId).toBe('1A2B3C4D5E6F7G');
  });
});

describe('parseExternalUrl — generic / fallback', () => {
  it('falls back to url-app for any other valid URL', () => {
    const r = parseExternalUrl('https://example.com/path?q=1');
    expect(r?.app).toBe('url');
    expect(r?.recordType).toBeNull();
    expect(r?.recordId).toBe('https://example.com/path?q=1');
  });

  it('returns null for an unparseable string', () => {
    expect(parseExternalUrl('not a url at all')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseExternalUrl('')).toBeNull();
    expect(parseExternalUrl('   ')).toBeNull();
  });

  it('trims surrounding whitespace before parsing', () => {
    const r = parseExternalUrl(
      '  https://mail.google.com/mail/u/0/#inbox/FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq  ',
    );
    expect(r?.app).toBe('gmail');
  });
});
