import {
  Briefcase,
  Building2,
  Calendar,
  ClipboardCheck,
  FileText,
  ListChecks,
  Mail,
  NotebookPen,
  PhoneCall,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';
// This module is intentionally PURE — it does not import the Supabase
// client. That keeps it usable from vitest without the runtime env
// vars required by src/lib/supabase.ts. The matching RPC wrapper
// (listRecordRelations) lives in src/lib/record-links.ts. We use
// `import type` (statement form, not inline) so vitest's transformer
// fully erases the import at runtime — `import { type X } from ...`
// only erases at TS-compile time and rollup/vitest can still load
// the source module for its side-effects.
import type {
  RecordLinkEntityType,
  RecordLinkExternalApp,
  RecordLinkRelationship,
} from './record-links';

// =========================================================
// Wire shape — rpc_record_relations row
// =========================================================
//
// Mirrors the projection inside rpc_record_relations
// (supabase/migrations/20260525_record_links.sql).
//   * source_table is the originating table.
//   * direction = 'outbound' (this entity is the source) or 'inbound'
//     (this entity is the target).
//   * to_entity_type / to_entity_id describe the OTHER side of the
//     relation regardless of direction — the RPC normalises the
//     inbound case by swapping from↔to so the caller always sees
//     "the thing this entity relates to".
//   * external_* fields are populated when the relation points to an
//     external system (email_link, calendar_event_link, or a
//     record_link with external_app set).

export type RecordRelationSourceTable =
  | 'record_link'
  | 'email_link'
  | 'document_link'
  | 'calendar_event_link';

export type RecordRelationDirection = 'outbound' | 'inbound';

export interface RecordRelation {
  source_table: RecordRelationSourceTable;
  link_id: number;
  direction: RecordRelationDirection;
  relationship: RecordLinkRelationship;
  to_entity_type: RecordLinkEntityType | null;
  to_entity_id: string | null;
  // Title of the OTHER side resolved by the SQL projection. Populated
  // for INTERNAL record_link arms (outbound + inbound — server swaps
  // from↔to before projecting). External + email_link + document_link
  // + calendar_event_link rows leave this NULL because their authoritative
  // label already lives in external_label (subject / event title / doc
  // title) — see rpc_record_relations comment for the rationale.
  //
  // Naming convention by entity table:
  //   * task / follow_up / purchase_request / document → title
  //   * inspection (no title column)                  → area + ' · ' + date
  //   * company                                       → name
  //   * contact                                       → full_name
  //   * note                                          → coalesce(title,
  //                                                     first-80-of-body,
  //                                                     'Untitled note')
  to_entity_title: string | null;
  // Status / result of the linked entity. Populated for task (status),
  // follow_up (status), purchase_request (status), inspection (result),
  // document (status). NULL for external arms, notes, companies, contacts.
  to_entity_status: string | null;
  external_app: RecordLinkExternalApp | null;
  external_record_type: string | null;
  external_record_id: string | null;
  external_url: string | null;
  external_label: string | null;
  external_snapshot: Record<string, unknown>;
  created_at: string;
  created_by: string;
}

// =========================================================
// Grouping
// =========================================================

export type RelationGroupKey =
  | 'emails'
  | 'calendar'
  | 'documents'
  | 'notes'
  | 'tasks'
  | 'follow_ups'
  | 'purchases'
  | 'inspections'
  | 'companies'
  | 'contacts'
  | 'external';

export interface RelationGroup {
  key: RelationGroupKey;
  label: string;
  icon: LucideIcon;
  rows: RecordRelation[];
}

// Stable display order — matches the H4 design spec §4.4.
export const RELATION_GROUP_ORDER: RelationGroupKey[] = [
  'emails',
  'calendar',
  'documents',
  'notes',
  'tasks',
  'follow_ups',
  'purchases',
  'inspections',
  'companies',
  'contacts',
  'external',
];

const GROUP_META: Record<RelationGroupKey, { label: string; icon: LucideIcon }> = {
  emails:      { label: 'Emails',       icon: Mail            },
  calendar:    { label: 'Calendar',     icon: Calendar        },
  documents:   { label: 'Documents',    icon: FileText        },
  notes:       { label: 'Notes',        icon: NotebookPen     },
  tasks:       { label: 'Tasks',        icon: ListChecks      },
  follow_ups:  { label: 'Follow-ups',   icon: PhoneCall       },
  purchases:   { label: 'Purchases',    icon: Receipt         },
  inspections: { label: 'Inspections',  icon: ClipboardCheck  },
  companies:   { label: 'Companies',    icon: Building2       },
  contacts:    { label: 'Contacts',     icon: Users           },
  external:    { label: 'External',     icon: Briefcase       },
};

// Classify a single RecordRelation into one of the 11 display groups.
// Pure function; exported separately so the grouping behaviour is
// trivial to vitest.
export function relationGroupKey(row: RecordRelation): RelationGroupKey {
  // 1. email_link rows always go to Emails.
  if (row.source_table === 'email_link') return 'emails';
  // 2. calendar_event_link rows always go to Calendar.
  if (row.source_table === 'calendar_event_link') return 'calendar';
  // 3. document_link rows always go to Documents.
  if (row.source_table === 'document_link') return 'documents';

  // 4. record_link rows split by internal vs external.
  if (row.external_app) {
    // External record_link — fold gmail/calendar back into their natural
    // category so a Drive PDF and a Gmail message don't both fall under
    // "External" just because they came in via record_links.
    if (row.external_app === 'gmail') return 'emails';
    if (row.external_app === 'calendar') return 'calendar';
    return 'external';
  }

  // 5. Internal record_link — bucket by to_entity_type.
  switch (row.to_entity_type) {
    case 'document':
      return 'documents';
    case 'note':
      return 'notes';
    case 'task':
      return 'tasks';
    case 'follow_up':
      return 'follow_ups';
    case 'purchase_request':
      return 'purchases';
    case 'inspection':
      return 'inspections';
    case 'company':
      return 'companies';
    case 'contact':
      return 'contacts';
    default:
      // Fallback — should never happen given the H3.3-widened CHECK.
      return 'external';
  }
}

// Group + sort. Empty groups are omitted from the output so the UI
// doesn't render zero-row cards. Order respects RELATION_GROUP_ORDER.
export function groupRelations(rows: RecordRelation[]): RelationGroup[] {
  const byKey = new Map<RelationGroupKey, RecordRelation[]>();
  for (const row of rows) {
    const key = relationGroupKey(row);
    const bucket = byKey.get(key) ?? [];
    bucket.push(row);
    byKey.set(key, bucket);
  }
  const groups: RelationGroup[] = [];
  for (const key of RELATION_GROUP_ORDER) {
    const bucket = byKey.get(key);
    if (!bucket || bucket.length === 0) continue;
    groups.push({
      key,
      label: GROUP_META[key].label,
      icon: GROUP_META[key].icon,
      // Newest first within a group.
      rows: bucket.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    });
  }
  return groups;
}

// =========================================================
// Display helpers
// =========================================================

// Route prefix per internal entity type. The link href is built as
// `${ENTITY_PATH[type]}/${id}` — matches the existing route table in
// src/App.tsx so navigation stays consistent.
export const ENTITY_PATH: Record<RecordLinkEntityType, string> = {
  task: '/tasks',
  follow_up: '/follow-ups',
  purchase_request: '/purchases',
  inspection: '/inspections',
  document: '/documents',
  company: '/companies',
  contact: '/contacts',
  note: '/notes',
};

// Build a navigable href for a relation row. Returns null when there's
// no resolvable target (e.g. a malformed external row).
export function relationHref(row: RecordRelation): string | null {
  if (row.external_url) return row.external_url;
  if (row.to_entity_type && row.to_entity_id) {
    return `${ENTITY_PATH[row.to_entity_type]}/${row.to_entity_id}`;
  }
  return null;
}

// Pick a sensible label for a relation row given the source table +
// snapshot. Order of preference:
//   external_label → external_snapshot.subject → external_snapshot.title
//   → external_record_id → relationship verb → "(missing)"
export function relationLabel(row: RecordRelation): string {
  if (row.external_label && row.external_label.trim()) return row.external_label;
  const snap = row.external_snapshot ?? {};
  const subj = typeof snap.subject === 'string' ? snap.subject : null;
  if (subj && subj.trim()) return subj;
  const title = typeof snap.title === 'string' ? snap.title : null;
  if (title && title.trim()) return title;
  if (row.external_record_id) return row.external_record_id;
  return '(missing)';
}

// =========================================================
// External-URL parsing — turns a pasted URL into the inputs we need
// to call rpc_record_link_external. Returns null when the URL doesn't
// match any of the supported shapes; the UI then falls back to manual
// app-picker + record-id entry.
// =========================================================

export interface ParsedExternalUrl {
  app: RecordLinkExternalApp;
  recordType: string | null;
  recordId: string;
  url: string;
  label: string | null;
}

// Gmail: message-id is the trailing alphanumeric segment in the URL
// fragment. Search-result URLs nest the id one level deeper so we have
// to allow any number of intermediate path segments before it:
//   mail.google.com/mail/u/0/#inbox/FMfcgxwzdrJpKQDPDXSCMZjzCdMnQjqq
//   mail.google.com/mail/u/0/#all/<id>
//   mail.google.com/mail/u/0/#search/from%3Asupplier/<id>
const GMAIL_RX = /mail\.google\.com\/mail\/u\/\d+\/#.+\/(?<id>[A-Za-z0-9_-]{12,})(?:[?#].*)?$/;

// Calendar: event id is in the `eid` query string.
//   calendar.google.com/calendar/event?eid=<base64>
//   calendar.google.com/calendar/u/0/r/eventedit/<base64>
const CALENDAR_RX_QS = /calendar\.google\.com\/calendar\/[^?]*\?eid=(?<id>[A-Za-z0-9_=-]+)/;
const CALENDAR_RX_PATH = /calendar\.google\.com\/calendar\/u\/\d+\/r\/eventedit\/(?<id>[A-Za-z0-9_=-]+)/;

// Drive: file id between `/d/` and the next `/` or end.
//   drive.google.com/file/d/<id>/view
//   docs.google.com/document/d/<id>/edit
//   drive.google.com/drive/folders/<id>
const DRIVE_FILE_RX = /(?:drive|docs)\.google\.com\/(?:file|document|spreadsheets|presentation)\/d\/(?<id>[A-Za-z0-9_-]{10,})/;
const DRIVE_FOLDER_RX = /drive\.google\.com\/drive\/folders\/(?<id>[A-Za-z0-9_-]{10,})/;

export function parseExternalUrl(raw: string): ParsedExternalUrl | null {
  const url = raw.trim();
  if (!url) return null;

  let match = GMAIL_RX.exec(url);
  if (match?.groups?.id) {
    return {
      app: 'gmail',
      recordType: 'message',
      recordId: match.groups.id,
      url,
      label: null,
    };
  }

  match = CALENDAR_RX_QS.exec(url) ?? CALENDAR_RX_PATH.exec(url);
  if (match?.groups?.id) {
    return {
      app: 'calendar',
      recordType: 'event',
      recordId: match.groups.id,
      url,
      label: null,
    };
  }

  match = DRIVE_FILE_RX.exec(url);
  if (match?.groups?.id) {
    return {
      app: 'drive',
      recordType: 'file',
      recordId: match.groups.id,
      url,
      label: null,
    };
  }

  match = DRIVE_FOLDER_RX.exec(url);
  if (match?.groups?.id) {
    return {
      app: 'drive',
      recordType: 'folder',
      recordId: match.groups.id,
      url,
      label: null,
    };
  }

  // Anything else is treated as a generic URL link. We use the URL
  // itself as the record id so idempotency on (from, app, record_id)
  // still works.
  try {
    new URL(url);
  } catch {
    return null;
  }
  return {
    app: 'url',
    recordType: null,
    recordId: url,
    url,
    label: null,
  };
}
