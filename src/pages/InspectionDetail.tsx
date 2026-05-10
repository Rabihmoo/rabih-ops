import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { InspectionForm } from '@/components/inspections/InspectionForm';
import { FindingsList } from '@/components/inspections/FindingsList';
import { ResultBadge } from '@/components/inspections/badges';
import { BranchBadge } from '@/components/tasks/badges';
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { LinkedDocumentsCard } from '@/components/shared/LinkedDocumentsCard';
import {
  useInspectionDetail,
  useUpdateInspection,
  useCompleteInspection,
  useAddInspectionComment,
  useDeleteInspectionComment,
  useAttachFileToInspection,
  useRemoveInspectionAttachment,
} from '@/hooks/useInspections';
import { useCanAdminInspect } from '@/hooks/usePermissions';
import type { UpdateInspectionInput } from '@/lib/inspections';
import type { InspectionResult } from '@/types/database';

const AREA_LABEL: Record<string, string> = {
  kitchen: 'Kitchen',
  storage: 'Storage',
  service_area: 'Service area',
  cold_room: 'Cold room',
  dry_store: 'Dry store',
  staff_area: 'Staff area',
  full_branch: 'Full branch',
};

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? null;

  const { data, isLoading, error } = useInspectionDetail(id);
  const update = useUpdateInspection();
  const complete = useCompleteInspection();
  const addComment = useAddInspectionComment();
  const deleteComment = useDeleteInspectionComment();
  const attach = useAttachFileToInspection();
  const removeAttachment = useRemoveInspectionAttachment();
  const canAdmin = useCanAdminInspect();

  const [editing, setEditing] = useState(false);

  if (isLoading || !id) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading inspection…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link
          to="/inspections"
          className="text-muted-foreground text-sm hover:underline"
        >
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to inspections
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load inspection: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { inspection, findings, comments, attachments, audit } = data;
  const result = inspection.result as InspectionResult;
  const closed = result === 'pass' || result === 'failed';
  const openCriticalCount = findings.filter(
    (f) => f.severity === 'critical' && f.status !== 'resolved',
  ).length;

  const handleUpdate = async (payload: UpdateInspectionInput) => {
    await update.mutateAsync({ id, updates: payload });
    setEditing(false);
    toast({ title: 'Inspection updated' });
  };

  const handleComplete = async (chosenResult: InspectionResult) => {
    await complete.mutateAsync({ id, result: chosenResult });
    toast({ title: `Inspection marked as ${chosenResult.replace('_', ' ')}` });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/inspections"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to inspections
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <h1
            className={cn(
              'text-foreground text-3xl font-semibold tracking-tight leading-tight',
              closed && 'text-muted-foreground',
            )}
          >
            {AREA_LABEL[inspection.area] ?? inspection.area}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ResultBadge result={result} />
            <BranchBadge branch={inspection.branch} />
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              {formatDate(inspection.inspection_date)}
            </span>
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              by {inspection.inspector_name}
            </span>
            {openCriticalCount > 0 && (
              <span className="bg-destructive-soft text-destructive-ink ml-1 inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                {openCriticalCount} open critical
              </span>
            )}
          </div>
        </div>
        {canAdmin && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {result === 'pending' && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleComplete('pass')}
                  disabled={complete.isPending}
                  data-testid="inspection-pass-button"
                >
                  Pass
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleComplete('issues_found')}
                  disabled={complete.isPending}
                >
                  Issues found
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleComplete('failed')}
                  disabled={complete.isPending}
                >
                  Fail
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit inspection</div>
            <InspectionForm
              initial={inspection}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save changes"
            />
            <Button
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : (
        inspection.general_notes && (
          <Card>
            <CardContent className="space-y-2 p-5">
              <div className="text-section-label">General notes</div>
              <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                {inspection.general_notes}
              </p>
            </CardContent>
          </Card>
        )
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Findings
            {findings.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({findings.length})
              </span>
            )}
          </div>
          <FindingsList inspectionId={id} findings={findings} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Comments
            {comments.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({comments.length})
              </span>
            )}
          </div>
          <CommentList
            comments={comments}
            onAdd={(body) => addComment.mutateAsync({ id, body })}
            onDelete={(commentId) =>
              deleteComment.mutateAsync({ commentId, inspectionId: id })
            }
            isAdding={addComment.isPending}
            isDeleting={deleteComment.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Attachments
            {attachments.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({attachments.length})
              </span>
            )}
          </div>
          <AttachmentList
            entityType="inspection"
            entityId={id}
            attachments={attachments}
            onAttach={(uploaded) =>
              attach.mutateAsync({
                inspectionId: id,
                storagePath: uploaded.storagePath,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                fileSize: uploaded.fileSize,
              })
            }
            onRemove={(attachmentId) =>
              removeAttachment.mutateAsync({ attachmentId, inspectionId: id })
            }
            isAttaching={attach.isPending}
            isRemoving={removeAttachment.isPending}
          />
        </CardContent>
      </Card>

      {id && <LinkedDocumentsCard entityType="inspection" entityId={id} />}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label">Activity</div>
          <AuditList entries={audit} />
        </CardContent>
      </Card>
    </div>
  );
}
