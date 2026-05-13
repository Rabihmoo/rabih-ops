import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { RecordLinkDialog } from './RecordLinkDialog';
import { useRecordRelations } from '@/hooks/useRecordLinks';
import { useCanMutate } from '@/hooks/usePermissions';
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

// Universal linked-records panel. Reads relations via rpc_record_relations
// (which projects record_links + email_links + document_links +
// calendar_event_links into one shape). Linking surfaces an internal-only
// picker (H4.4); the "Entity · short-id" fallback below only triggers if
// to_entity_title is unexpectedly null (e.g. a hard-deleted target row that
// still passed _can_access_entity).

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

// Internal record_links: prefer the server-resolved to_entity_title.
// Fall back to a stable "Entity · short-id" string if it's null (e.g.
// the target was hard-deleted between link creation and the read but
// somehow still passed _can_access_entity).
function internalTargetLabel(row: RecordRelation): string {
  if (row.to_entity_title && row.to_entity_title.trim()) {
    return row.to_entity_title;
  }
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
  const canMutate = useCanMutate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = data ?? [];
  const groups = groupRelations(rows);
  const total = rows.length;

  return (
    <Card data-testid="linked-records-panel">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-section-label flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" />
            Linked records
            {total > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({total})
              </span>
            )}
          </div>
          {canMutate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(true)}
              data-testid="linked-records-add-button"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Link
            </Button>
          )}
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
            className="text-muted-foreground space-y-2 py-1 text-xs"
            data-testid="linked-records-empty"
          >
            <p>No linked records yet.</p>
            {canMutate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
                data-testid="linked-records-empty-add-button"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Link a record
              </Button>
            )}
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
      {canMutate && (
        <RecordLinkDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          fromType={entityType}
          fromId={entityId}
        />
      )}
    </Card>
  );
}

function RelationRow({ row }: { row: RecordRelation }) {
  const verb = row.relationship as RecordLinkRelationship;
  const tone = RELATIONSHIP_TONE[verb] ?? 'muted';
  const href = relationHref(row);
  const external = isExternal(row);
  const label = rowLabel(row);

  const directionIcon =
    row.direction === 'inbound' ? (
      <ArrowDownLeft
        aria-label="Inbound link"
        className="text-subtle-foreground h-3.5 w-3.5 shrink-0"
      />
    ) : (
      <ArrowUpRight
        aria-label="Outbound link"
        className="text-subtle-foreground h-3.5 w-3.5 shrink-0"
      />
    );

  const dateStr = new Date(row.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Mobile (< sm): three stacked lines so a long label can wrap to two
  // lines instead of getting truncated at 390px.
  //   Line 1: chip + direction icon (compact pair)
  //   Line 2: label (no line-clamp; can wrap)
  //   Line 3: date right-aligned + external-link icon
  // Desktop (sm:): single row, layout pixel-equivalent to the pre-fix
  // version — chip · label (line-clamp-1, flex-1) · direction · date · ext-icon.
  const inner = (
    <span className="flex w-full flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
      {/* Mobile line 1: chip + direction. Hidden on sm — desktop puts both
          back in the main row below. */}
      <span className="flex items-center gap-2 sm:hidden">
        <StatusChip tone={tone} size="xs">
          {relationshipLabel(verb)}
        </StatusChip>
        {directionIcon}
      </span>

      {/* Desktop-only chip. Mobile renders it above. */}
      <span className="hidden sm:inline-flex">
        <StatusChip tone={tone} size="xs">
          {relationshipLabel(verb)}
        </StatusChip>
      </span>

      {/* Label — full width and wrappable on mobile; truncated single-line
          on desktop to keep the row a fixed visual height. */}
      <span className="text-foreground break-words text-sm sm:line-clamp-1 sm:flex-1 sm:break-normal">
        {label}
      </span>

      {/* Desktop-only direction icon. */}
      <span className="hidden sm:inline-flex">{directionIcon}</span>

      {/* Mobile line 3 = desktop trailing pair: date + external icon. On
          mobile the date is right-aligned via justify-end so the cluster
          hugs the right edge. */}
      <span className="flex items-center justify-end gap-2 sm:contents">
        <span className="text-subtle-foreground text-xs tabular-nums sm:w-16 sm:shrink-0 sm:text-right">
          {dateStr}
        </span>
        {external ? (
          <ExternalLink
            aria-hidden
            className="text-muted-foreground h-3.5 w-3.5 shrink-0"
          />
        ) : (
          <span aria-hidden className="hidden w-3.5 shrink-0 sm:inline" />
        )}
      </span>
    </span>
  );

  if (!href) {
    return (
      <li
        data-testid="relation-row"
        className="hover:bg-surface-1 -mx-2 flex items-stretch rounded-md px-2 transition-colors sm:items-center sm:gap-3"
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
          className="hover:bg-surface-1 -mx-2 flex items-stretch rounded-md px-2 transition-colors sm:items-center sm:gap-3"
        >
          {inner}
        </a>
      ) : (
        <Link
          to={href}
          className="hover:bg-surface-1 -mx-2 flex items-stretch rounded-md px-2 transition-colors sm:items-center sm:gap-3"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
