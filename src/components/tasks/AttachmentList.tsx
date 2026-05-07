import { useRef, useState } from 'react';
import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import {
  useAttachFileToTask,
  useRemoveTaskAttachment,
} from '@/hooks/useTasks';
import { useCanMutate } from '@/hooks/usePermissions';
import {
  getAttachmentSignedUrl,
  uploadTaskAttachment,
  validateFile,
  MAX_FILE_BYTES,
} from '@/lib/storage';
import type { TaskAttachmentWithUploader } from '@/lib/tasks';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentList({
  taskId,
  attachments,
}: {
  taskId: string;
  attachments: TaskAttachmentWithUploader[];
}) {
  const profile = useAuthStore((s) => s.profile);
  const attach = useAttachFileToTask();
  const remove = useRemoveTaskAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canMutate = useCanMutate();

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file later
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      toast({ title: 'File rejected', description: err, variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadTaskAttachment(taskId, file);
      await attach.mutateAsync({
        taskId,
        storagePath: uploaded.storagePath,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
      });
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
      await remove.mutateAsync({ attachmentId, taskId });
    } catch (err) {
      toast({
        title: 'Could not remove attachment',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <div className="text-muted-foreground text-sm">No attachments yet.</div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => {
            const canDelete =
              profile &&
              (a.uploaded_by === profile.id ||
                profile.role === 'admin' ||
                profile.role === 'ceo');
            return (
              <li
                key={a.id}
                className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => handleOpen(a.storage_path)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                >
                  <Paperclip className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="truncate">{a.file_name}</span>
                </button>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatBytes(a.file_size)} · {a.uploader_name}
                </span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
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
        <div className="space-y-1" data-testid="attachment-uploader">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFile}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          <Button size="sm" variant="outline" onClick={handlePick} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-2 h-4 w-4" />
            )}
            Attach file
          </Button>
          <div className="text-muted-foreground text-xs">
            Max {MAX_FILE_BYTES / 1024 / 1024} MB. Images, PDF, Office docs, text/csv.
          </div>
        </div>
      )}
    </div>
  );
}
