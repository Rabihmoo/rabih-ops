-- Rabih Ops — notification mutes per user
-- =====================================================================
-- Allows a user to mute a notification kind. Muted kinds are excluded
-- from rpc_list_notifications and rpc_count_unread_notifications.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION.

begin;

-- 1. Mute table
create table if not exists public.user_notification_mutes (
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.user_notification_mutes is
  'Per-user muted notification kinds. Muted kinds are excluded from list + count RPCs.';

-- RLS: enable but no SELECT policies — only SECURITY DEFINER RPCs reach it
alter table public.user_notification_mutes enable row level security;

-- 2. RPC to set a mute (toggle on)
create or replace function public.rpc_mute_notification_kind(
  p_kind text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
begin
  insert into user_notification_mutes (user_id, kind)
  values (v_uid, p_kind)
  on conflict (user_id, kind) do nothing;
end;
$$;

comment on function public.rpc_mute_notification_kind(text) is
  'Mute a notification kind for the calling user. Idempotent.';

grant execute on function public.rpc_mute_notification_kind(text) to authenticated;

-- 3. RPC to clear a mute (toggle off)
create or replace function public.rpc_unmute_notification_kind(
  p_kind text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
begin
  delete from user_notification_mutes
   where user_id = v_uid and kind = p_kind;
end;
$$;

comment on function public.rpc_unmute_notification_kind(text) is
  'Unmute a notification kind for the calling user.';

grant execute on function public.rpc_unmute_notification_kind(text) to authenticated;

-- 4. RPC to list muted kinds for the calling user
create or replace function public.rpc_list_notification_mutes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(m.kind order by m.kind),
    '[]'::jsonb
  )
  from user_notification_mutes m
  where m.user_id = auth.uid();
$$;

comment on function public.rpc_list_notification_mutes() is
  'Returns a JSON array of the calling user''s muted notification kinds.';

grant execute on function public.rpc_list_notification_mutes() to authenticated;

-- 5. Update rpc_list_notifications to exclude muted kinds
create or replace function public.rpc_list_notifications(
  p_limit       int     default 50,
  p_unread_only boolean default false,
  p_channel     text    default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := public._require_auth();
  v_lim_capped int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_muted      text[];
  v_result     jsonb;
begin
  -- Load muted kinds once
  select array_agg(m.kind) into v_muted
    from user_notification_mutes m
   where m.user_id = v_uid;

  with fired as (
    select 'fired'::text         as state,
           l.id                  as log_id,
           l.queue_id            as queue_id,
           coalesce(q.kind, '(unknown)') as kind,
           q.entity_type         as entity_type,
           q.entity_id           as entity_id,
           l.channel             as channel,
           l.status              as status,
           l.error               as error,
           l.fired_at            as effective_at,
           l.fired_at            as fired_at,
           null::timestamptz     as fire_at,
           l.read_at             as read_at,
           q.payload             as payload,
           case q.entity_type
             when 'task' then (
               select to_jsonb(s) from (
                 select t.title, t.branch, t.priority, t.due_date, t.status
                   from tasks t
                  where t.id = q.entity_id and t.deleted_at is null
               ) s
             )
             when 'follow_up' then (
               select to_jsonb(s) from (
                 select f.title, f.branch, f.priority, f.due_date, f.status
                   from follow_ups f
                  where f.id = q.entity_id and f.deleted_at is null
               ) s
             )
             else null
           end as entity
      from notification_log l
      left join notifications_queue q on q.id = l.queue_id
     where l.recipient_id = v_uid
       and (p_channel is null or l.channel = p_channel)
       and (not p_unread_only or l.read_at is null)
       and (v_muted is null or coalesce(q.kind, '(unknown)') <> all(v_muted))
  ),
  pending as (
    select 'pending'::text       as state,
           null::bigint          as log_id,
           q.id                  as queue_id,
           q.kind                as kind,
           q.entity_type         as entity_type,
           q.entity_id           as entity_id,
           q.channel             as channel,
           q.status              as status,
           null::text            as error,
           q.fire_at             as effective_at,
           null::timestamptz     as fired_at,
           q.fire_at             as fire_at,
           null::timestamptz     as read_at,
           q.payload             as payload,
           case q.entity_type
             when 'task' then (
               select to_jsonb(s) from (
                 select t.title, t.branch, t.priority, t.due_date, t.status
                   from tasks t
                  where t.id = q.entity_id and t.deleted_at is null
               ) s
             )
             when 'follow_up' then (
               select to_jsonb(s) from (
                 select f.title, f.branch, f.priority, f.due_date, f.status
                   from follow_ups f
                  where f.id = q.entity_id and f.deleted_at is null
               ) s
             )
             else null
           end as entity
      from notifications_queue q
     where q.recipient_id = v_uid
       and q.status       = 'pending'
       and (p_channel is null or q.channel = p_channel)
       and not p_unread_only
       and (v_muted is null or q.kind <> all(v_muted))
  )
  select coalesce(jsonb_agg(c order by c.effective_at desc nulls last), '[]'::jsonb)
    into v_result
    from (
      select * from fired
      union all
      select * from pending
      order by effective_at desc nulls last
      limit v_lim_capped
    ) c;

  return v_result;
end;
$$;

comment on function public.rpc_list_notifications(int, boolean, text) is
  'Unified read of the caller''s notifications. Excludes muted kinds. Returns notification_log rows (state=''fired'') and notifications_queue pending rows (state=''pending'') as one jsonb array sorted newest first.';

grant execute on function public.rpc_list_notifications(int, boolean, text) to authenticated;

-- 6. Update rpc_count_unread_notifications to exclude muted kinds
create or replace function public.rpc_count_unread_notifications()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid   := public._require_auth();
  v_muted text[];
  v_count int;
begin
  select array_agg(m.kind) into v_muted
    from user_notification_mutes m
   where m.user_id = v_uid;

  select count(*)::int into v_count
    from notification_log l
    left join notifications_queue q on q.id = l.queue_id
   where l.recipient_id = v_uid
     and l.read_at is null
     and (v_muted is null or coalesce(q.kind, '(unknown)') <> all(v_muted));

  return v_count;
end;
$$;

comment on function public.rpc_count_unread_notifications() is
  'Returns the caller''s unread notification count, excluding muted kinds.';

grant execute on function public.rpc_count_unread_notifications() to authenticated;

commit;
