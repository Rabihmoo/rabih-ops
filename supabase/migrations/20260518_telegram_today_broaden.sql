-- Rabih Ops — Telegram /today fix: was strict (due today + overdue) and
-- missed undated or future-dated open work. Switch to "my full open agenda"
-- ordered by urgency: overdue → today → urgent (any date / undated) → rest.
-- Side-band counts and footer keep their meaning.

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
  v_lines := array_append(v_lines, '📋 My open tasks');
  v_lines := array_append(v_lines, '');

  for v_row in
    select * from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and (assigned_to = v_uid or created_by = v_uid)
     order by
       -- 0: overdue, 1: due today, 2: urgent (any/no date), 3: rest
       case
         when due_date is not null and due_date < v_today then 0
         when due_date = v_today                          then 1
         when priority = 'urgent'                         then 2
         else                                                  3
       end,
       due_date asc nulls last,
       case priority when 'urgent' then 0 when 'normal' then 1 else 2 end,
       created_at desc
     limit 20
  loop
    v_count := v_count + 1;
    v_prefix := public._task_short_id(v_row.id);

    if v_row.due_date is null then
      v_due_label := 'no date';
    elsif v_row.due_date < v_today then
      v_due_label := (v_today - v_row.due_date)::text || 'd overdue';
    elsif v_row.due_date = v_today then
      v_due_label := 'today';
    else
      v_due_label := 'in ' || (v_row.due_date - v_today)::text || 'd';
    end if;

    v_lines := array_append(v_lines, format('%s  %s · %s', v_prefix, v_row.title, v_row.branch));
    v_lines := array_append(v_lines, format('   %s · %s · %s', replace(v_row.status, '_', ' '), v_row.priority, v_due_label));
  end loop;

  if v_count = 0 then
    v_lines := array_append(v_lines, '✅ No open tasks. Stay on top of it.');
  end if;

  -- Side-band counts
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
    if v_overdue   > 0 then v_lines := array_append(v_lines, format('🔴 %s overdue',                v_overdue)); end if;
    if v_fu_today  > 0 then v_lines := array_append(v_lines, format('📞 %s follow-ups due today',   v_fu_today)); end if;
    if v_critical  > 0 then v_lines := array_append(v_lines, format('🚨 %s critical findings open', v_critical)); end if;
  end if;

  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, 'Use /done <id> · /note <id> <text> · /task <title> for <branch>');
  return array_to_string(v_lines, E'\n');
end;
$$;

commit;
