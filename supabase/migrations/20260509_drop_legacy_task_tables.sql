-- Rabih Ops — Drop legacy task_comments / task_attachments tables and policies
-- Companion to 20260508_shared_comments_attachments.sql.
--
-- Pre-flight on 2026-05-07: task_comments=0, task_attachments=0, bucket=0 objects.
-- _can_access_entity verified to return false for missing/null parents.
-- The legacy task-attachments storage bucket was removed via the Storage REST
-- API before this migration ran — Supabase blocks direct DELETE on storage
-- tables (see storage.protect_delete trigger).

begin;

-- Storage policies tied to the now-deleted task-attachments bucket
drop policy if exists task_attachments_storage_select on storage.objects;
drop policy if exists task_attachments_storage_insert on storage.objects;

-- Drop the per-task tables. Their RLS policies and triggers go with them.
drop table if exists public.task_attachments;
drop table if exists public.task_comments;

commit;
