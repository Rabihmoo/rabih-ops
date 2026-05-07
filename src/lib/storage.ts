import { supabase } from './supabase';

const BUCKET = 'rabih-ops-attachments';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
]);

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — must match bucket cap

export interface UploadedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export function validateFile(file: File): string | null {
  if (file.size === 0) return 'File is empty';
  if (file.size > MAX_FILE_BYTES) return 'File exceeds 10 MB limit';
  if (!ALLOWED_MIME.has(file.type)) return `Mime type not allowed: ${file.type || 'unknown'}`;
  return null;
}

// Path convention is enforced by the RPC and the storage policy:
//   <entity_type>/<entity_id>/<uuid>-<safe-filename>
// entity_type matches the RPC's expectation (e.g. 'task', 'follow_up').
export async function uploadEntityAttachment(
  entityType: string,
  entityId: string,
  file: File,
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const objectKey = `${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectKey, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return {
    storagePath: objectKey,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  };
}

// Backwards-compatible thin alias for the Tasks module callsite. Future modules
// should call uploadEntityAttachment directly.
export const uploadTaskAttachment = (taskId: string, file: File): Promise<UploadedFile> =>
  uploadEntityAttachment('task', taskId, file);

export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
