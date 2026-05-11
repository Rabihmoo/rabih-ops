-- Rabih Ops — Phase G1: Global Activity Inbox (read-only aggregate RPC)
-- =====================================================================
-- One SECURITY DEFINER function returns the caller's actionable work
-- across six DB-owned sources, normalized to a single shape so the
-- frontend can merge it with Gmail / Calendar streams.
--
-- Sources:
--   * task              — open tasks (overdue / due_today / blocked / soon)
--   * follow_up         — open follow-ups (overdue / due_today / soon)
--   * purchase          — purchase_requests with overdue delivery or unpaid
--   * inspection_finding — open findings (critical or otherwise)
--   * document          — recently updated documents (severity=info)
--   * telegram          — caller's pending notifications_queue rows
--
-- Safety:
--   * Every row is filtered with `(branch is null or
--     current_user_can_access_branch(branch))`, mirroring the SELECT
--     RLS policies on each base table — no widening.
--   * Personal documents are limited to creator = auth.uid().
--   * Telegram reminders are limited to recipient_id = auth.uid().
--   * deleted_at and closed/finished statuses are excluded everywhere.
--   * No mutation — no audit_log writes.

begin;

-- =====================================================================
-- 1. _activity_severity_rank — stable sort key
-- =====================================================================

create or replace function public._activity_severity_rank(p_severity text)
returns int
language sql
immutable
as $$
  select case p_severity
    when 'critical'  then 0
    when 'overdue'   then 1
    when 'due_today' then 2
    when 'soon'      then 3
    when 'info'      then 4
    else 5
  end
$$;

comment on function public._activity_severity_rank(text) is
  'Maps severity label to a sort key (0=critical … 4=info). Used by rpc_activity_inbox to order the merged stream.';


-- =====================================================================
-- 2. rpc_activity_inbox — aggregate read-only stream
-- =====================================================================

create or replace function public.rpc_activity_inbox(
  p_limit_per_source int default 30,
  p_horizon_days     int default 7
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_today  date := current_date;
  v_result jsonb;
begin
  -- Defensive bounds so a wild caller can't blow up the page.
  if p_limit_per_source is null or p_limit_per_source < 1 then
    p_limit_per_source := 30;
  end if;
  if p_limit_per_source > 200 then
    p_limit_per_source := 200;
  end if;
  if p_horizon_days is null or p_horizon_days < 0 then
    p_horizon_days := 7;
  end if;
  if p_horizon_days > 60 then
    p_horizon_days := 60;
  end if;

  -- One SELECT per source, projected to a uniform row, then UNION ALL.
  with
  -- ----- 1. Tasks -----------------------------------------------------
  task_rows as (
    select
      'task'::text                                            as source,
      'task:' || t.id::text                                   as id,
      t.id::text                                              as native_id,
      t.title                                                 as title,
      nullif(left(coalesce(t.description, ''), 140), '')      as summary,
      t.branch                                                as branch,
      ('/tasks/' || t.id::text)                               as entity_url,
      t.created_at                                            as occurred_at,
      case when t.due_date is not null then (t.due_date::timestamptz) end as due_at,
      case
        when t.status in ('waiting_for_someone','delayed','needs_repeat') then 'due_today'
        when t.due_date is not null and t.due_date < v_today          then 'overdue'
        when t.due_date = v_today                                      then 'due_today'
        when t.due_date is not null
             and t.due_date <= (v_today + p_horizon_days)              then 'soon'
        else 'info'
      end                                                     as severity,
      false                                                   as is_unread,
      (t.status in ('waiting_for_someone','delayed','needs_repeat'))::boolean as is_blocked,
      jsonb_build_object(
        'priority',           t.priority,
        'status',             t.status,
        'category',           t.category,
        'waiting_on_label',   t.waiting_on_label,
        'assigned_to',        t.assigned_to
      )                                                       as meta
    from public.tasks t
    where t.deleted_at is null
      and coalesce(t.is_template, false) = false
      and t.status not in ('finished','archived')
      and (t.branch is null or public.current_user_can_access_branch(t.branch))
      and (
        (t.due_date is not null and t.due_date <= (v_today + p_horizon_days))
        or t.status in ('waiting_for_someone','delayed','needs_repeat')
      )
    order by
      _activity_severity_rank(
        case
          when t.status in ('waiting_for_someone','delayed','needs_repeat') then 'due_today'
          when t.due_date is not null and t.due_date < v_today          then 'overdue'
          when t.due_date = v_today                                      then 'due_today'
          when t.due_date is not null
               and t.due_date <= (v_today + p_horizon_days)              then 'soon'
          else 'info'
        end
      ) asc,
      t.due_date asc nulls last,
      t.created_at desc
    limit p_limit_per_source
  ),
  -- ----- 2. Follow-ups ------------------------------------------------
  followup_rows as (
    select
      'follow_up'::text                                       as source,
      'follow_up:' || f.id::text                              as id,
      f.id::text                                              as native_id,
      f.title                                                 as title,
      nullif(left(coalesce(f.description, ''), 140), '')      as summary,
      f.branch                                                as branch,
      ('/follow-ups/' || f.id::text)                          as entity_url,
      f.created_at                                            as occurred_at,
      (coalesce(f.snoozed_until, f.due_date)::timestamptz)    as due_at,
      case
        when coalesce(f.snoozed_until, f.due_date) is not null
             and coalesce(f.snoozed_until, f.due_date) < v_today then 'overdue'
        when coalesce(f.snoozed_until, f.due_date) = v_today     then 'due_today'
        when coalesce(f.snoozed_until, f.due_date) is not null
             and coalesce(f.snoozed_until, f.due_date)
                 <= (v_today + p_horizon_days)                    then 'soon'
        else 'info'
      end                                                     as severity,
      false                                                   as is_unread,
      false                                                   as is_blocked,
      jsonb_build_object(
        'priority',  f.priority,
        'status',    f.status,
        'category',  f.category,
        'person',    f.person
      )                                                       as meta
    from public.follow_ups f
    where f.deleted_at is null
      and f.status in ('pending','snoozed')
      and (f.branch is null or public.current_user_can_access_branch(f.branch))
      and coalesce(f.snoozed_until, f.due_date) is not null
      and coalesce(f.snoozed_until, f.due_date) <= (v_today + p_horizon_days)
    order by coalesce(f.snoozed_until, f.due_date) asc, f.created_at desc
    limit p_limit_per_source
  ),
  -- ----- 3. Purchase requests ----------------------------------------
  purchase_rows as (
    select
      'purchase'::text                                        as source,
      'purchase:' || p.id::text                               as id,
      p.id::text                                              as native_id,
      p.title                                                 as title,
      nullif(left(coalesce(p.supplier_name, ''), 140), '')    as summary,
      p.branch                                                as branch,
      ('/purchases/' || p.id::text)                           as entity_url,
      p.created_at                                            as occurred_at,
      coalesce(p.expected_delivery_date, p.reminder_date)::timestamptz as due_at,
      case
        when p.expected_delivery_date is not null
             and p.expected_delivery_date < v_today
             and p.status not in ('fully_received','cancelled') then 'overdue'
        when p.expected_delivery_date = v_today                  then 'due_today'
        when p.payment_status in ('unpaid','partial')
             and p.status not in ('cancelled')                   then 'due_today'
        when p.expected_delivery_date is not null
             and p.expected_delivery_date <= (v_today + p_horizon_days) then 'soon'
        when p.reminder_date is not null and p.reminder_date <= v_today then 'due_today'
        else 'info'
      end                                                     as severity,
      false                                                   as is_unread,
      false                                                   as is_blocked,
      jsonb_build_object(
        'status',          p.status,
        'payment_status',  p.payment_status,
        'priority',        p.priority,
        'supplier_name',   p.supplier_name,
        'total_amount',    p.total_amount,
        'currency',        p.currency
      )                                                       as meta
    from public.purchase_requests p
    where p.deleted_at is null
      and p.status not in ('fully_received','cancelled')
      and (p.branch is null or public.current_user_can_access_branch(p.branch))
      and (
        (p.expected_delivery_date is not null
          and p.expected_delivery_date <= (v_today + p_horizon_days))
        or p.payment_status in ('unpaid','partial')
        or (p.reminder_date is not null and p.reminder_date <= v_today)
      )
    order by coalesce(p.expected_delivery_date, p.reminder_date, p.created_at::date) asc, p.created_at desc
    limit p_limit_per_source
  ),
  -- ----- 4. Inspection findings --------------------------------------
  finding_rows as (
    select
      'inspection_finding'::text                              as source,
      'inspection_finding:' || fnd.id::text                   as id,
      fnd.id::text                                            as native_id,
      coalesce(left(fnd.description, 120), '(no description)') as title,
      nullif(left(coalesce(fnd.action_required, ''), 140), '') as summary,
      i.branch                                                as branch,
      ('/inspections/' || i.id::text)                         as entity_url,
      fnd.created_at                                          as occurred_at,
      case when fnd.follow_up_date is not null
           then fnd.follow_up_date::timestamptz end           as due_at,
      case
        when fnd.severity = 'critical' and fnd.status in ('open','in_progress','escalated') then 'critical'
        when fnd.status in ('open','in_progress','escalated') and fnd.follow_up_date is not null and fnd.follow_up_date < v_today then 'overdue'
        when fnd.status in ('open','in_progress','escalated') and fnd.follow_up_date = v_today then 'due_today'
        when fnd.status in ('open','in_progress','escalated') then 'due_today'
        else 'info'
      end                                                     as severity,
      false                                                   as is_unread,
      false                                                   as is_blocked,
      jsonb_build_object(
        'finding_severity', fnd.severity,
        'status',           fnd.status,
        'responsible',      fnd.responsible,
        'inspection_id',    i.id,
        'area',             i.area
      )                                                       as meta
    from public.inspection_findings fnd
    join public.inspections i on i.id = fnd.inspection_id and i.deleted_at is null
    where fnd.status in ('open','in_progress','escalated')
      and (i.branch is null or public.current_user_can_access_branch(i.branch))
    order by
      _activity_severity_rank(
        case
          when fnd.severity = 'critical' then 'critical'
          else 'due_today'
        end
      ) asc,
      fnd.follow_up_date asc nulls last,
      fnd.created_at desc
    limit p_limit_per_source
  ),
  -- ----- 5. Recent documents -----------------------------------------
  -- Personal docs are strictly limited to the creator; work docs follow
  -- branch access. Mirrors the documents RLS policy + strict-personal rule.
  document_rows as (
    select
      'document'::text                                        as source,
      'document:' || d.id::text                               as id,
      d.id::text                                              as native_id,
      d.title                                                 as title,
      nullif(left(regexp_replace(coalesce(d.body_md, ''), '\s+', ' ', 'g'), 140), '') as summary,
      d.branch                                                as branch,
      ('/documents/' || d.id::text)                           as entity_url,
      d.updated_at                                            as occurred_at,
      null::timestamptz                                       as due_at,
      'info'::text                                            as severity,
      false                                                   as is_unread,
      false                                                   as is_blocked,
      jsonb_build_object(
        'category',   d.category,
        'status',     d.status,
        'visibility', d.visibility,
        'updated_by', d.updated_by
      )                                                       as meta
    from public.documents d
    where d.deleted_at is null
      and d.status <> 'archived'
      and d.updated_at >= (now() - make_interval(days => p_horizon_days))
      and (
        (d.visibility = 'work'
          and (d.branch is null or public.current_user_can_access_branch(d.branch)))
        or (d.visibility = 'personal' and d.created_by = v_uid)
      )
    order by d.updated_at desc
    limit p_limit_per_source
  ),
  -- ----- 6. Telegram / in-app reminders (caller's own only) -----------
  telegram_rows as (
    select
      'telegram'::text                                        as source,
      'telegram:' || n.id::text                               as id,
      n.id::text                                              as native_id,
      -- Pull a human title from the linked entity if we can.
      coalesce(
        (select t.title  from public.tasks t       where t.id = n.entity_id),
        (select f.title  from public.follow_ups f  where f.id = n.entity_id),
        (n.kind || ' reminder')
      )                                                       as title,
      coalesce(n.payload->>'message',
        'Reminder: ' || n.kind)                               as summary,
      coalesce(
        (select t.branch from public.tasks t       where t.id = n.entity_id),
        (select f.branch from public.follow_ups f  where f.id = n.entity_id)
      )                                                       as branch,
      case n.entity_type
        when 'task'      then '/tasks/' || n.entity_id::text
        when 'follow_up' then '/follow-ups/' || n.entity_id::text
        else '/'
      end                                                     as entity_url,
      n.fire_at                                               as occurred_at,
      n.fire_at                                               as due_at,
      case
        when n.fire_at <= now()                          then 'due_today'
        when n.fire_at <= now() + interval '1 day'       then 'soon'
        else 'info'
      end                                                     as severity,
      true                                                    as is_unread,
      false                                                   as is_blocked,
      jsonb_build_object(
        'kind',         n.kind,
        'channel',      n.channel,
        'entity_type',  n.entity_type,
        'entity_id',    n.entity_id
      )                                                       as meta
    from public.notifications_queue n
    where n.recipient_id = v_uid
      and n.status = 'pending'
      and n.fire_at <= (now() + make_interval(days => p_horizon_days))
    order by n.fire_at asc
    limit p_limit_per_source
  ),
  -- ----- Merge -------------------------------------------------------
  unioned as (
    select * from task_rows
    union all select * from followup_rows
    union all select * from purchase_rows
    union all select * from finding_rows
    union all select * from document_rows
    union all select * from telegram_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source',       u.source,
    'id',           u.id,
    'native_id',    u.native_id,
    'title',        u.title,
    'summary',      u.summary,
    'branch',       u.branch,
    'entity_url',   u.entity_url,
    'occurred_at',  u.occurred_at,
    'due_at',       u.due_at,
    'severity',     u.severity,
    'is_unread',    u.is_unread,
    'is_blocked',   u.is_blocked,
    'meta',         u.meta
  ) order by _activity_severity_rank(u.severity) asc,
              u.occurred_at desc),
              '[]'::jsonb)
    into v_result
  from unioned u;

  return v_result;
end;
$$;

comment on function public.rpc_activity_inbox(int, int) is
  'Read-only aggregate of the caller''s actionable work across tasks, follow-ups, purchases, findings, documents and telegram reminders. Each source is independently RLS-checked (branch access + personal-doc strictness + recipient-only telegram). Returns a sorted jsonb array of uniform ActivityItem rows. Gmail and Calendar streams are stitched in client-side.';

grant execute on function public.rpc_activity_inbox(int, int) to authenticated;

commit;
