-- Rabih Ops — Telegram fix: read RPCs were declared STABLE but the shared
-- _telegram_user() helper updates last_seen_at, which fails in PostgREST's
-- read-only transaction ("cannot execute UPDATE in a read-only transaction").
-- Drop STABLE from the five readers; they're volatile by intent.
--
-- Idempotent: replaces the function bodies in place.

begin;

create or replace function public.rpc_telegram_today(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public._telegram_user(p_chat_id);
  v_today     date := (now() at time zone 'Africa/Maputo')::date;
  v_lines     text[] := array[]::text[];
  v_count     int := 0;
  v_row       record;
  v_prefix    text;
  v_due_label text;
  v_overdue   int;
  v_fu_today  int;
  v_critical  int;
begin
  v_lines := array_append(v_lines, '📋 Today');
  v_lines := array_append(v_lines, '');

  for v_row in
    select * from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and (assigned_to = v_uid or created_by = v_uid)
       and (due_date = v_today
         or (due_date is not null and due_date < v_today))
     order by
       case when due_date is not null and due_date < v_today then 0 else 1 end,
       due_date asc nulls last,
       case priority when 'urgent' then 0 when 'normal' then 1 else 2 end
     limit 20
  loop
    v_count := v_count + 1;
    v_prefix := public._task_short_id(v_row.id);
    if v_row.due_date < v_today then
      v_due_label := (v_today - v_row.due_date)::text || 'd overdue';
    else
      v_due_label := 'today';
    end if;
    v_lines := array_append(v_lines, format('%s  %s · %s', v_prefix, v_row.title, v_row.branch));
    v_lines := array_append(v_lines, format('   %s · %s', v_row.priority, v_due_label));
  end loop;

  if v_count = 0 then
    v_lines := array_append(v_lines, '✅ Nothing due today, nothing overdue.');
  end if;

  select count(*) into v_overdue from tasks
   where deleted_at is null and is_template = false
     and status not in ('finished','archived')
     and (assigned_to = v_uid or created_by = v_uid)
     and due_date < v_today;

  select count(*) into v_fu_today from follow_ups
   where deleted_at is null
     and (assigned_to = v_uid or created_by = v_uid)
     and status not in ('done','cancelled')
     and coalesce(snoozed_until, due_date) = v_today;

  select count(*) into v_critical from inspection_findings f
    join inspections i on i.id = f.inspection_id
   where f.severity = 'critical'
     and f.status in ('open','in_progress')
     and i.deleted_at is null;

  if v_overdue > 0 or v_fu_today > 0 or v_critical > 0 then
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, '—');
    if v_overdue   > 0 then v_lines := array_append(v_lines, format('🔴 %s overdue', v_overdue)); end if;
    if v_fu_today  > 0 then v_lines := array_append(v_lines, format('📞 %s follow-ups due today', v_fu_today)); end if;
    if v_critical  > 0 then v_lines := array_append(v_lines, format('🚨 %s critical findings open', v_critical)); end if;
  end if;

  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, 'Use /done <id> · /note <id> <text> · /task <title> for <branch>');
  return array_to_string(v_lines, E'\n');
end;
$$;


create or replace function public.rpc_telegram_overdue(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._telegram_user(p_chat_id);
  v_today  date := (now() at time zone 'Africa/Maputo')::date;
  v_lines  text[] := array['🔴 Overdue tasks',''];
  v_count  int := 0;
  v_row    record;
begin
  for v_row in
    select * from tasks
     where deleted_at is null and is_template = false
       and status not in ('finished','archived')
       and (assigned_to = v_uid or created_by = v_uid)
       and due_date < v_today
     order by due_date asc, case priority when 'urgent' then 0 when 'normal' then 1 else 2 end
     limit 50
  loop
    v_count := v_count + 1;
    v_lines := array_append(v_lines,
      format('%s  %s · %s · %sd overdue',
             public._task_short_id(v_row.id), v_row.title, v_row.branch,
             v_today - v_row.due_date));
  end loop;
  if v_count = 0 then
    v_lines := array_append(v_lines, '✅ Nothing overdue.');
  end if;
  return array_to_string(v_lines, E'\n');
end;
$$;


create or replace function public.rpc_telegram_waiting(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._telegram_user(p_chat_id);
  v_lines text[] := array['⏸  Waiting / Delayed / Needs repeat',''];
  v_count int := 0;
  v_row   record;
begin
  for v_row in
    select * from tasks
     where deleted_at is null and is_template = false
       and status in ('waiting_for_someone','delayed','needs_repeat')
       and (assigned_to = v_uid or created_by = v_uid)
     order by
       case status when 'delayed' then 0 when 'needs_repeat' then 1 else 2 end,
       due_date asc nulls last
     limit 50
  loop
    v_count := v_count + 1;
    v_lines := array_append(v_lines,
      format('%s  %s · %s · %s',
        public._task_short_id(v_row.id),
        v_row.title,
        v_row.branch,
        replace(v_row.status, '_', ' ')));
    if v_row.status = 'waiting_for_someone' and v_row.waiting_on_label is not null then
      v_lines := array_append(v_lines, format('   → waiting on %s', v_row.waiting_on_label));
    elsif v_row.status = 'delayed' and v_row.delay_reason is not null then
      v_lines := array_append(v_lines, format('   ↳ %s', v_row.delay_reason));
    elsif v_row.status = 'needs_repeat' and v_row.repeat_reason is not null then
      v_lines := array_append(v_lines, format('   ↳ %s', v_row.repeat_reason));
    end if;
  end loop;
  if v_count = 0 then
    v_lines := array_append(v_lines, '✅ Nothing blocked.');
  end if;
  return array_to_string(v_lines, E'\n');
end;
$$;


create or replace function public.rpc_telegram_purchases(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._telegram_user(p_chat_id);
  v_today date := (now() at time zone 'Africa/Maputo')::date;
  v_lines text[] := array['💰 Purchasing',''];
  v_n_pending int; v_n_unpaid int; v_n_reminders int;
  v_row record;
begin
  select count(*) into v_n_pending from purchase_requests
   where deleted_at is null
     and status in ('ordered','partially_received');
  select count(*) into v_n_unpaid from purchase_requests
   where deleted_at is null
     and status in ('partially_received','fully_received')
     and payment_status in ('unpaid','partial');
  select count(*) into v_n_reminders from purchase_requests
   where deleted_at is null
     and reminder_date = v_today;

  if v_n_pending = 0 and v_n_unpaid = 0 and v_n_reminders = 0 then
    v_lines := array_append(v_lines, '✅ All quiet on purchasing.');
    return array_to_string(v_lines, E'\n');
  end if;

  if v_n_pending > 0 then
    v_lines := array_append(v_lines, format('📦 %s pending deliveries', v_n_pending));
    for v_row in
      select * from purchase_requests
       where deleted_at is null and status in ('ordered','partially_received')
       order by expected_delivery_date nulls last
       limit 10
    loop
      v_lines := array_append(v_lines, format('   · %s · %s', v_row.title, v_row.supplier_name));
    end loop;
    v_lines := array_append(v_lines, '');
  end if;

  if v_n_unpaid > 0 then
    v_lines := array_append(v_lines, format('💸 %s unpaid', v_n_unpaid));
    for v_row in
      select * from purchase_requests
       where deleted_at is null
         and status in ('partially_received','fully_received')
         and payment_status in ('unpaid','partial')
       order by expected_delivery_date nulls last
       limit 10
    loop
      v_lines := array_append(v_lines, format('   · %s · %s %s', v_row.title, v_row.total_amount, v_row.currency));
    end loop;
    v_lines := array_append(v_lines, '');
  end if;

  if v_n_reminders > 0 then
    v_lines := array_append(v_lines, format('🔔 %s reminders today', v_n_reminders));
    for v_row in
      select * from purchase_requests
       where deleted_at is null and reminder_date = v_today
       limit 10
    loop
      v_lines := array_append(v_lines, format('   · %s · %s', v_row.title, v_row.supplier_name));
    end loop;
  end if;

  return array_to_string(v_lines, E'\n');
end;
$$;


create or replace function public.rpc_telegram_daily_summary(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._telegram_user(p_chat_id);
  v_today date := (now() at time zone 'Africa/Maputo')::date;
  v_lines text[] := array[]::text[];
  v_n_overdue int; v_n_today int; v_n_waiting int; v_n_delayed int;
  v_n_repeat int; v_n_fu int; v_n_critical int;
  v_n_pending int; v_n_unpaid int; v_n_reminders int;
begin
  v_lines := array_append(v_lines, format('☀️  Good morning — %s', to_char(v_today, 'Day, Mon DD')));
  v_lines := array_append(v_lines, '');

  select count(*) into v_n_overdue from tasks
    where deleted_at is null and is_template = false
      and status not in ('finished','archived')
      and (assigned_to = v_uid or created_by = v_uid)
      and due_date < v_today;

  select count(*) into v_n_today from tasks
    where deleted_at is null and is_template = false
      and status not in ('finished','archived')
      and (assigned_to = v_uid or created_by = v_uid)
      and due_date = v_today;

  select count(*) into v_n_waiting from tasks
    where deleted_at is null and is_template = false
      and status = 'waiting_for_someone'
      and (assigned_to = v_uid or created_by = v_uid);

  select count(*) into v_n_delayed from tasks
    where deleted_at is null and is_template = false
      and status = 'delayed'
      and (assigned_to = v_uid or created_by = v_uid);

  select count(*) into v_n_repeat from tasks
    where deleted_at is null and is_template = false
      and status = 'needs_repeat'
      and (assigned_to = v_uid or created_by = v_uid);

  select count(*) into v_n_fu from follow_ups
    where deleted_at is null
      and (assigned_to = v_uid or created_by = v_uid)
      and status not in ('done','cancelled')
      and coalesce(snoozed_until, due_date) = v_today;

  select count(*) into v_n_critical from inspection_findings f
    join inspections i on i.id = f.inspection_id
    where f.severity = 'critical'
      and f.status in ('open','in_progress')
      and i.deleted_at is null;

  select count(*) into v_n_pending from purchase_requests
    where deleted_at is null and status in ('ordered','partially_received');
  select count(*) into v_n_unpaid from purchase_requests
    where deleted_at is null
      and status in ('partially_received','fully_received')
      and payment_status in ('unpaid','partial');
  select count(*) into v_n_reminders from purchase_requests
    where deleted_at is null and reminder_date = v_today;

  v_lines := array_append(v_lines, '📋 Tasks');
  if v_n_overdue + v_n_today + v_n_waiting + v_n_delayed + v_n_repeat = 0 then
    v_lines := array_append(v_lines, '   ✅ all clear');
  else
    if v_n_overdue > 0 then v_lines := array_append(v_lines, format('   🔴 %s overdue', v_n_overdue)); end if;
    if v_n_today   > 0 then v_lines := array_append(v_lines, format('   🟡 %s due today', v_n_today)); end if;
    if v_n_waiting > 0 then v_lines := array_append(v_lines, format('   ⏸  %s waiting', v_n_waiting)); end if;
    if v_n_delayed > 0 then v_lines := array_append(v_lines, format('   ⏳ %s delayed', v_n_delayed)); end if;
    if v_n_repeat  > 0 then v_lines := array_append(v_lines, format('   🔁 %s needs repeat', v_n_repeat)); end if;
  end if;

  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '📞 Follow-ups today: ' || v_n_fu::text);
  v_lines := array_append(v_lines, '🚨 Critical findings open: ' || v_n_critical::text);
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '💰 Purchasing');
  v_lines := array_append(v_lines, format('   📦 %s pending deliveries', v_n_pending));
  v_lines := array_append(v_lines, format('   💸 %s unpaid', v_n_unpaid));
  v_lines := array_append(v_lines, format('   🔔 %s reminders today', v_n_reminders));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, 'Reply /today for the actionable list.');

  return array_to_string(v_lines, E'\n');
end;
$$;

commit;
