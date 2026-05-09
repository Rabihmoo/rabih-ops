import { useRef, useState } from 'react';
import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import { useCanMutate } from '@/hooks/usePermissions';
import {
  getAttachmentSignedUrl,
  uploadEntityAttachment,
  validateFile,
  MAX_FILE_BYTES,
  type UploadedFile,
} from '@/lib/storage';
import type { AttachmentRow, EntityType } from '@/types/database';

export interface AttachmentWithUploader extends AttachmentRow {
  uploader_name: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Entity-agnostic attachment list. The component owns the Storage upload
// (because the path convention is universal) and emits onAttach with the
// resulting metadata; the caller wires onAttach into their module's
// rpc_attach_file_to_<entity>. onRemove takes the attachment id.
export function AttachmentList({
  entityType,
  entityId,
  attachments,
  onAttach,
  onRemove,
  isAttaching,
  isRemoving,
}: {
  entityType: EntityType;
  entityId: string;
  attachments: AttachmentWithUploader[];
  onAttach: (uploaded: UploadedFile) => Promise<unknown>;
  onRemove: (attachmentId: string) => Promise<unknown>;
  isAttaching?: boolean;
  isRemoving?: boolean;
}) {
  const profile = useAuthStore((s) => s.profile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canMutate = useCanMutate();

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      toast({ title: 'File rejected', description: err, variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadEntityAttachment(entityType, entityId, file);
      await onAttach(uploaded);
      toast({ title: 'File uploaded' });
    } catch (err2) {
      toast({
        title: 'Upload failed',
        description: err2 instanceof Error ? err2.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = async (path: string) => {
    try {
      const url = await getAttachmentSignedUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Could not open file',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async (attachmentId: string) => {
    if (!confirm('Remove this attachment?')) return;
    try {
      await onRemove(attachmentId);
    } catch (err) {
      toast({
        title: 'Could not remove attachment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const busy = uploading || !!isAttaching;

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <div className="text-muted-foreground text-sm">No attachments yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => {
            const canDelete =
              profile &&
              (a.uploaded_by === profile.id ||
                profile.role === 'admin' ||
                profile.role === 'ceo');
            return (
              <li
                key={a.id}
                className="bg-surface-1 border-border hover:border-border-strong flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => handleOpen(a.storage_path)}
                  className="text-foreground hover:text-primary-ink flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm transition-colors"
                >
                  <Paperclip className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="truncate font-medium">{a.file_name}</span>
                </button>
                <span className="text-subtle-foreground shrink-0 text-xs tabular-nums">
                  {formatBytes(a.file_size)} · {a.uploader_name}
                </span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    disabled={isRemoving}
                    className="text-muted-foreground hover:text-destructive-ink shrink-0 disabled:opacity-50"
                    aria-label="Remove attachment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canMutate && (
        <div className="space-y-1.5" data-testid="attachment-uploader">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFile}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          <Button size="sm" variant="outline" onClick={handlePick} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-2 h-4 w-4" />
            )}
            Attach file
          </Button>
          <div className="text-subtle-foreground text-xs">
            Max {MAX_FILE_BYTES / 1024 / 1024} MB. Images, PDF, Office docs, text and CSV.
          </div>
        </div>
      )}
    </div>
  );
}
