-- F1.2 read path — extend rpc_get_follow_up to return follow_up_events.
--
-- The migration is a single CREATE OR REPLACE; signature unchanged
-- (still returns jsonb keyed by follow_up / comments / attachments /
-- audit), now also includes `events`. Existing UI consumers ignore
-- unknown keys, so old clients keep working unchanged.
--
-- Why server-side join rather than a separate hook: keeps the detail
-- page a single round-trip (matches the existing comments/attachments
-- pattern). Adds ~3 LOC at the read-path level; no schema change.

begin;

create or replace function public.rpc_get_follow_up(
  p_follow_up_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_record      follow_ups;
  v_comments    jsonb;
  v_attachments jsonb;
  v_audit       jsonb;
  v_events      jsonb;
begin
  perform public._require_auth();

  select * into v_record from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_record is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;

  select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb)
    into v_comments
  from (
    select cc.*, u.full_name as author_name
      from comments cc
      join users u on u.id = cc.author_id
     where cc.entity_type = 'follow_up'
       and cc.entity_id = p_follow_up_id
       and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.entity_type = 'follow_up'
       and aa.entity_id = p_follow_up_id
  ) a;

  select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb)
    into v_audit
  from (
    select l.id, l.action, l.before_state, l.after_state,
           l.created_at, l.user_id,
           coalesce(u.full_name, 'system') as user_name
      from audit_log l
      left join users u on u.id = l.user_id
     where l.entity_type = 'follow_up' and l.entity_id = p_follow_up_id
     order by l.created_at desc
     limit 50
  ) al;

  -- F1.2: follow_up_events joined with users for actor display.
  -- Newest first to match the audit feed; capped at 200 so the page
  -- payload stays bounded even on chatty follow-ups.
  select coalesce(jsonb_agg(ev order by ev.created_at desc), '[]'::jsonb)
    into v_events
  from (
    select e.id, e.follow_up_id, e.kind, e.from_status, e.to_status,
           e.body, e.payload, e.created_by, e.created_at,
           coalesce(u.full_name, 'system') as actor_name
      from follow_up_events e
      left join users u on u.id = e.created_by
     where e.follow_up_id = p_follow_up_id
     order by e.created_at desc
     limit 200
  ) ev;

  return jsonb_build_object(
    'follow_up', to_jsonb(v_record),
    'comments', v_comments,
    'attachments', v_attachments,
    'audit', v_audit,
    'events', v_events
  );
end;
$$;

comment on function public.rpc_get_follow_up(uuid) is
  'Returns a follow-up with nested shared-table comments, attachments, recent (50) audit entries, and recent (200) follow_up_events rows joined with actor name. Drives the FollowUpDetail page including the F1.2 history feed.';

commit;
