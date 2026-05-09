-- Rabih Ops — Purchasing module
-- Adds the purchase_requests table + RLS + 14 RPCs (10 mutations + 3 reads
-- + 4 comment/attachment wrappers). _can_access_entity gains a
-- 'purchase_request' branch so the shared comments / attachments / storage
-- bucket reach into purchases unchanged.
--
-- Lifecycle:
--   draft → submitted → ordered → partially_received / fully_received
--                              ↘ cancelled (from any open status)
--
-- Permissions (DB-enforced via _can_mutate / _can_admin_purchases / branch):
--   admin/ceo   → everything, every branch
--   manager     → create / edit / submit / record-delivery / comment /
--                 attach for their accessible branches
--   viewer      → read-only
--
-- No hard deletes. soft delete sets deleted_at; restoration is a service-role
-- task only (no rpc_undelete).

begin;

-- =========================================================
-- 1. purchase_requests table
-- =========================================================

create table if not exists public.purchase_requests (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null,

  supplier_name            text not null,
  supplier_website         text,

  branch                   text not null references public.branches(code),
  requested_by             uuid not null references public.users(id),
  created_by               uuid not null references public.users(id),

  status                   text not null default 'draft'
                           check (status in (
                             'draft',
                             'submitted',
                             'ordered',
                             'partially_received',
                             'fully_received',
                             'cancelled'
                           )),
  priority                 text not null default 'normal'
                           check (priority in ('urgent','normal','low')),

  payment_method           text
                           check (payment_method in (
                             'cash','bank_transfer','mpesa','card','invoice','other'
                           )),
  payment_status           text not null default 'unpaid'
                           check (payment_status in ('unpaid','partial','paid')),

  -- Currency is required from V1 because RabihOS spans Maputo (MZN) and
  -- Beirut (LBP / USD). Default MZN keeps the Maputo flow as a one-line edit.
  currency                 text not null default 'MZN'
                           check (currency in ('MZN','USD','LBP')),

  total_amount             numeric(12,2),
  amount_paid              numeric(12,2),

  order_date               date,
  expected_delivery_date   date,
  actual_delivery_date     date,
  reminder_date            date,
  submitted_at             timestamptz,
  cancelled_at             timestamptz,

  qty_ordered              numeric(12,3),
  qty_received             numeric(12,3),

  notes                    text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table  public.purchase_requests is
  'Purchase requests across the four branches. Tracks the full lifecycle (draft → fully_received) plus payment state and delivery quantities. Soft-delete only.';
comment on column public.purchase_requests.requested_by is
  'User on whose behalf the request exists. Defaults to caller in rpc_create_purchase_request when not provided.';
comment on column public.purchase_requests.created_by is
  'Always the authenticated user who created the request. Never user-supplied.';
comment on column public.purchase_requests.currency is
  'MZN | USD | LBP. Default MZN. Defined per-row so cross-branch reporting can dedupe by currency.';
comment on column public.purchase_requests.submitted_at is
  'When the request transitioned out of draft. Set by rpc_submit_purchase_request.';
comment on column public.purchase_requests.cancelled_at is
  'When the request was cancelled. Set by rpc_cancel_purchase_request. Distinct from deleted_at, which removes the row from the list view; cancelled rows stay visible.';
comment on column public.purchase_requests.qty_ordered is
  'Numeric to support fractional units (kg, litres). Optional — not all requests have a fixed quantity (e.g. a maintenance call-out).';

-- =========================================================
-- 2. Indexes
-- =========================================================

create index if not exists idx_pr_branch_status
  on public.purchase_requests (branch, status)
  where deleted_at is null;

-- Drives the dashboard "pending deliveries" tile + bucket.
create index if not exists idx_pr_expected_delivery
  on public.purchase_requests (expected_delivery_date)
  where deleted_at is null
    and status in ('ordered','partially_received');

-- Drives the dashboard "reminders today" tile.
create index if not exists idx_pr_reminder_date
  on public.purchase_requests (reminder_date)
  where deleted_at is null and reminder_date is not null;

-- Drives the "unpaid" / "partially paid" dashboard tile + bucket.
create index if not exists idx_pr_payment_open
  on public.purchase_requests (payment_status)
  where deleted_at is null and payment_status <> 'paid';

create index if not exists idx_pr_requested_by
  on public.purchase_requests (requested_by)
  where deleted_at is null;

-- updated_at trigger
drop trigger if exists trg_pr_updated_at on public.purchase_requests;
create trigger trg_pr_updated_at
before update on public.purchase_requests
for each row execute function public.set_updated_at();

-- =========================================================
-- 3. RLS — SELECT only (writes via RPC)
-- =========================================================

alter table public.purchase_requests enable row level security;

drop policy if exists purchase_requests_select_by_branch on public.purchase_requests;
create policy purchase_requests_select_by_branch on public.purchase_requests
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_can_access_branch(branch)
  );

-- =========================================================
-- 4. _can_access_entity — extend with 'purchase_request'
-- =========================================================

create or replace function public._can_access_entity(
  p_entity_type text,
  p_entity_id   uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch text;
  v_found  boolean := false;
begin
  if p_entity_type = 'task' then
    select t.branch into v_branch
      from public.tasks t
     where t.id = p_entity_id and t.deleted_at is null;
    v_found := found;
  elsif p_entity_type = 'follow_up' then
    select f.branch into v_branch
      from public.follow_ups f
     where f.id = p_entity_id and f.deleted_at is null;
    v_found := found;
    if v_found and v_branch is null then
      return true;
    end if;
  elsif p_entity_type = 'inspection' then
    select i.branch into v_branch
      from public.inspections i
     where i.id = p_entity_id and i.deleted_at is null;
    v_found := found;
  elsif p_entity_type = 'purchase_request' then
    select pr.branch into v_branch
      from public.purchase_requests pr
     where pr.id = p_entity_id and pr.deleted_at is null;
    v_found := found;
  else
    return false;
  end if;

  if not v_found then
    return false;
  end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

-- =========================================================
-- 5. _can_admin_purchases helper
-- =========================================================

create or replace function public._can_admin_purchases()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin','ceo')
$$;

comment on function public._can_admin_purchases() is
  'True for admin / ceo. Gates approve / record-payment / cancel / soft-delete / edit-after-ordered on purchase requests.';

-- =========================================================
-- 6. Mutation RPCs — lifecycle
-- =========================================================

create or replace function public.rpc_create_purchase_request(
  p_title                  text,
  p_supplier_name          text,
  p_branch                 text,
  p_priority               text default 'normal',
  p_currency               text default 'MZN',
  p_supplier_website       text default null,
  p_total_amount           numeric default null,
  p_qty_ordered            numeric default null,
  p_expected_delivery_date date default null,
  p_reminder_date          date default null,
  p_payment_method         text default null,
  p_notes                  text default null,
  p_requested_by           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := public._require_auth();
  v_requested_by uuid := coalesce(p_requested_by, v_uid);
  v_row          purchase_requests;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create purchase requests' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  insert into purchase_requests(
    title, supplier_name, supplier_website, branch,
    requested_by, created_by,
    priority, currency, payment_method,
    total_amount, qty_ordered,
    expected_delivery_date, reminder_date,
    notes
  )
  values (
    p_title, p_supplier_name, p_supplier_website, p_branch,
    v_requested_by, v_uid,
    coalesce(p_priority,'normal'),
    coalesce(p_currency,'MZN'),
    p_payment_method,
    p_total_amount, p_qty_ordered,
    p_expected_delivery_date, p_reminder_date,
    p_notes
  )
  returning * into v_row;

  perform public._audit('create','purchase_request', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_create_purchase_request(text,text,text,text,text,text,numeric,numeric,date,date,text,text,uuid) is
  'Creates a draft purchase request. requested_by defaults to the caller; created_by is always the caller.';

create or replace function public.rpc_update_purchase_request(
  p_id      uuid,
  p_updates jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot update purchase requests' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  -- After ordered, only admin/ceo can edit. Manager edits are limited to
  -- draft/submitted lifecycle stages.
  if v_before.status in ('ordered','partially_received','fully_received','cancelled')
     and not public._can_admin_purchases() then
    raise exception 'only admin or ceo can edit a purchase request after it has been ordered'
      using errcode = '42501';
  end if;

  if (p_updates ? 'branch') and (p_updates->>'branch') is not null
     and p_updates->>'branch' <> v_before.branch then
    perform public._require_branch_access(p_updates->>'branch');
  end if;

  update purchase_requests
     set title                    = coalesce(p_updates->>'title',                  title),
         supplier_name            = coalesce(p_updates->>'supplier_name',          supplier_name),
         supplier_website         = case when p_updates ? 'supplier_website'
                                          then nullif(p_updates->>'supplier_website','')
                                          else supplier_website end,
         branch                   = coalesce(p_updates->>'branch',                 branch),
         priority                 = coalesce(p_updates->>'priority',               priority),
         currency                 = coalesce(p_updates->>'currency',               currency),
         payment_method           = case when p_updates ? 'payment_method'
                                          then nullif(p_updates->>'payment_method','')
                                          else payment_method end,
         total_amount             = case when p_updates ? 'total_amount'
                                          then nullif(p_updates->>'total_amount','')::numeric
                                          else total_amount end,
         qty_ordered              = case when p_updates ? 'qty_ordered'
                                          then nullif(p_updates->>'qty_ordered','')::numeric
                                          else qty_ordered end,
         expected_delivery_date   = case when p_updates ? 'expected_delivery_date'
                                          then nullif(p_updates->>'expected_delivery_date','')::date
                                          else expected_delivery_date end,
         reminder_date            = case when p_updates ? 'reminder_date'
                                          then nullif(p_updates->>'reminder_date','')::date
                                          else reminder_date end,
         notes                    = case when p_updates ? 'notes'
                                          then nullif(p_updates->>'notes','')
                                          else notes end,
         requested_by             = case when p_updates ? 'requested_by'
                                          then nullif(p_updates->>'requested_by','')::uuid
                                          else requested_by end
   where id = p_id
  returning * into v_after;

  perform public._audit('update','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_submit_purchase_request(
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot submit purchase requests' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  if v_before.status <> 'draft' then
    raise exception 'only draft purchase requests can be submitted (current: %)', v_before.status
      using errcode = '22023';
  end if;

  update purchase_requests
     set status       = 'submitted',
         submitted_at = now()
   where id = p_id
  returning * into v_after;

  perform public._audit('submit','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_approve_purchase_request(
  p_id              uuid,
  p_total_amount    numeric default null,
  p_payment_method  text    default null,
  p_order_date      date    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_admin_purchases() then
    raise exception 'only admin or ceo can approve purchase requests' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  if v_before.status not in ('draft','submitted') then
    raise exception 'cannot approve from status % (expected draft or submitted)', v_before.status
      using errcode = '22023';
  end if;

  update purchase_requests
     set status         = 'ordered',
         order_date     = coalesce(p_order_date, order_date, current_date),
         total_amount   = coalesce(p_total_amount, total_amount),
         payment_method = coalesce(p_payment_method, payment_method)
   where id = p_id
  returning * into v_after;

  perform public._audit('approve','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_record_delivery(
  p_id           uuid,
  p_qty_received numeric,
  p_delivery_date date default null,
  p_status       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before    purchase_requests;
  v_after     purchase_requests;
  v_new_status text;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot record deliveries' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  if v_before.status not in ('ordered','partially_received','fully_received') then
    raise exception 'cannot record a delivery in status %', v_before.status using errcode = '22023';
  end if;

  -- Auto-infer status from quantities unless caller passes an explicit override.
  if p_status is not null then
    v_new_status := p_status;
  elsif v_before.qty_ordered is null then
    -- No quantity baseline → caller has to pick; default to partially_received.
    v_new_status := case when p_qty_received > 0 then 'partially_received' else 'ordered' end;
  elsif p_qty_received >= v_before.qty_ordered then
    v_new_status := 'fully_received';
  elsif p_qty_received > 0 then
    v_new_status := 'partially_received';
  else
    v_new_status := 'ordered';
  end if;

  update purchase_requests
     set qty_received          = p_qty_received,
         actual_delivery_date  = case when v_new_status = 'fully_received'
                                       then coalesce(p_delivery_date, current_date)
                                       else coalesce(p_delivery_date, actual_delivery_date) end,
         status                = v_new_status
   where id = p_id
  returning * into v_after;

  perform public._audit('delivery','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_record_delivery(uuid, numeric, date, text) is
  'Records qty_received against a purchase. Auto-infers status: 0 → ordered, partial → partially_received, ≥ qty_ordered → fully_received. Pass p_status to override.';

create or replace function public.rpc_record_payment(
  p_id              uuid,
  p_amount_paid     numeric,
  p_payment_method  text default null,
  p_payment_status  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
  v_new_payment_status text;
begin
  perform public._require_auth();
  if not public._can_admin_purchases() then
    raise exception 'only admin or ceo can record payments' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  -- Auto-infer payment_status unless caller overrides.
  if p_payment_status is not null then
    v_new_payment_status := p_payment_status;
  elsif p_amount_paid is null or p_amount_paid <= 0 then
    v_new_payment_status := 'unpaid';
  elsif v_before.total_amount is null then
    v_new_payment_status := 'partial';
  elsif p_amount_paid >= v_before.total_amount then
    v_new_payment_status := 'paid';
  else
    v_new_payment_status := 'partial';
  end if;

  update purchase_requests
     set amount_paid    = p_amount_paid,
         payment_method = coalesce(p_payment_method, payment_method),
         payment_status = v_new_payment_status
   where id = p_id
  returning * into v_after;

  perform public._audit('payment','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_set_purchase_reminder(
  p_id            uuid,
  p_reminder_date date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot set reminders' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update purchase_requests set reminder_date = p_reminder_date where id = p_id
  returning * into v_after;

  perform public._audit('update','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_cancel_purchase_request(
  p_id     uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_admin_purchases() then
    raise exception 'only admin or ceo can cancel purchase requests' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  if v_before.status in ('fully_received','cancelled') then
    raise exception 'cannot cancel a purchase in status %', v_before.status using errcode = '22023';
  end if;

  update purchase_requests
     set status       = 'cancelled',
         cancelled_at = now()
   where id = p_id
  returning * into v_after;

  if p_reason is not null and length(btrim(p_reason)) > 0 then
    perform public._add_comment(
      'purchase_request',
      p_id,
      '[cancelled] ' || btrim(p_reason)
    );
  end if;

  perform public._audit('cancel','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_soft_delete_purchase_request(
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before purchase_requests;
  v_after  purchase_requests;
begin
  perform public._require_auth();
  if not public._can_admin_purchases() then
    raise exception 'only admin or ceo can delete purchase requests' using errcode = '42501';
  end if;

  select * into v_before from purchase_requests where id = p_id and deleted_at is null;
  if v_before is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update purchase_requests set deleted_at = now() where id = p_id
  returning * into v_after;

  perform public._audit('delete','purchase_request', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

-- =========================================================
-- 7. Read RPCs
-- =========================================================

create or replace function public.rpc_list_purchase_requests(
  p_branch         text    default null,
  p_status         text    default null,
  p_priority       text    default null,
  p_payment_status text    default null,
  p_requested_by   uuid    default null,
  p_search         text    default null,
  p_date_before    date    default null,
  p_date_after     date    default null,
  p_include_done   boolean default false,
  p_limit          int     default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := current_date;
  v_result jsonb;
begin
  perform public._require_auth();
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  -- Sort: overdue deliveries first (ordered/partially_received with
  -- expected_delivery_date < today), then expected delivery date asc nulls
  -- last, then reminder_date asc, then created_at desc.
  select coalesce(jsonb_agg(p order by
            (case when p.status in ('ordered','partially_received')
                       and p.expected_delivery_date is not null
                       and p.expected_delivery_date < v_today
                  then 0 else 1 end),
            p.expected_delivery_date nulls last,
            p.reminder_date nulls last,
            p.created_at desc
          ), '[]'::jsonb)
    into v_result
  from (
    select pp.*,
           u_req.full_name as requested_by_name,
           u_cre.full_name as created_by_name,
           (case when pp.status in ('ordered','partially_received')
                       and pp.expected_delivery_date is not null
                       and pp.expected_delivery_date < v_today
                  then true else false end) as is_overdue
      from purchase_requests pp
      join users u_req on u_req.id = pp.requested_by
      join users u_cre on u_cre.id = pp.created_by
     where pp.deleted_at is null
       and public.current_user_can_access_branch(pp.branch)
       and (p_branch         is null or pp.branch         = p_branch)
       and (p_status         is null or pp.status         = p_status)
       and (p_priority       is null or pp.priority       = p_priority)
       and (p_payment_status is null or pp.payment_status = p_payment_status)
       and (p_requested_by   is null or pp.requested_by   = p_requested_by)
       and (p_date_before    is null or pp.expected_delivery_date <= p_date_before)
       and (p_date_after     is null or pp.expected_delivery_date >= p_date_after)
       and (p_include_done
            or pp.status not in ('fully_received','cancelled'))
       and (p_search is null
            or pp.title ilike '%' || p_search || '%'
            or pp.supplier_name ilike '%' || p_search || '%'
            or coalesce(pp.notes,'') ilike '%' || p_search || '%')
     limit greatest(coalesce(p_limit, 100), 1)
  ) p;

  return v_result;
end;
$$;

create or replace function public.rpc_get_purchase_request(
  p_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row              purchase_requests;
  v_requested_by_name text;
  v_created_by_name   text;
  v_comments         jsonb;
  v_attachments      jsonb;
  v_audit            jsonb;
  v_today            date := current_date;
  v_is_overdue       boolean;
begin
  perform public._require_auth();

  select * into v_row from purchase_requests where id = p_id and deleted_at is null;
  if v_row is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_row.branch);

  select full_name into v_requested_by_name from users where id = v_row.requested_by;
  select full_name into v_created_by_name   from users where id = v_row.created_by;

  v_is_overdue := v_row.status in ('ordered','partially_received')
                  and v_row.expected_delivery_date is not null
                  and v_row.expected_delivery_date < v_today;

  select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb)
    into v_comments
  from (
    select cc.*, u.full_name as author_name
      from comments cc
      join users u on u.id = cc.author_id
     where cc.entity_type = 'purchase_request'
       and cc.entity_id = p_id
       and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.entity_type = 'purchase_request'
       and aa.entity_id = p_id
  ) a;

  select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb)
    into v_audit
  from (
    select l.id, l.action, l.entity_type, l.entity_id,
           l.before_state, l.after_state, l.created_at, l.user_id,
           coalesce(u.full_name, 'system') as user_name
      from audit_log l
      left join users u on u.id = l.user_id
     where l.entity_type = 'purchase_request' and l.entity_id = p_id
     order by l.created_at desc
     limit 50
  ) al;

  return jsonb_build_object(
    'purchase_request',
      to_jsonb(v_row)
        || jsonb_build_object(
             'requested_by_name', v_requested_by_name,
             'created_by_name',   v_created_by_name,
             'is_overdue',        v_is_overdue
           ),
    'comments',    v_comments,
    'attachments', v_attachments,
    'audit',       v_audit
  );
end;
$$;

create or replace function public.rpc_list_purchase_dashboard(
  p_limit int default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today            date := current_date;
  v_pending_delivery jsonb;
  v_unpaid           jsonb;
  v_reminders        jsonb;
begin
  perform public._require_auth();

  -- Overdue or upcoming deliveries (ordered / partially_received), nearest first.
  select coalesce(jsonb_agg(p order by p.expected_delivery_date nulls last, p.created_at desc), '[]'::jsonb)
    into v_pending_delivery
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.expected_delivery_date, pp.qty_ordered, pp.qty_received,
           pp.currency, pp.total_amount,
           (pp.expected_delivery_date is not null
              and pp.expected_delivery_date < v_today) as is_overdue
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.status in ('ordered','partially_received')
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  -- Unpaid or partially-paid (any non-cancelled status).
  select coalesce(jsonb_agg(p order by p.order_date desc nulls last, p.created_at desc), '[]'::jsonb)
    into v_unpaid
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.payment_status, pp.payment_method,
           pp.currency, pp.total_amount, pp.amount_paid,
           pp.order_date
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.status <> 'cancelled'
       and pp.payment_status in ('unpaid','partial')
       and (pp.total_amount is not null or pp.amount_paid is not null)
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  -- Reminders due today.
  select coalesce(jsonb_agg(p order by p.reminder_date asc, p.created_at desc), '[]'::jsonb)
    into v_reminders
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.reminder_date, pp.expected_delivery_date,
           pp.currency, pp.total_amount
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.reminder_date = v_today
       and pp.status not in ('cancelled','fully_received')
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  return jsonb_build_object(
    'pending_deliveries', v_pending_delivery,
    'unpaid',             v_unpaid,
    'reminders_today',    v_reminders
  );
end;
$$;

comment on function public.rpc_list_purchase_dashboard(int) is
  'Single round-trip for the three dashboard purchase sections: pending deliveries, unpaid/partial purchases, reminders due today.';

-- =========================================================
-- 8. Comment + attachment wrappers
-- =========================================================

create or replace function public.rpc_add_purchase_comment(
  p_id   uuid,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr purchase_requests;
begin
  perform public._require_auth();
  select * into v_pr from purchase_requests where id = p_id and deleted_at is null;
  if v_pr is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_pr.branch);
  return public._add_comment('purchase_request', p_id, p_body);
end;
$$;

create or replace function public.rpc_delete_purchase_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment comments;
  v_pr      purchase_requests;
begin
  perform public._require_auth();
  select * into v_comment
    from comments
   where id = p_comment_id and entity_type = 'purchase_request' and deleted_at is null;
  if v_comment is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  select * into v_pr from purchase_requests where id = v_comment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_pr.branch);
  return public._delete_comment(p_comment_id);
end;
$$;

create or replace function public.rpc_attach_file_to_purchase(
  p_id           uuid,
  p_storage_path text,
  p_file_name    text,
  p_mime_type    text,
  p_file_size    int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr purchase_requests;
begin
  perform public._require_auth();
  select * into v_pr from purchase_requests where id = p_id and deleted_at is null;
  if v_pr is null then
    raise exception 'purchase request % not found', p_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_pr.branch);
  return public._add_attachment('purchase_request', p_id, p_storage_path, p_file_name, p_mime_type, p_file_size);
end;
$$;

create or replace function public.rpc_remove_purchase_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment attachments;
  v_pr         purchase_requests;
begin
  perform public._require_auth();
  select * into v_attachment
    from attachments
   where id = p_attachment_id and entity_type = 'purchase_request';
  if v_attachment is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  select * into v_pr from purchase_requests where id = v_attachment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_pr.branch);
  return public._remove_attachment(p_attachment_id);
end;
$$;

-- =========================================================
-- 9. Grants
-- =========================================================

grant execute on function public.rpc_create_purchase_request(text,text,text,text,text,text,numeric,numeric,date,date,text,text,uuid) to authenticated;
grant execute on function public.rpc_update_purchase_request(uuid, jsonb)                                                            to authenticated;
grant execute on function public.rpc_submit_purchase_request(uuid)                                                                    to authenticated;
grant execute on function public.rpc_approve_purchase_request(uuid, numeric, text, date)                                              to authenticated;
grant execute on function public.rpc_record_delivery(uuid, numeric, date, text)                                                       to authenticated;
grant execute on function public.rpc_record_payment(uuid, numeric, text, text)                                                        to authenticated;
grant execute on function public.rpc_set_purchase_reminder(uuid, date)                                                                to authenticated;
grant execute on function public.rpc_cancel_purchase_request(uuid, text)                                                              to authenticated;
grant execute on function public.rpc_soft_delete_purchase_request(uuid)                                                               to authenticated;
grant execute on function public.rpc_list_purchase_requests(text,text,text,text,uuid,text,date,date,boolean,int)                      to authenticated;
grant execute on function public.rpc_get_purchase_request(uuid)                                                                       to authenticated;
grant execute on function public.rpc_list_purchase_dashboard(int)                                                                     to authenticated;
grant execute on function public.rpc_add_purchase_comment(uuid, text)                                                                 to authenticated;
grant execute on function public.rpc_delete_purchase_comment(uuid)                                                                    to authenticated;
grant execute on function public.rpc_attach_file_to_purchase(uuid, text, text, text, int)                                             to authenticated;
grant execute on function public.rpc_remove_purchase_attachment(uuid)                                                                 to authenticated;

commit;
