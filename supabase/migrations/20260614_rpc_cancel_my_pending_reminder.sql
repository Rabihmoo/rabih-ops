-- 20260614_rpc_cancel_my_pending_reminder.sql
-- Phase 7 chunk 7.3a — additive recipient-self pending-cancel RPC.
--
-- Live rpc_dismiss_reminder requires status='sent' (raises 22023
-- otherwise) and rpc_cancel_reminder is admin/ceo only. That leaves
-- a real gap: a recipient cannot cancel their own pending reminder
-- before it fires. This adds the smallest possible bridge.
--
-- Behaviour:
--   * Recipient-only. No admin override here — admins keep using
--     rpc_cancel_reminder which sets cancel_reason free-form.
--   * Pending-only. Sent rows continue to flow through dismiss.
--   * Audits as reminder_cancelled with
--     cancel_reason='recipient_cancelled' so the audit log can
--     distinguish recipient-driven cancels from engine-driven
--     'task_closed' / 'replaced' cancels.

begin;

create or replace function public.rpc_cancel_my_pending_reminder(
  p_queue_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before notifications_queue;
  v_after  notifications_queue;
begin
  select * into v_before from notifications_queue where id = p_queue_id;
  if v_before is null then
    raise exception 'reminder % not found', p_queue_id using errcode = 'P0002';
  end if;
  if v_before.recipient_id <> v_uid then
    raise exception 'cannot cancel someone else''s reminder' using errcode = '42501';
  end if;
  if v_before.status <> 'pending' then
    raise exception 'reminder % is not pending (status=%)', p_queue_id, v_before.status
      using errcode = '22023';
  end if;

  update notifications_queue
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = 'recipient_cancelled'
   where id = p_queue_id
  returning * into v_after;

  perform public._audit('reminder_cancelled', v_before.entity_type, v_before.entity_id,
    to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_cancel_my_pending_reminder(bigint) is
  'Recipient cancels their own pending reminder. No admin override — admins use rpc_cancel_reminder. Audits as reminder_cancelled with cancel_reason=recipient_cancelled.';

grant execute on function public.rpc_cancel_my_pending_reminder(bigint) to authenticated;

commit;
