-- Rabih Ops — Phase C: Telegram bot module
-- =====================================================================
-- Tables:
--   * telegram_chats        per-user link state (pending or active)
--   * telegram_messages     append-only inbound/outbound log
--
-- Status enum widened on notifications_queue:
--   pending|sent|dismissed|cancelled|failed → adds 'dispatching'
--   so claimed-but-not-yet-sent telegram rows can't be re-claimed by a
--   duplicate cron tick.
--
-- 18 RPCs:
--   Web (granted to authenticated):
--     rpc_telegram_request_link
--     rpc_telegram_unlink_self
--     rpc_telegram_link_status
--   Service-role (no grant — Edge Function only):
--     rpc_telegram_complete_link, rpc_telegram_unlink, rpc_telegram_log,
--     rpc_telegram_today, rpc_telegram_overdue, rpc_telegram_waiting,
--     rpc_telegram_purchases, rpc_telegram_daily_summary,
--     rpc_telegram_complete_task, rpc_telegram_add_note,
--     rpc_telegram_create_task, rpc_claim_telegram_reminders,
--     rpc_mark_telegram_reminder_sent, rpc_mark_telegram_reminder_failed,
--     rpc_list_active_telegram_chats
--
-- pg_net + pg_cron schedule the telegram-tick Edge Function every minute.
-- Vault stores the URL + internal shared secret; populated by
-- scripts/telegram-setup.mjs at deploy time. Cron command short-circuits
-- if Vault is empty.

begin;

-- =========================================================
-- 0. Extensions
-- =========================================================

create extension if not exists pg_net with schema extensions;

-- =========================================================
-- 1. Widen notifications_queue.status to include 'dispatching'
-- =========================================================

alter table public.notifications_queue drop constraint if exists notifications_queue_status_check;
alter table public.notifications_queue add constraint notifications_queue_status_check
  check (status in ('pending','sent','dismissed','cancelled','failed','dispatching'));

-- =========================================================
-- 2. telegram_chats
-- =========================================================

create table if not exists public.telegram_chats (
  id                     bigserial primary key,
  user_id                uuid not null references public.users(id) on delete cascade,
  tg_chat_id             bigint,
  tg_username            text,
  tg_first_name          text,
  is_active              boolean not null default false,
  link_token             text,
  link_token_expires_at  timestamptz,
  linked_at              timestamptz,
  last_seen_at           timestamptz,
  created_at             timestamptz not null default now()
);

comment on table  public.telegram_chats is
  'One row per Telegram link attempt. is_active=true is the live binding; is_active=false rows are pending tokens or historical (post-unlink).';
comment on column public.telegram_chats.tg_chat_id is
  'Telegram private chat id. Nullable until /start <token> activates the row.';
comment on column public.telegram_chats.link_token is
  '8-char hex token issued by rpc_telegram_request_link, valid for 15 minutes. Cleared when the bot redeems it via /start.';

-- One active chat per user
drop index if exists public.uq_telegram_chats_active_user;
create unique index uq_telegram_chats_active_user
  on public.telegram_chats (user_id) where is_active = true;

-- One active chat per Telegram chat_id (historical rows can coexist)
drop index if exists public.uq_telegram_chats_active_chat;
create unique index uq_telegram_chats_active_chat
  on public.telegram_chats (tg_chat_id)
  where is_active = true and tg_chat_id is not null;

-- Pending tokens unique
drop index if exists public.uq_telegram_chats_pending_token;
create unique index uq_telegram_chats_pending_token
  on public.telegram_chats (link_token)
  where link_token is not null and is_active = false;

-- =========================================================
-- 3. telegram_messages
-- =========================================================

create table if not exists public.telegram_messages (
  id              bigserial primary key,
  tg_chat_id      bigint not null,
  user_id         uuid references public.users(id),
  direction       text not null check (direction in ('inbound','outbound')),
  message_text    text not null,
  parsed_command  text,
  parsed_params   jsonb,
  response_text   text,
  error           text,
  created_at      timestamptz not null default now()
);

comment on table public.telegram_messages is
  'Append-only Telegram conversation log; mirrors whatsapp_messages structure.';

create index if not exists idx_telegram_messages_chat_created
  on public.telegram_messages (tg_chat_id, created_at desc);

-- =========================================================
-- 4. RLS — SELECT only
-- =========================================================

alter table public.telegram_chats    enable row level security;
alter table public.telegram_messages enable row level security;

drop policy if exists telegram_chats_select_visible on public.telegram_chats;
create policy telegram_chats_select_visible on public.telegram_chats
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('admin','ceo')
  );

drop policy if exists telegram_messages_select_visible on public.telegram_messages;
create policy telegram_messages_select_visible on public.telegram_messages
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('admin','ceo')
  );

-- =========================================================
-- 5. Internal helpers
-- =========================================================

-- Resolve user from chat. Updates last_seen_at as a side effect.
create or replace function public._telegram_user(p_chat_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  update telegram_chats
     set last_seen_at = now()
   where tg_chat_id = p_chat_id and is_active = true
  returning user_id into v_uid;
  if v_uid is null then
    raise exception 'telegram chat % is not linked to a RabihOS account', p_chat_id
      using errcode = 'P0002';
  end if;
  return v_uid;
end;
$$;

-- Resolve a task short-id (UUID prefix) against a user's open tasks.
-- Raises if 0 or >1 matches; returns the matching uuid otherwise.
create or replace function public._resolve_task_short_id(
  p_user_id uuid,
  p_prefix  text
) returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_prefix is null or length(btrim(p_prefix)) < 4 then
    raise exception 'short id must be at least 4 characters' using errcode = '22023';
  end if;

  select array_agg(id)
    into v_ids
    from tasks
   where deleted_at is null
     and is_template = false
     and status not in ('finished','archived')
     and (assigned_to = p_user_id or created_by = p_user_id)
     and id::text like btrim(p_prefix) || '%';

  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'No matching open task' using errcode = 'P0002';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'Multiple matches — try more characters' using errcode = '22023';
  end if;
  return v_ids[1];
end;
$$;

-- Compose a short-id (first 8 chars of UUID) for display.
create or replace function public._task_short_id(p_id uuid)
returns text language sql immutable as $$ select substring(p_id::text, 1, 8) $$;

-- =========================================================
-- 6. Link lifecycle
-- =========================================================

create or replace function public.rpc_telegram_request_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_token  text;
  v_row    telegram_chats;
begin
  -- Wipe any stale pending rows for this user.
  delete from telegram_chats
   where user_id = v_uid and is_active = false;

  -- 8-char hex token from gen_random_bytes (pgcrypto)
  v_token := encode(extensions.gen_random_bytes(4), 'hex');

  insert into telegram_chats(user_id, link_token, link_token_expires_at)
  values (v_uid, v_token, now() + interval '15 minutes')
  returning * into v_row;

  return jsonb_build_object(
    'token', v_row.link_token,
    'expires_at', v_row.link_token_expires_at
  );
end;
$$;

comment on function public.rpc_telegram_request_link() is
  'Issues an 8-char link token valid for 15 minutes. Caller is the user; deep-link URL is built client-side from VITE_TELEGRAM_BOT_USERNAME.';

grant execute on function public.rpc_telegram_request_link() to authenticated;


create or replace function public.rpc_telegram_complete_link(
  p_token        text,
  p_chat_id      bigint,
  p_username     text default null,
  p_first_name   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending telegram_chats;
  v_active  telegram_chats;
begin
  if p_token is null or p_chat_id is null then
    raise exception 'token and chat_id are required' using errcode = '22023';
  end if;

  select * into v_pending
    from telegram_chats
   where link_token = p_token
     and is_active = false
     and link_token_expires_at > now();

  if v_pending is null then
    raise exception 'invalid or expired link token' using errcode = '22023';
  end if;

  -- Free up tg_chat_id from any other historical row.
  delete from telegram_chats
   where tg_chat_id = p_chat_id and id <> v_pending.id;

  -- Deactivate any prior active row for the same user.
  update telegram_chats
     set is_active = false
   where user_id = v_pending.user_id and is_active = true and id <> v_pending.id;

  update telegram_chats
     set tg_chat_id           = p_chat_id,
         tg_username          = p_username,
         tg_first_name        = p_first_name,
         is_active            = true,
         linked_at            = now(),
         link_token           = null,
         link_token_expires_at = null,
         last_seen_at         = now()
   where id = v_pending.id
  returning * into v_active;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_active.user_id, 'telegram_link', 'telegram_chat', null,
          jsonb_build_object('chat_id', p_chat_id, 'username', p_username),
          'telegram');

  return to_jsonb(v_active);
end;
$$;

comment on function public.rpc_telegram_complete_link(text, bigint, text, text) is
  'Edge Function only. Validates the pending token and activates the chat row, deactivating any prior active row for the same user.';


create or replace function public.rpc_telegram_unlink_self()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before telegram_chats;
begin
  select * into v_before
    from telegram_chats
   where user_id = v_uid and is_active = true;
  if v_before is null then
    return jsonb_build_object('success', false, 'message', 'no active link');
  end if;

  update telegram_chats set is_active = false where id = v_before.id;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'telegram_unlink', 'telegram_chat', null,
          jsonb_build_object('chat_id', v_before.tg_chat_id), 'web');

  return jsonb_build_object('success', true, 'chat_id', v_before.tg_chat_id);
end;
$$;

comment on function public.rpc_telegram_unlink_self() is
  'Web caller unlinks their own active Telegram chat.';

grant execute on function public.rpc_telegram_unlink_self() to authenticated;


create or replace function public.rpc_telegram_unlink(p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before telegram_chats;
begin
  select * into v_before
    from telegram_chats
   where tg_chat_id = p_chat_id and is_active = true;
  if v_before is null then
    return jsonb_build_object('success', false, 'message', 'no active link');
  end if;

  update telegram_chats set is_active = false where id = v_before.id;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_before.user_id, 'telegram_unlink', 'telegram_chat', null,
          jsonb_build_object('chat_id', p_chat_id), 'telegram');

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.rpc_telegram_unlink(bigint) is
  'Edge Function only. Unlinks the chat with the given chat_id (e.g. /unlink command from the bot).';


create or replace function public.rpc_telegram_link_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row telegram_chats;
begin
  select * into v_row
    from telegram_chats
   where user_id = v_uid and is_active = true;
  if v_row is null then
    return jsonb_build_object('linked', false);
  end if;
  return jsonb_build_object(
    'linked',         true,
    'tg_username',    v_row.tg_username,
    'tg_first_name',  v_row.tg_first_name,
    'linked_at',      v_row.linked_at,
    'last_seen_at',   v_row.last_seen_at
  );
end;
$$;

grant execute on function public.rpc_telegram_link_status() to authenticated;

-- =========================================================
-- 7. Logger
-- =========================================================

create or replace function public.rpc_telegram_log(
  p_chat_id        bigint,
  p_user_id        uuid    default null,
  p_direction      text    default 'inbound',
  p_message_text   text    default '',
  p_parsed_command text    default null,
  p_parsed_params  jsonb   default null,
  p_response_text  text    default null,
  p_error          text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into telegram_messages(
    tg_chat_id, user_id, direction, message_text,
    parsed_command, parsed_params, response_text, error
  ) values (
    p_chat_id, p_user_id, p_direction, coalesce(p_message_text,''),
    p_parsed_command, p_parsed_params, p_response_text, p_error
  );
end;
$$;

-- =========================================================
-- 8. Read endpoints (text replies)
-- =========================================================

-- Compact today snapshot.
create or replace function public.rpc_telegram_today(p_chat_id bigint)
returns text
language plpgsql
stable
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
    v_lines := array_append(
      v_lines,
      format('%s  %s · %s', v_prefix, v_row.title, v_row.branch)
    );
    v_lines := array_append(
      v_lines,
      format('   %s · %s', v_row.priority, v_due_label)
    );
  end loop;

  if v_count = 0 then
    v_lines := array_append(v_lines, '✅ Nothing due today, nothing overdue.');
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
stable
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
stable
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
stable
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
  -- Pending deliveries
  select count(*) into v_n_pending from purchase_requests
   where deleted_at is null
     and status in ('ordered','partially_received');
  -- Unpaid (received but not paid)
  select count(*) into v_n_unpaid from purchase_requests
   where deleted_at is null
     and status in ('partially_received','fully_received')
     and payment_status in ('unpaid','partial');
  -- Reminders today
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
       where deleted_at is null
         and status in ('ordered','partially_received')
       order by expected_delivery_date nulls last
       limit 10
    loop
      v_lines := array_append(v_lines,
        format('   · %s · %s', v_row.title, v_row.supplier_name));
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
      v_lines := array_append(v_lines,
        format('   · %s · %s %s', v_row.title, v_row.total_amount, v_row.currency));
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
      v_lines := array_append(v_lines,
        format('   · %s · %s', v_row.title, v_row.supplier_name));
    end loop;
  end if;

  return array_to_string(v_lines, E'\n');
end;
$$;


create or replace function public.rpc_telegram_daily_summary(p_chat_id bigint)
returns text
language plpgsql
stable
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

-- =========================================================
-- 9. Write endpoints
-- =========================================================

create or replace function public.rpc_telegram_complete_task(
  p_chat_id   bigint,
  p_id_or_prefix text,
  p_outcome   text default null
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
begin
  v_task_id := public._resolve_task_short_id(v_uid, p_id_or_prefix);

  select * into v_before from tasks where id = v_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'No matching open task' using errcode = 'P0002';
  end if;

  update tasks
     set status          = 'finished',
         completed_at    = coalesce(completed_at, now()),
         outcome         = coalesce(nullif(btrim(p_outcome), ''), outcome)
   where id = v_task_id
  returning * into v_after;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (v_uid, 'complete', 'task', v_task_id,
          to_jsonb(v_before), to_jsonb(v_after), 'telegram');

  return format('✅ Finished: %s', v_after.title);
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
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'note body is required' using errcode = '22023';
  end if;
  v_task_id := public._resolve_task_short_id(v_uid, p_id_or_prefix);
  select * into v_task from tasks where id = v_task_id;

  insert into comments(entity_type, entity_id, author_id, body)
  values ('task', v_task_id, v_uid, btrim(p_body))
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'comment', 'task', v_task_id, to_jsonb(v_row), 'telegram');

  return format('💬 Note added to: %s', v_task.title);
end;
$$;


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
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if p_branch is null or length(btrim(p_branch)) = 0 then
    raise exception 'branch is required — try one of: bbqhouse, salt, centralkitchen, cleaning'
      using errcode = '22023';
  end if;
  if not exists (select 1 from branches where code = lower(btrim(p_branch))) then
    raise exception 'unknown branch — valid: bbqhouse, salt, centralkitchen, cleaning'
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

  return format('✅ Created %s · %s · %s', public._task_short_id(v_row.id), v_row.title, v_row.branch);
end;
$$;

-- =========================================================
-- 10. Reminder dispatch
-- =========================================================

-- Atomically claim pending Telegram reminders. Flips them to dispatching.
create or replace function public.rpc_claim_telegram_reminders(p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  with claimed as (
    update notifications_queue n
       set status   = 'dispatching',
           attempts = attempts + 1
     where n.id in (
       select n2.id from notifications_queue n2
        where n2.status   = 'pending'
          and n2.channel  = 'telegram'
          and n2.fire_at <= now()
          and n2.attempts < 4
        order by n2.fire_at asc
        limit greatest(coalesce(p_limit, 20), 1)
     )
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'entity_type', c.entity_type,
    'entity_id', c.entity_id,
    'recipient_id', c.recipient_id,
    'fire_at', c.fire_at,
    'attempts', c.attempts,
    'payload', c.payload,
    'tg_chat_id', tc.tg_chat_id,
    'task_title', t.title,
    'task_branch', t.branch
  )), '[]'::jsonb)
    into v_rows
  from claimed c
  left join telegram_chats tc on tc.user_id = c.recipient_id and tc.is_active = true
  left join tasks t on t.id = c.entity_id and c.entity_type = 'task';

  return v_rows;
end;
$$;


create or replace function public.rpc_mark_telegram_reminder_sent(
  p_queue_id        bigint,
  p_provider_msg_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notifications_queue;
begin
  update notifications_queue
     set status   = 'sent',
         fired_at = now()
   where id = p_queue_id and status = 'dispatching'
  returning * into v_row;
  if v_row is null then return; end if;

  insert into notification_log(queue_id, recipient_id, channel, status, provider_msg_id)
  values (v_row.id, v_row.recipient_id, 'telegram', 'sent', p_provider_msg_id);

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_row.recipient_id, 'reminder_sent', v_row.entity_type, v_row.entity_id,
          jsonb_build_object('queue_id', v_row.id, 'kind', v_row.kind, 'channel', 'telegram'),
          'telegram');
end;
$$;


create or replace function public.rpc_mark_telegram_reminder_failed(
  p_queue_id bigint,
  p_error    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    notifications_queue;
  v_after  notifications_queue;
  v_next   timestamptz;
begin
  select * into v_row from notifications_queue where id = p_queue_id and status = 'dispatching';
  if v_row is null then return; end if;

  -- Backoff schedule: attempts already incremented at claim time (1=first try done).
  --   1st failure → +1m
  --   2nd failure → +5m
  --   3rd failure → +30m
  --   4th failure → mark failed
  v_next := case v_row.attempts
    when 1 then now() + interval '1 minute'
    when 2 then now() + interval '5 minutes'
    when 3 then now() + interval '30 minutes'
    else null
  end;

  if v_next is null then
    update notifications_queue
       set status     = 'failed',
           last_error = p_error
     where id = p_queue_id
    returning * into v_after;

    insert into notification_log(queue_id, recipient_id, channel, status, error)
    values (v_after.id, v_after.recipient_id, 'telegram', 'failed', p_error);

    insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
    values (v_after.recipient_id, 'reminder_failed', v_after.entity_type, v_after.entity_id,
            jsonb_build_object('queue_id', v_after.id, 'kind', v_after.kind,
                               'channel','telegram','error',p_error,'attempts',v_after.attempts),
            'telegram');
  else
    update notifications_queue
       set status     = 'pending',
           fire_at    = v_next,
           last_error = p_error
     where id = p_queue_id
    returning * into v_after;

    insert into notification_log(queue_id, recipient_id, channel, status, error)
    values (v_after.id, v_after.recipient_id, 'telegram', 'failed', p_error);
  end if;
end;
$$;


create or replace function public.rpc_list_active_telegram_chats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  -- V1: daily summary only goes to admin/CEO linked users.
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', tc.user_id,
    'tg_chat_id', tc.tg_chat_id,
    'role', u.role
  )), '[]'::jsonb)
    into v_rows
  from telegram_chats tc
  join users u on u.id = tc.user_id
  where tc.is_active = true
    and u.role in ('admin','ceo');
  return v_rows;
end;
$$;

-- =========================================================
-- 11. pg_cron job — telegram-tick
-- =========================================================
-- Every minute: POSTs to the telegram-tick Edge Function. The function
-- drains pending Telegram reminders + checks whether to fire daily summary.
-- Vault provides the URL + internal shared secret; both are populated by
-- scripts/telegram-setup.mjs after Edge Function deploy. If Vault is empty
-- the call short-circuits without erroring.

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'telegram-tick';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'telegram-tick',
    '* * * * *',
    $cmd$
      with secret as (
        select
          (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_tick_url'           limit 1) as url,
          (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_internal_secret'    limit 1) as bearer
      )
      select
        case when s.url is null or s.url = '' then null
             else net.http_post(
               url := s.url,
               headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer ' || s.bearer
               ),
               body := '{}'::jsonb
             )
        end
      from secret s;
    $cmd$
  );
end $$;

commit;
