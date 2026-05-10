import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  ExternalLink,
  Loader2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { PurchaseActions } from '@/components/purchases/PurchaseActions';
import {
  PaymentStatusBadge,
  PurchaseStatusBadge,
} from '@/components/purchases/badges';
import { BranchBadge } from '@/components/tasks/badges';
import { AuditList } from '@/components/shared/AuditList';
import { CommentList } from '@/components/shared/CommentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { LinkedDocumentsCard } from '@/components/shared/LinkedDocumentsCard';
import {
  usePurchaseDetail,
  useUpdatePurchase,
  useSoftDeletePurchase,
  useAddPurchaseComment,
  useDeletePurchaseComment,
  useAttachFileToPurchase,
  useRemovePurchaseAttachment,
} from '@/hooks/usePurchaseRequests';
import { useCanAdminPurchases, useCanMutate } from '@/hooks/usePermissions';
import { formatCurrency, formatQty } from '@/lib/purchase-requests';
import type { UpdatePurchaseInput } from '@/lib/purchase-requests';
import type {
  Currency,
  PaymentStatus,
  PurchaseStatus,
} from '@/types/database';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = params.id ?? null;

  const { data, isLoading, error } = usePurchaseDetail(id);
  const update = useUpdatePurchase();
  const softDelete = useSoftDeletePurchase();
  const addComment = useAddPurchaseComment();
  const deleteComment = useDeletePurchaseComment();
  const attach = useAttachFileToPurchase();
  const removeAttachment = useRemovePurchaseAttachment();
  const canMutate = useCanMutate();
  const canAdmin = useCanAdminPurchases();

  const [editing, setEditing] = useState(false);

  if (isLoading || !id) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading purchase…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <Link to="/purchases" className="text-muted-foreground text-sm hover:underline">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to purchases
        </Link>
        <div className="text-destructive-ink text-sm">
          Could not load purchase: {(error as Error).message}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { purchase_request: row, comments, attachments, audit } = data;
  const status = row.status as PurchaseStatus;
  const paymentStatus = row.payment_status as PaymentStatus;
  const closed = status === 'fully_received' || status === 'cancelled';

  // Manager can edit only while in draft/submitted; admin/ceo can always edit.
  const canEdit =
    canAdmin ||
    (canMutate && (status === 'draft' || status === 'submitted'));

  const handleUpdate = async (payload: UpdatePurchaseInput) => {
    await update.mutateAsync({ id, updates: payload });
    setEditing(false);
    toast({ title: 'Purchase updated' });
  };

  const handleSoftDelete = async () => {
    if (
      !confirm(
        'Soft-delete this purchase request? It will be hidden from lists, but the record stays in the database for audit.',
      )
    )
      return;
    await softDelete.mutateAsync(id);
    toast({ title: 'Purchase deleted' });
    navigate('/purchases');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/purchases"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to purchases
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1
              className={cn(
                'text-foreground text-3xl font-semibold tracking-tight leading-tight',
                closed && 'text-muted-foreground',
              )}
            >
              {row.title}
            </h1>
            <div className="text-muted-foreground mt-1 text-sm">
              {row.supplier_name}
              {row.supplier_website && (
                <a
                  href={row.supplier_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-ink ml-2 inline-flex items-center text-xs hover:underline"
                >
                  website <ExternalLink className="ml-0.5 h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PurchaseStatusBadge status={status} />
            <PaymentStatusBadge status={paymentStatus} />
            <BranchBadge branch={row.branch} />
            <span className="text-subtle-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              by {row.requested_by_name}
            </span>
            {row.reminder_date && (
              <>
                <span className="text-subtle-foreground text-xs">·</span>
                <span className="text-primary-ink inline-flex items-center text-xs">
                  <Bell className="mr-1 h-3 w-3" />
                  reminder {formatDate(row.reminder_date)}
                </span>
              </>
            )}
            {row.is_overdue && (
              <span className="bg-destructive-soft text-destructive-ink ml-1 inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                overdue
              </span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canAdmin && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleSoftDelete}
                disabled={softDelete.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary card — at-a-glance numbers */}
      <Card>
        <CardContent className="p-5">
          <div className="text-section-label mb-3">Summary</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat
              label="Total"
              value={formatCurrency(row.total_amount, row.currency as Currency)}
            />
            <SummaryStat
              label="Paid"
              value={formatCurrency(row.amount_paid, row.currency as Currency)}
              tone={
                paymentStatus === 'paid'
                  ? 'success'
                  : paymentStatus === 'partial'
                    ? 'warning'
                    : paymentStatus === 'unpaid' && row.total_amount != null
                      ? 'destructive'
                      : 'muted'
              }
            />
            <SummaryStat
              label="Quantity"
              value={
                row.qty_ordered == null && row.qty_received == null
                  ? '—'
                  : `${formatQty(row.qty_received ?? 0)} / ${formatQty(row.qty_ordered)}`
              }
              tone={
                row.qty_ordered != null &&
                row.qty_received != null &&
                row.qty_received >= row.qty_ordered
                  ? 'success'
                  : row.qty_received != null && row.qty_received > 0
                    ? 'warning'
                    : 'muted'
              }
            />
            <SummaryStat
              label="Expected"
              value={formatDate(row.expected_delivery_date)}
              tone={row.is_overdue ? 'destructive' : 'muted'}
            />
            <SummaryStat label="Order date" value={formatDate(row.order_date)} />
            <SummaryStat
              label="Submitted"
              value={
                row.submitted_at
                  ? new Date(row.submitted_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'
              }
            />
            <SummaryStat
              label="Received on"
              value={formatDate(row.actual_delivery_date)}
            />
            <SummaryStat
              label="Method"
              value={
                row.payment_method
                  ? row.payment_method.replace('_', ' ')
                  : '—'
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Edit form (modal-less, in-place) */}
      {editing && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-section-label">Edit request</div>
            <PurchaseForm
              initial={row}
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
      )}

      {/* Notes */}
      {!editing && row.notes && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="text-section-label">Notes</div>
            <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
              {row.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action panels — grouped by Lifecycle vs Operational */}
      {!editing && <PurchaseActions purchase={row} />}

      {/* Comments */}
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
              deleteComment.mutateAsync({ commentId, purchaseId: id })
            }
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
            {attachments.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({attachments.length})
              </span>
            )}
          </div>
          <AttachmentList
            entityType="purchase_request"
            entityId={id}
            attachments={attachments}
            onAttach={(uploaded) =>
              attach.mutateAsync({
                purchaseId: id,
                storagePath: uploaded.storagePath,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                fileSize: uploaded.fileSize,
              })
            }
            onRemove={(attachmentId) =>
              removeAttachment.mutateAsync({ attachmentId, purchaseId: id })
            }
            isAttaching={attach.isPending}
            isRemoving={removeAttachment.isPending}
          />
        </CardContent>
      </Card>

      {id && <LinkedDocumentsCard entityType="purchase_request" entityId={id} />}

      {/* Activity */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="text-section-label">Activity</div>
          <AuditList entries={audit} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'destructive' | 'warning' | 'success' | 'muted';
}) {
  return (
    <div className="space-y-1">
      <div className="text-section-label">{label}</div>
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'destructive' && 'text-destructive-ink',
          tone === 'warning' && 'text-warning-ink',
          tone === 'success' && 'text-success-ink',
          tone === 'muted' && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}
