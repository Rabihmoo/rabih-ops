-- Rabih Ops — Telegram /today /overdue /waiting now show numbered tasks
-- (1, 2, 3 …) instead of 8-char hex IDs. The bot remembers the list it
-- last showed each chat, so /done 1 maps to "the first task you saw".
--
-- New columns on telegram_chats:
--   last_list_ids   uuid[]   — ordered task ids of the most recent list view
--   last_list_at    timestamptz
--
-- New helper _telegram_remember_list(chat_id, ids).
-- _resolve_task_id(chat_id, input) handles both:
--   * integer position    /done 1
--   * hex prefix (≥4)     /done a2b2b4d9
-- The write RPCs (complete_task, add_note) call the new resolver.

begin;

-- =========================================================
-- 1. Schema additions
-- =========================================================

alter table public.telegram_chats add column if not exists last_list_ids uuid[];
alter table public.telegram_chats add column if not exists last_list_at  timestamptz;

comment on column public.telegram_chats.last_list_ids is
  'Ordered task ids from the last /today /overdue /waiting reply. Lets /done 1 resolve "the first task you saw".';

-- =========================================================
-- 2. Remember-list helper
-- =========================================================

create or replace function public._telegram_remember_list(
  p_chat_id bigint,
  p_ids     uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update telegram_chats
     set last_list_ids = p_ids,
         last_list_at  = now()
   where tg_chat_id = p_chat_id and is_active = true;
end;
$$;

-- =========================================================
-- 3. _resolve_task_id (replaces short-id resolver path; old one kept)
-- =========================================================

create or replace function public._resolve_task_id(
  p_chat_id bigint,
  p_user_id uuid,
  p_input   text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos    int;
  v_chat   telegram_chats;
  v_id     uuid;
  v_max    int;
  v_input  text := btrim(coalesce(p_input, ''));
  v_ids    uuid[];
begin
  if length(v_input) = 0 then
    raise exception 'Task number is required. Run /today first, then /done <number>.'
      using errcode = '22023';
  end if;

  -- Numeric path: positional lookup against the chat's last list.
  if v_input ~ '^\d+$' then
    v_pos := v_input::int;
    if v_pos < 1 then
      raise exception 'Task number must be 1 or higher.' using errcode = '22023';
    end if;
    select * into v_chat
      from telegram_chats
     where tg_chat_id = p_chat_id and is_active = true;
    v_ids := v_chat.last_list_ids;
    v_max := coalesce(array_length(v_ids, 1), 0);
    if v_max = 0 then
      raise exception 'No recent list to pick from. Run /today first, then /done <number>.'
        using errcode = '22023';
    end if;
    if v_pos > v_max then
      raise exception 'Task #% is out of range — your last list had % task(s). Run /today to refresh.', v_pos, v_max
        using errcode = '22023';
    end if;
    v_id := v_ids[v_pos];

    -- Confirm the task is still open and visible to the user.
    if not exists (
      select 1 from tasks
       where id = v_id
         and deleted_at is null
         and is_template = false
         and status not in ('finished','archived')
         and (assigned_to = p_user_id or created_by = p_user_id)
    ) then
      raise exception 'Task #% is no longer open. Run /today for the current list.', v_pos
        using errcode = '22023';
    end if;
    return v_id;
  end if;

  -- Hex prefix path (back-compat).
  if v_input ~ '^[0-9a-fA-F]{4,}$' then
    return public._resolve_task_short_id(p_user_id, v_input);
  end if;

  raise exception 'I don''t recognise "%". Try /done 1 or /done <8-char hex id>.', v_input
    using errcode = '22023';
end;
$$;

-- =========================================================
-- 4. New per-task block (numbered, no ID line)
-- =========================================================

create or replace function public._telegram_task_line(p_task_id uuid, p_n int)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v        tasks;
  v_branch text;
  v_today  date := (now() at time zone 'Africa/Maputo')::date;
  v_due    text;
  v_status text;
  v_pri    text;
  v_emoji  text;
  v_lines  text[] := array[]::text[];
  v_desc   text;
begin
  select * into v from tasks where id = p_task_id;
  select name into v_branch from branches where code = v.branch;
  v_branch := coalesce(v_branch, v.branch);

  v_status := case v.status
    when 'not_started'         then 'Not started'
    when 'started'             then 'Started'
    when 'working'             then 'Working on it'
    when 'waiting_for_someone' then 'Waiting on ' || coalesce(v.waiting_on_label, 'someone')
    when 'delayed'             then 'Delayed — ' || coalesce(v.delay_reason, 'no reason recorded')
    when 'needs_repeat'        then 'Needs repeat — ' || coalesce(v.repeat_reason, 'no reason recorded')
    else v.status
  end;

  v_pri := case v.priority
    when 'urgent' then 'Urgent'
    when 'normal' then 'Normal'
    when 'low'    then 'Low'
    else v.priority
  end;

  v_due := case
    when v.due_date is null       then 'No due date'
    when v.due_date < v_today     then to_char(v.due_date, 'Mon FMDD') || ' (' || (v_today - v.due_date)::text || ' days overdue)'
    when v.due_date = v_today     then 'Today'
    when v.due_date = v_today + 1 then 'Tomorrow'
    else to_char(v.due_date, 'Mon FMDD') || ' (in ' || (v.due_date - v_today)::text || ' days)'
  end;

  v_emoji := case
    when v.status = 'delayed'             then '🔴'
    when v.status = 'needs_repeat'        then '🔁'
    when v.status = 'waiting_for_someone' then '⏳'
    when v.due_date is not null and v.due_date < v_today then '🔴'
    when v.priority = 'urgent'            then '🔴'
    when v.due_date = v_today             then '🟡'
    when v.status = 'working'             then '🟡'
    else '🟢'
  end;

  v_lines := array_append(v_lines, format('%s. %s %s', p_n, v_emoji, v.title));
  v_lines := array_append(v_lines, format('   %s · %s · %s', v_branch, v_status, v_pri));
  v_lines := array_append(v_lines, format('   Due: %s', v_due));

  if v.description is not null and length(btrim(v.description)) > 0 then
    v_desc := substring(btrim(v.description), 1, 160);
    if length(btrim(v.description)) > 160 then v_desc := v_desc || '…'; end if;
    v_lines := array_append(v_lines, format('   Note: %s', v_desc));
  end if;

  return array_to_string(v_lines, E'\n');
end;
$$;

-- =========================================================
-- 5. /today — numbered list, remembers it, no IDs visible
-- =========================================================

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
  v_blocks    text[] := array[]::text[];
  v_ids       uuid[] := array[]::uuid[];
  v_count     int := 0;
  v_row       record;
  v_overdue   int;
  v_fu_today  int;
  v_critical  int;
begin
  for v_row in
    select * from tasks
     where deleted_at is null and is_template = false
       and status not in ('finished','archived')
       and (assigned_to = v_uid or created_by = v_uid)
     order by
       case
         when due_date is not null and due_date < v_today then 0
         when due_date = v_today                          then 1
         when priority = 'urgent'                         then 2
         else                                                  3
       end,
       due_date asc nulls last,
       case priority when 'urgent' then 0 when 'normal' then 1 else 2 end,
       created_at desc
     limit 15
  loop
    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_row.id);
    v_blocks := array_append(v_blocks, public._telegram_task_line(v_row.id, v_count));
  end loop;

  perform public._telegram_remember_list(p_chat_id, v_ids);

  if v_count = 0 then
    v_lines := array_append(v_lines, '📋 Your tasks');
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, '✅ Nothing open.');
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, 'Add one with: /task <title> for <branch>');
  else
    v_lines := array_append(v_lines, format('📋 Your open tasks (%s)', v_count));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, array_to_string(v_blocks, E'\n\n'));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, '— How to act —');
    v_lines := array_append(v_lines, '/done 1            mark task #1 finished');
    v_lines := array_append(v_lines, '/note 1 your text  add a note to task #1');
  end if;

  -- Side-band counts (always show; gives a complete picture)
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

  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '— Other things —');
  v_lines := array_append(v_lines, format('• %s tasks overdue',                v_overdue));
  v_lines := array_append(v_lines, format('• %s follow-ups due today',          v_fu_today));
  v_lines := array_append(v_lines, format('• %s critical inspection findings',  v_critical));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '/overdue  /waiting  /purchases  /help');

  return array_to_string(v_lines, E'\n');
end;
$$;

-- =========================================================
-- 6. /overdue — numbered, remembers list
-- =========================================================

create or replace function public.rpc_telegram_overdue(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._telegram_user(p_chat_id);
  v_today  date := (now() at time zone 'Africa/Maputo')::date;
  v_blocks text[] := array[]::text[];
  v_ids    uuid[] := array[]::uuid[];
  v_count  int := 0;
  v_row    record;
  v_lines  text[] := array[]::text[];
begin
  for v_row in
    select * from tasks
     where deleted_at is null and is_template = false
       and status not in ('finished','archived')
       and (assigned_to = v_uid or created_by = v_uid)
       and due_date < v_today
     order by due_date asc, case priority when 'urgent' then 0 when 'normal' then 1 else 2 end
     limit 20
  loop
    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_row.id);
    v_blocks := array_append(v_blocks, public._telegram_task_line(v_row.id, v_count));
  end loop;

  perform public._telegram_remember_list(p_chat_id, v_ids);

  if v_count = 0 then
    return E'🔴 Overdue\n\n✅ Nothing overdue. Stay on top of it.\n\n/today  /waiting  /purchases  /help';
  end if;

  v_lines := array_append(v_lines, format('🔴 Overdue tasks (%s)', v_count));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, array_to_string(v_blocks, E'\n\n'));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '— How to act —');
  v_lines := array_append(v_lines, '/done 1            mark task #1 finished');
  v_lines := array_append(v_lines, '/note 1 your text  add a note to task #1');
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '/today  /waiting  /purchases  /help');

  return array_to_string(v_lines, E'\n');
end;
$$;

-- =========================================================
-- 7. /waiting — numbered, remembers list
-- =========================================================

create or replace function public.rpc_telegram_waiting(p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._telegram_user(p_chat_id);
  v_blocks text[] := array[]::text[];
  v_ids    uuid[] := array[]::uuid[];
  v_count  int := 0;
  v_row    record;
  v_lines  text[] := array[]::text[];
begin
  for v_row in
    select * from tasks
     where deleted_at is null and is_template = false
       and status in ('waiting_for_someone','delayed','needs_repeat')
       and (assigned_to = v_uid or created_by = v_uid)
     order by
       case status when 'delayed' then 0 when 'needs_repeat' then 1 else 2 end,
       due_date asc nulls last
     limit 20
  loop
    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_row.id);
    v_blocks := array_append(v_blocks, public._telegram_task_line(v_row.id, v_count));
  end loop;

  perform public._telegram_remember_list(p_chat_id, v_ids);

  if v_count = 0 then
    return E'⏳ Blocked work\n\n✅ Nothing waiting, delayed, or flagged for repeat.\n\n/today  /overdue  /purchases  /help';
  end if;

  v_lines := array_append(v_lines, format('⏳ Blocked work (%s)', v_count));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, 'These tasks need a decision or someone else''s action.');
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, array_to_string(v_blocks, E'\n\n'));
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '— How to act —');
  v_lines := array_append(v_lines, '/done 1   mark task #1 finished when unblocked');
  v_lines := array_append(v_lines, '');
  v_lines := array_append(v_lines, '/today  /overdue  /purchases  /help');

  return array_to_string(v_lines, E'\n');
end;
$$;

-- =========================================================
-- 8. /done /note — use the new resolver
-- =========================================================

create or replace function public.rpc_telegram_complete_task(
  p_chat_id      bigint,
  p_id_or_prefix text,
  p_outcome      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public._telegram_user(p_chat_id);
  v_task_id uuid;
  v_before  tasks;
  v_after   tasks;
  v_branch  text;
begin
  v_task_id := public._resolve_task_id(p_chat_id, v_uid, p_id_or_prefix);

  select * into v_before from tasks where id = v_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'Task is no longer open. Run /today for the current list.' using errcode = 'P0002';
  end if;

  update tasks
     set status        = 'finished',
         completed_at  = coalesce(completed_at, now()),
         outcome       = coalesce(nullif(btrim(p_outcome), ''), outcome)
   where id = v_task_id
  returning * into v_after;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (v_uid, 'complete', 'task', v_task_id, to_jsonb(v_before), to_jsonb(v_after), 'telegram');

  select name into v_branch from branches where code = v_after.branch;
  return array_to_string(array[
    '✅ Task finished',
    '',
    format('   %s', v_after.title),
    format('   Branch:  %s', coalesce(v_branch, v_after.branch)),
    case when v_after.outcome is not null
      then format('   Outcome: %s', v_after.outcome)
      else '' end,
    '',
    'It''s in your task history now. /today shows what''s still open.'
  ], E'\n');
end;
$$;


create or replace function public.rpc_telegram_add_note(
  p_chat_id      bigint,
  p_id_or_prefix text,
  p_body         text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public._telegram_user(p_chat_id);
  v_task_id uuid;
  v_task    tasks;
  v_row     comments;
  v_branch  text;
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Note text is required. Try: /note 1 your note here' using errcode = '22023';
  end if;
  v_task_id := public._resolve_task_id(p_chat_id, v_uid, p_id_or_prefix);
  select * into v_task from tasks where id = v_task_id;
  select name into v_branch from branches where code = v_task.branch;

  insert into comments(entity_type, entity_id, author_id, body)
  values ('task', v_task_id, v_uid, btrim(p_body))
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'comment', 'task', v_task_id, to_jsonb(v_row), 'telegram');

  return array_to_string(array[
    '💬 Note added',
    '',
    format('   %s', v_task.title),
    format('   Branch: %s', coalesce(v_branch, v_task.branch)),
    format('   Note:   %s', btrim(p_body)),
    '',
    'Run /today again to see your list.'
  ], E'\n');
end;
$$;

-- =========================================================
-- 9. /task — leaner reply, no ID line
-- =========================================================

create or replace function public.rpc_telegram_create_task(
  p_chat_id  bigint,
  p_title    text,
  p_branch   text,
  p_priority text default 'normal',
  p_due_date date default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._telegram_user(p_chat_id);
  v_row tasks;
  v_branch_name text;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Title is required. Try: /task <title> for <branch>' using errcode = '22023';
  end if;
  if p_branch is null or length(btrim(p_branch)) = 0 then
    raise exception 'Branch is required. Try: /task <title> for <branch>. Branches: bbqhouse, salt, centralkitchen, cleaning'
      using errcode = '22023';
  end if;
  if not exists (select 1 from branches where code = lower(btrim(p_branch))) then
    raise exception 'Unknown branch "%". Branches: bbqhouse, salt, centralkitchen, cleaning', p_branch
      using errcode = '22023';
  end if;

  insert into tasks(
    title, branch, category, priority, due_date, assigned_to, created_by, status
  ) values (
    btrim(p_title), lower(btrim(p_branch)), 'other',
    coalesce(p_priority, 'normal'),
    p_due_date, v_uid, v_uid, 'not_started'
  )
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'create', 'task', v_row.id, to_jsonb(v_row), 'telegram');

  select name into v_branch_name from branches where code = v_row.branch;

  return array_to_string(array[
    '✅ Task created',
    '',
    format('   %s', v_row.title),
    format('   Branch:   %s', coalesce(v_branch_name, v_row.branch)),
    format('   Priority: %s', initcap(v_row.priority)),
    '',
    'Run /today to see it in your list, then /done <number> when finished.'
  ], E'\n');
end;
$$;

commit;
