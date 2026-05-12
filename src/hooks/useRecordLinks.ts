import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  linkRecordExternal,
  linkRecordInternal,
  listRecordRelations,
  unlinkRecord,
  type LinkExternalInput,
  type LinkInternalInput,
  type RecordLinkEntityType,
} from '@/lib/record-links';

const KEY = ['record-relations'] as const;

// Read — the unified relations panel will subscribe to this for every
// entity detail page. Per-entity cache key so two open detail pages
// don't fight over a shared cache slot.
export function useRecordRelations(
  entityType: RecordLinkEntityType | null,
  entityId: string | null,
  limitPerSource = 30,
) {
  return useQuery({
    queryKey: [...KEY, entityType, entityId, limitPerSource],
    queryFn: () => listRecordRelations(entityType!, entityId!, limitPerSource),
    enabled: !!entityType && !!entityId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (entityType: RecordLinkEntityType, entityId: string) => {
    // Invalidate the source side specifically. The target side is
    // independent — TanStack will refetch it on next mount.
    qc.invalidateQueries({ queryKey: [...KEY, entityType, entityId] });
  };
}

export function useLinkRecordInternal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: LinkInternalInput) => linkRecordInternal(input),
    onSuccess: (_, input) => {
      invalidate(input.fromType, input.fromId);
      // Also invalidate the target's relations panel — the inbound
      // mirror appears there.
      invalidate(input.toType, input.toId);
    },
  });
}

export function useLinkRecordExternal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: LinkExternalInput) => linkRecordExternal(input),
    onSuccess: (_, input) => invalidate(input.fromType, input.fromId),
  });
}

// Unlink requires the caller to pass the from-side entity so we can
// invalidate the correct cache slot — the row we receive back has
// from_entity_type / from_entity_id, but TanStack needs the key BEFORE
// the mutation completes.
export interface UnlinkInput {
  linkId: number;
  fromType: RecordLinkEntityType;
  fromId: string;
  toType?: RecordLinkEntityType | null;
  toId?: string | null;
}

export function useUnlinkRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UnlinkInput) => unlinkRecord(input.linkId),
    onSuccess: (_, input) => {
      invalidate(input.fromType, input.fromId);
      if (input.toType && input.toId) invalidate(input.toType, input.toId);
    },
  });
}
