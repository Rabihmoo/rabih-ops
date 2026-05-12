import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Link2,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { useRecordRelations } from '@/hooks/useRecordLinks';
import {
  groupRelations,
  relationHref,
  relationLabel,
  type RecordRelation,
} from '@/lib/record-relations';
import type {
  RecordLinkEntityType,
  RecordLinkRelationship,
} from '@/lib/record-links';

// Phase H4.2 — read-only universal panel. Mounted on NoteDetail first
// (no existing LinkedDocumentsCard / LinkedEmailsCard there to coexist
// with). Add/link/unlink affordances land in H4.4–H4.6. Title resolution
// for internal record_links is intentionally V1: entity_type + short id.
// Backed snapshots arrive in H4.3+ once we either widen the SQL projection
// or per-row fetch.

const RELATIONSHIP_TONE: Record<RecordLinkRelationship, StatusTone> = {
  relates_to:     'muted',
  follow_up_for:  'info',
  caused_by:      'critical',
  blocks:         'warning',
  resolves:       'success',
  email_for:      'info',
  document_for:   'info',
  supplier_for:   'muted',
  contractor_for: 'muted',
  staff_for:      'muted',
  decision_for:   'purple',
  calendar_for:   'info',
  note_for:       'purple',
  attachment_for: 'muted',
};

const ENTITY_LABEL: Record<RecordLinkEntityType, string> = {
  task:             'Task',
  follow_up:        'Follow-up',
  purchase_request: 'Purchase',
  inspection:       'Inspection',
  document:         'Document',
  company:          'Company',
  contact:          'Contact',
  note:             'Note',
};

function relationshipLabel(verb: RecordLinkRelationship): string {
  // Replace underscores so the chip reads natural ("Follow up for"
  // instead of "Follow_up_for") and title-cases the leading word.
  const human = verb.replace(/_/g, ' ');
  return human.charAt(0).toUpperCase() + human.slice(1);
}

// Internal record_links don't ship target titles in rpc_record_relations
// today. Fall back to a stable "Entity · short-id" string so the row is
// still navigable and visually anchored.
function internalTargetLabel(row: RecordRelation): string {
  const type = row.to_entity_type;
  const id = row.to_entity_id;
  if (!type || !id) return '(missing)';
  const shortId = id.split('-')[0];
  return `${ENTITY_LABEL[type]} · ${shortId}`;
}

function isExternal(row: RecordRelation): boolean {
  return row.external_app !== null;
}

function rowLabel(row: RecordRelation): string {
  if (isExternal(row) || row.source_table !== 'record_link') {
    return relationLabel(row);
  }
  return internalTargetLabel(row);
}

export function LinkedRecordsPanel({
  entityType,
  entityId,
}: {
  entityType: RecordLinkEntityType;
  entityId: string;
}) {
  const { data, isLoading, error } = useRecordRelations(entityType, entityId);

  const rows = data ?? [];
  const groups = groupRelations(rows);
  const total = rows.length;

  return (
    <Card data-testid="linked-records-panel">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="text-section-label flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" />
            Linked records
            {total > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({total})
              </span>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="text-muted-foreground py-1 text-xs">
            <Loader2 className="mr-2 inline h-3 w-3 animate-spin" /> Loading
            relations…
          </div>
        )}

        {error && !isLoading && (
          <div className="text-destructive-ink text-xs">
            Could not load relations: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && total === 0 && (
          <div
            className="text-muted-foreground py-1 text-xs"
            data-testid="linked-records-empty"
          >
            No linked records yet. Linking will arrive in a future update —
            this panel reads everything the entity is connected to.
          </div>
        )}

        {!isLoading && !error && groups.length > 0 && (
          <ul className="space-y-4">
            {groups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <li key={group.key} data-testid={`relation-group-${group.key}`}>
                  <div className="text-section-label text-foreground-72 mb-1.5 flex items-center gap-1.5">
                    <GroupIcon className="h-3.5 w-3.5" />
                    {group.label}
                    <span className="text-subtle-foreground normal-case tracking-normal">
                      ({group.rows.length})
                    </span>
                  </div>
                  <ul className="divide-border divide-y">
                    {group.rows.map((row) => (
                      <RelationRow key={`${row.source_table}-${row.link_id}`} row={row} />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RelationRow({ row }: { row: RecordRelation }) {
  const verb = row.relationship as RecordLinkRelationship;
  const tone = RELATIONSHIP_TONE[verb] ?? 'muted';
  const href = relationHref(row);
  const external = isExternal(row);
  const label = rowLabel(row);

  const inner = (
    <span className="flex w-full items-center gap-3 py-2">
      <StatusChip tone={tone} size="xs">
        {relationshipLabel(verb)}
      </StatusChip>
      <span className="text-foreground line-clamp-1 flex-1 text-sm">
        {label}
      </span>
      {row.direction === 'inbound' ? (
        <ArrowDownLeft
          aria-label="Inbound link"
          className="text-subtle-foreground h-3.5 w-3.5 shrink-0"
        />
      ) : (
        <ArrowUpRight
          aria-label="Outbound link"
          className="text-subtle-foreground h-3.5 w-3.5 shrink-0"
        />
      )}
      <span className="text-subtle-foreground w-16 shrink-0 text-right text-xs tabular-nums">
        {new Date(row.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}
      </span>
      {external ? (
        <ExternalLink
          aria-hidden
          className="text-muted-foreground h-3.5 w-3.5 shrink-0"
        />
      ) : (
        <span aria-hidden className="w-3.5 shrink-0" />
      )}
    </span>
  );

  if (!href) {
    return (
      <li
        data-testid="relation-row"
        className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 transition-colors"
      >
        {inner}
      </li>
    );
  }

  // External rows go through a new tab; internal navigates via react-router.
  return (
    <li
      data-testid="relation-row"
      className="last:[&>*]:border-b-0"
    >
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 transition-colors"
        >
          {inner}
        </a>
      ) : (
        <Link
          to={href}
          className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 transition-colors"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
