import { useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  ExternalLink,
  History,
  Loader2,
  Lock,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { marked } from 'marked';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { toast } from '@/components/ui/toast';

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'warning',
  active: 'success',
  archived: 'muted',
};
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { DocumentForm } from '@/components/documents/DocumentForm';
import {
  useAddDocumentComment,
  useArchiveDocument,
  useAttachFileToDocument,
  useDeleteDocumentComment,
  useDocument,
  useRemoveDocumentAttachment,
  useRevertDocument,
  useSoftDeleteDocument,
  useUnarchiveDocument,
  useUpdateDocument,
} from '@/hooks/useDocuments';
import { useCanMutate } from '@/hooks/usePermissions';
import {
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_STATUS_LABEL,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '@/lib/documents';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import type {
  DocumentLinkEntityType,
  DocumentRow,
} from '@/types/database';

const ENTITY_PATH: Record<DocumentLinkEntityType, string> = {
  task: '/tasks',
  follow_up: '/follow-ups',
  inspection: '/inspections',
  purchase_request: '/purchases',
};

export function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const docId = params.id ?? null;

  const { data, isLoading, error } = useDocument(docId);
  const update = useUpdateDocument();
  const archive = useArchiveDocument();
  const unarchive = useUnarchiveDocument();
  const softDelete = useSoftDeleteDocument();
  const revert = useRevertDocument();
  const addComment = useAddDocumentComment();
  const deleteComment = useDeleteDocumentComment();
  const attach = useAttachFileToDocument();
  const removeAttachment = useRemoveDocumentAttachment();
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const renderedHtml = useMemo(() => {
    const md = data?.document?.body_md ?? '';
    if (!md) return '';
    try { return marked.parse(md, { async: false }) as string; } catch { return ''; }
  }, [data?.document?.body_md]);

  if (isLoading || !docId) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading document…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/documents" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to documents
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load document: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const doc: DocumentRow = data.document;
  const archived = doc.status === 'archived';
  const branchMeta = doc.branch
    ? (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
        doc.branch as BranchCode
      ]
    : null;

  const handleUpdate = async (
    payload: CreateDocumentInput | UpdateDocumentInput,
    changeNote?: string | null,
  ) => {
    await update.mutateAsync({
      docId,
      updates: payload as UpdateDocumentInput,
      changeNote: changeNote ?? null,
    });
    setEditing(false);
    toast({ title: 'Document updated' });
  };

  const handleArchive = async () => {
    if (!confirm('Archive this document? Linked entities still see the link as history.')) return;
    await archive.mutateAsync(docId);
    toast({ title: 'Archived' });
  };
  const handleUnarchive = async () => {
    await unarchive.mutateAsync(docId);
    toast({ title: 'Restored to draft' });
  };
  const handleDelete = async () => {
    if (!confirm('Soft-delete this document? It will be hidden from lists. Audit trail stays.')) return;
    await softDelete.mutateAsync(docId);
    toast({ title: 'Document deleted' });
    navigate('/documents');
  };
  const handleRevert = async (versionNo: number) => {
    if (!confirm(`Revert to version ${versionNo}? This writes a new version.`)) return;
    await revert.mutateAsync({ docId, versionNo });
    toast({ title: `Reverted to v${versionNo}` });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        to="/documents"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to documents
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <h1
            className={cn(
              'text-foreground text-3xl font-semibold tracking-tight leading-tight',
              archived && 'text-muted-foreground line-through',
            )}
          >
            {doc.visibility === 'personal' && (
              <Lock className="mr-2 inline h-5 w-5 -translate-y-1" aria-label="Personal" />
            )}
            {doc.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip tone="info" size="xs">
              {DOCUMENT_CATEGORY_LABEL[doc.category as keyof typeof DOCUMENT_CATEGORY_LABEL]}
            </StatusChip>
            <StatusChip tone={STATUS_TONE[doc.status] ?? 'muted'} size="xs">
              {DOCUMENT_STATUS_LABEL[doc.status as keyof typeof DOCUMENT_STATUS_LABEL]}
            </StatusChip>
            {branchMeta && (
              <span className="text-foreground-72 inline-flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: branchMeta.color }}
                />
                {branchMeta.name}
              </span>
            )}
            {!doc.branch && (
              <span className="text-subtle-foreground text-xs">cross-branch</span>
            )}
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              v{(data.versions[0]?.version_no ?? 1)} · updated{' '}
              {new Date(doc.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {canMutate && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!archived && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                data-testid="document-edit-button"
              >
                Edit
              </Button>
            )}
            {!archived ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleArchive}
                disabled={archive.isPending}
                data-testid="document-archive-button"
              >
                <Archive className="mr-1 h-4 w-4" /> Archive
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleUnarchive}
                disabled={unarchive.isPending}
                data-testid="document-unarchive-button"
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Restore (draft)
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={softDelete.isPending}
              data-testid="document-delete-button"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit document</div>
            <DocumentForm
              initial={doc}
              submitting={update.isPending}
              onSubmit={handleUpdate}
              submitLabel="Save new version"
              showStatus
              showChangeNote
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
        <Card>
          <CardContent className="p-5">
            {doc.body_md ? (
              <article
                className="prose prose-invert max-w-none text-sm leading-relaxed [&_a]:text-primary-ink [&_code]:bg-surface-1 [&_code]:px-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_pre]:bg-surface-1 [&_pre]:p-3 [&_table]:border [&_th]:border [&_td]:border [&_th]:px-2 [&_td]:px-2"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="text-muted-foreground text-sm">No content yet.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Linked entities */}
      {data.links.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Linked operations</div>
            <ul className="space-y-1.5">
              {data.links.map((l) => (
                <li key={l.id}>
                  <Link
                    to={`${ENTITY_PATH[l.entity_type as DocumentLinkEntityType]}/${l.entity_id}`}
                    className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
                  >
                    <span className="text-subtle-foreground inline-flex w-32 shrink-0 items-center text-xs uppercase tracking-wider">
                      {l.entity_type.replace('_', ' ')}
                    </span>
                    <span className="text-foreground line-clamp-1 flex-1">
                      {l.entity_title ?? '(missing)'}
                    </span>
                    <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Version history */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <button
            type="button"
            onClick={() => setShowVersions((v) => !v)}
            className="text-section-label hover:text-foreground inline-flex items-center gap-2"
          >
            <History className="h-3.5 w-3.5" />
            Version history ({data.versions.length})
            <span className="text-subtle-foreground ml-1 text-xs">
              {showVersions ? '— hide' : '— show'}
            </span>
          </button>
          {showVersions && (
            <ul className="divide-border divide-y">
              {data.versions.map((v) => (
                <li key={v.id} className="flex items-start gap-3 py-2.5">
                  <span className="text-foreground-72 w-12 shrink-0 text-sm font-medium tabular-nums">
                    v{v.version_no}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground text-sm">{v.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {v.changed_by_name} · {new Date(v.created_at).toLocaleString()}
                      {v.change_note && <span className="ml-2 italic">— {v.change_note}</span>}
                    </div>
                  </div>
                  {canMutate && v.version_no !== data.versions[0]?.version_no && !archived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevert(v.version_no)}
                      disabled={revert.isPending}
                      data-testid={`revert-v${v.version_no}`}
                    >
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Revert
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Comments
            {data.comments.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({data.comments.length})
              </span>
            )}
          </div>
          <CommentList
            comments={data.comments}
            onAdd={(body) => addComment.mutateAsync({ docId, body })}
            onDelete={(commentId) => deleteComment.mutateAsync({ commentId, docId })}
            isAdding={addComment.isPending}
            isDeleting={deleteComment.isPending}
          />
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label flex items-center gap-2">
            Attachments
            {data.attachments.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({data.attachments.length})
              </span>
            )}
          </div>
          <AttachmentList
            entityType="document"
            entityId={docId}
            attachments={data.attachments}
            onAttach={(uploaded) =>
              attach.mutateAsync({
                docId,
                storagePath: uploaded.storagePath,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                fileSize: uploaded.fileSize,
              })
            }
            onRemove={(attachmentId) =>
              removeAttachment.mutateAsync({ attachmentId, docId })
            }
            isAttaching={attach.isPending}
            isRemoving={removeAttachment.isPending}
          />
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label">Activity</div>
          <AuditList entries={data.audit} />
        </CardContent>
      </Card>
    </div>
  );
}
