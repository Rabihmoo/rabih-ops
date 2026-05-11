-- Rabih Ops — Phase H1: record_links foundation
-- =====================================================================
-- A universal relationship table that links any LIVE internal record to
-- either another internal record or to an external system. Phase H2/H3
-- will widen the allowed entity types as those tables (companies,
-- contacts, notes) come online — this file deliberately enumerates only
-- the entity types whose tables already exist + are RLS-validated.
--
-- Privacy rule (strict, by design):
--   * INTERNAL link rows are visible only when the caller can access
--     BOTH endpoints (from + to).
--   * EXTERNAL link rows are visible when the caller can access the
--     from-side entity.
--   This avoids leaking that a private/personal target exists by way of
--   a link row whose source is public.
--
-- Existing typed-link tables remain authoritative for their domains:
--   * email_links            — Gmail messages on tasks/follow-ups
--   * document_links         — Document → entity attachments
--   * calendar_event_links   — Google Calendar events on tasks/follow-ups
-- H1 does NOT dual-write. rpc_record_relations reads from all four
-- tables and projects them to one shape.

begin;

-- =====================================================================
-- 1. record_links
-- =====================================================================

create table if not exists public.record_links (
  id              bigserial primary key,

  -- "From" side: always an internal record. H1 entity types only.
  from_entity_type text not null check (from_entity_type in
    ('task','follow_up','purchase_request','inspection','document')),
  from_entity_id   uuid not null,

  -- "To" side: EITHER internal (next two columns) OR external (the four
  -- after that). The XOR constraint below enforces mutual exclusion.
  to_entity_type   text check (to_entity_type in
    ('task','follow_up','purchase_request','inspection','document')),
  to_entity_id     uuid,

  external_app           text check (external_app in
    ('gmail','calendar','drive','cater_co','teamlink','salt_reservation','url')),
  external_record_type   text,
  external_record_id     text,
  external_url           text,
  external_label         text,
  external_snapshot      jsonb not null default '{}'::jsonb,

  relationship text not null default 'relates_to' check (relationship in (
    'relates_to','follow_up_for','caused_by','blocks','resolves',
    'email_for','document_for','supplier_for','contractor_for',
    'staff_for','decision_for','calendar_for','note_for','attachment_for'
  )),

  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint record_links_target_xor check (
    (to_entity_type is not null and to_entity_id is not null
       and external_app is null and external_record_id is null)
    or
    (to_entity_type is null and to_entity_id is null
       and external_app is not null)
  )
);

comment on table public.record_links is
  'Phase H1 — universal directed relationship pointer. One row per (from -> to) link, where "to" is either another internal record or an external-system pointer. Authoritative for relationships not covered by the legacy typed-link tables (email_links / document_links / calendar_event_links).';
comment on column public.record_links.from_entity_type is
  'Type of the source record. Constrained to H1 live entity types; H2/H3 will widen the CHECK to add company/contact/note.';
comment on column public.record_links.relationship is
  'Directional verb. Inverse semantics ("blocked_by", "preceded_by") are computed at query time, not stored.';
comment on column public.record_links.external_snapshot is
  'Arbitrary jsonb snapshot at link time (filename, subject, mime, etc.). Decoupled from the external system, so stale labels are tolerated.';

-- =====================================================================
-- 2. Indexes
-- =====================================================================

-- Idempotency: same (from, to, relationship) cannot repeat while live.
create unique index if not exists uq_record_links_internal_active
  on public.record_links
    (from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship)
  where deleted_at is null and to_entity_id is not null;

create unique index if not exists uq_record_links_external_active
  on public.record_links
    (from_entity_type, from_entity_id, external_app, external_record_id, relationship)
  where deleted_at is null and external_record_id is not null;

-- Outbound and inbound traversal indexes (partial; live links only).
create index if not exists idx_record_links_from
  on public.record_links (from_entity_type, from_entity_id)
  where deleted_at is null;
create index if not exists idx_record_links_to
  on public.record_links (to_entity_type, to_entity_id)
  where deleted_at is null and to_entity_id is not null;

-- =====================================================================
-- 3. RLS
-- =====================================================================

alter table public.record_links enable row level security;

drop policy if exists record_links_select_visible on public.record_links;
create policy record_links_select_visible on public.record_links
  for select to authenticated using (
    deleted_at is null
    and public._can_access_entity(from_entity_type, from_entity_id)
    and (
      -- Internal link: require access to the to-side as well. Privacy
      -- rule — the existence of the link itself must not leak that a
      -- private target exists.
      (to_entity_id is not null
        and public._can_access_entity(to_entity_type, to_entity_id))
      -- External link: only one accessible endpoint exists; from-side
      -- check above is sufficient.
      or (external_app is not null)
    )
  );

-- =====================================================================
-- 4. Web RPCs (granted to authenticated)
-- =====================================================================

-- rpc_record_link_internal --------------------------------------------
-- Idempotent. If a live (from, to, relationship) link already exists
-- the existing row is returned without a duplicate insert or audit.

create or replace function public.rpc_record_link_internal(
  p_from_type    text,
  p_from_id      uuid,
  p_to_type      text,
  p_to_id        uuid,
  p_relationship text default 'relates_to'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row record_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link records' using errcode = '42501';
  end if;
  if p_from_type not in ('task','follow_up','purchase_request','inspection','document') then
    raise exception 'invalid from_entity_type %', p_from_type using errcode = '22023';
  end if;
  if p_to_type not in ('task','follow_up','purchase_request','inspection','document') then
    raise exception 'invalid to_entity_type %', p_to_type using errcode = '22023';
  end if;
  if p_from_type = p_to_type and p_from_id = p_to_id then
    raise exception 'cannot link an entity to itself' using errcode = '22023';
  end if;
  if not public._can_access_entity(p_from_type, p_from_id) then
    raise exception 'from entity not accessible' using errcode = '42501';
  end if;
  if not public._can_access_entity(p_to_type, p_to_id) then
    raise exception 'to entity not accessible' using errcode = '42501';
  end if;

  select * into v_row
    from record_links
   where from_entity_type = p_from_type and from_entity_id = p_from_id
     and to_entity_type   = p_to_type   and to_entity_id   = p_to_id
     and relationship = p_relationship
     and deleted_at is null
   limit 1;
  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  insert into record_links(
    from_entity_type, from_entity_id, to_entity_type, to_entity_id,
    relationship, created_by
  ) values (
    p_from_type, p_from_id, p_to_type, p_to_id,
    p_relationship, v_uid
  ) returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'record_link_created', p_from_type, p_from_id,
          jsonb_build_object(
            'link_id', v_row.id,
            'to_type', p_to_type, 'to_id', p_to_id,
            'relationship', p_relationship
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_record_link_internal(text,uuid,text,uuid,text) is
  'Create an internal-to-internal record link. Idempotent on (from, to, relationship). Requires _can_mutate and access to BOTH endpoints.';

grant execute on function public.rpc_record_link_internal(text,uuid,text,uuid,text) to authenticated;


-- rpc_record_link_external --------------------------------------------

create or replace function public.rpc_record_link_external(
  p_from_type             text,
  p_from_id               uuid,
  p_external_app          text,
  p_external_record_type  text,
  p_external_record_id    text,
  p_external_url          text,
  p_external_label        text,
  p_external_snapshot     jsonb default '{}'::jsonb,
  p_relationship          text default 'relates_to'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row record_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link records' using errcode = '42501';
  end if;
  if p_from_type not in ('task','follow_up','purchase_request','inspection','document') then
    raise exception 'invalid from_entity_type %', p_from_type using errcode = '22023';
  end if;
  if p_external_app not in ('gmail','calendar','drive','cater_co','teamlink','salt_reservation','url') then
    raise exception 'invalid external_app %', p_external_app using errcode = '22023';
  end if;
  if p_external_record_id is null or btrim(p_external_record_id) = '' then
    raise exception 'external_record_id is required' using errcode = '22023';
  end if;
  if not public._can_access_entity(p_from_type, p_from_id) then
    raise exception 'from entity not accessible' using errcode = '42501';
  end if;

  select * into v_row
    from record_links
   where from_entity_type = p_from_type and from_entity_id = p_from_id
     and external_app = p_external_app
     and external_record_id = p_external_record_id
     and relationship = p_relationship
     and deleted_at is null
   limit 1;
  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  insert into record_links(
    from_entity_type, from_entity_id,
    external_app, external_record_type, external_record_id,
    external_url, external_label, external_snapshot,
    relationship, created_by
  ) values (
    p_from_type, p_from_id,
    p_external_app,
    nullif(btrim(p_external_record_type), ''),
    p_external_record_id,
    nullif(btrim(p_external_url), ''),
    nullif(btrim(p_external_label), ''),
    coalesce(p_external_snapshot, '{}'::jsonb),
    p_relationship, v_uid
  ) returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'external_link_added', p_from_type, p_from_id,
          jsonb_build_object(
            'link_id', v_row.id,
            'external_app', p_external_app,
            'external_record_type', p_external_record_type,
            'external_record_id', p_external_record_id,
            'relationship', p_relationship
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_record_link_external(text,uuid,text,text,text,text,text,jsonb,text) is
  'Create an internal-to-external record link. Idempotent on (from, external_app, external_record_id, relationship). Requires _can_mutate and access to the from-side entity.';

grant execute on function public.rpc_record_link_external(text,uuid,text,text,text,text,text,jsonb,text) to authenticated;


-- rpc_record_link_remove ----------------------------------------------

create or replace function public.rpc_record_link_remove(p_link_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_row    record_links;
  v_action text;
begin
  if not public._can_mutate() then
    raise exception 'role cannot unlink records' using errcode = '42501';
  end if;

  select * into v_row from record_links where id = p_link_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'record link % not found', p_link_id using errcode = 'P0002';
  end if;

  -- Re-enforce the SELECT predicate (SECURITY DEFINER bypasses RLS).
  if not public._can_access_entity(v_row.from_entity_type, v_row.from_entity_id) then
    raise exception 'not allowed to unlink this row' using errcode = '42501';
  end if;
  if v_row.to_entity_id is not null
     and not public._can_access_entity(v_row.to_entity_type, v_row.to_entity_id) then
    raise exception 'not allowed to unlink this row' using errcode = '42501';
  end if;
  -- Only the creator OR admin/ceo may unlink — so a viewer/manager can't
  -- silently undo another user's link.
  if v_row.created_by <> v_uid
     and public.current_user_role() not in ('admin','ceo') then
    raise exception 'not allowed to unlink another user''s link' using errcode = '42501';
  end if;

  update record_links set deleted_at = now()
    where id = p_link_id
    returning * into v_row;

  v_action := case when v_row.external_app is not null
                   then 'external_link_removed'
                   else 'record_link_removed'
              end;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, v_action, v_row.from_entity_type, v_row.from_entity_id,
          jsonb_build_object(
            'link_id', v_row.id,
            'relationship', v_row.relationship,
            'to_type', v_row.to_entity_type,
            'to_id', v_row.to_entity_id,
            'external_app', v_row.external_app,
            'external_record_id', v_row.external_record_id
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_record_link_remove(bigint) is
  'Soft-deletes a record_links row. Caller must have access to both endpoints (per the SELECT privacy rule) and must be the link creator OR admin/ceo.';

grant execute on function public.rpc_record_link_remove(bigint) to authenticated;


-- rpc_record_relations ------------------------------------------------
-- Unified READ across record_links (outbound + inbound) and the three
-- existing typed-link tables. Each row projected to one shape so the
-- caller can group + render uniformly.

create or replace function public.rpc_record_relations(
  p_entity_type text,
  p_entity_id   uuid,
  p_limit_per_source int default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_result jsonb;
begin
  -- Guard: caller must be able to see the anchor entity to see anything
  -- linked to it.
  if not public._can_access_entity(p_entity_type, p_entity_id) then
    return '[]'::jsonb;
  end if;
  if p_limit_per_source is null or p_limit_per_source < 1 then
    p_limit_per_source := 30;
  end if;
  if p_limit_per_source > 200 then
    p_limit_per_source := 200;
  end if;

  with
  -- 1. record_links outbound (this entity is the source)
  rl_out as (
    select
      'record_link'::text  as source_table,
      r.id                 as link_id,
      'outbound'::text     as direction,
      r.relationship,
      r.to_entity_type,
      r.to_entity_id,
      r.external_app,
      r.external_record_type,
      r.external_record_id,
      r.external_url,
      r.external_label,
      r.external_snapshot,
      r.created_at,
      r.created_by
    from record_links r
    where r.from_entity_type = p_entity_type
      and r.from_entity_id   = p_entity_id
      and r.deleted_at is null
      -- Privacy: if internal, the to-side must be accessible too.
      and (
        r.to_entity_id is null
        or public._can_access_entity(r.to_entity_type, r.to_entity_id)
      )
    order by r.created_at desc
    limit p_limit_per_source
  ),
  -- 2. record_links inbound (this entity is the target). Surfaced with
  -- direction='inbound' and the other-side fields projected into the
  -- to_entity_* slots so the UI sees a uniform shape.
  rl_in as (
    select
      'record_link'::text  as source_table,
      r.id                 as link_id,
      'inbound'::text      as direction,
      r.relationship,
      r.from_entity_type   as to_entity_type,
      r.from_entity_id     as to_entity_id,
      null::text           as external_app,
      null::text           as external_record_type,
      null::text           as external_record_id,
      null::text           as external_url,
      null::text           as external_label,
      '{}'::jsonb          as external_snapshot,
      r.created_at,
      r.created_by
    from record_links r
    where r.to_entity_type = p_entity_type
      and r.to_entity_id   = p_entity_id
      and r.deleted_at is null
      and public._can_access_entity(r.from_entity_type, r.from_entity_id)
    order by r.created_at desc
    limit p_limit_per_source
  ),
  -- 3. email_links — re-enforces its own SELECT policy inline.
  el as (
    select
      'email_link'::text   as source_table,
      el.id                as link_id,
      'outbound'::text     as direction,
      'email_for'::text    as relationship,
      null::text           as to_entity_type,
      null::uuid           as to_entity_id,
      'gmail'::text        as external_app,
      'message'::text      as external_record_type,
      el.gmail_message_id  as external_record_id,
      el.html_link         as external_url,
      el.subject           as external_label,
      jsonb_build_object(
        'thread_id',     el.gmail_thread_id,
        'from_address',  el.from_address,
        'from_name',     el.from_name,
        'snippet',       el.snippet,
        'internal_date', el.internal_date
      )                    as external_snapshot,
      el.created_at,
      el.user_id           as created_by
    from email_links el
    where el.entity_type = p_entity_type
      and el.entity_id   = p_entity_id
      and el.deleted_at is null
      and (el.user_id = v_uid or v_role in ('admin','ceo'))
    order by el.created_at desc
    limit p_limit_per_source
  ),
  -- 4. document_links joined to documents for snapshot fields.
  dl as (
    select
      'document_link'::text as source_table,
      dl.id                 as link_id,
      'outbound'::text      as direction,
      'document_for'::text  as relationship,
      'document'::text      as to_entity_type,
      d.id                  as to_entity_id,
      null::text            as external_app,
      null::text            as external_record_type,
      null::text            as external_record_id,
      null::text            as external_url,
      d.title               as external_label,
      jsonb_build_object(
        'category',   d.category,
        'status',     d.status,
        'visibility', d.visibility
      )                     as external_snapshot,
      dl.created_at,
      dl.created_by
    from document_links dl
    join documents d on d.id = dl.document_id and d.deleted_at is null
    where dl.entity_type = p_entity_type
      and dl.entity_id   = p_entity_id
      and dl.deleted_at is null
      and public._can_access_entity('document', d.id)
    order by dl.created_at desc
    limit p_limit_per_source
  ),
  -- 5. calendar_event_links — re-enforces its own SELECT policy inline.
  cl as (
    select
      'calendar_event_link'::text as source_table,
      cl.id                       as link_id,
      'outbound'::text            as direction,
      'calendar_for'::text        as relationship,
      null::text                  as to_entity_type,
      null::uuid                  as to_entity_id,
      'calendar'::text            as external_app,
      'event'::text               as external_record_type,
      cl.google_event_id          as external_record_id,
      cl.event_html_link          as external_url,
      cl.event_title              as external_label,
      jsonb_build_object(
        'calendar_id', cl.google_calendar_id,
        'start',       cl.event_start,
        'end',         cl.event_end
      )                           as external_snapshot,
      cl.created_at,
      cl.user_id                  as created_by
    from calendar_event_links cl
    where cl.entity_type = p_entity_type
      and cl.entity_id   = p_entity_id
      and cl.deleted_at is null
      and (cl.user_id = v_uid or v_role in ('admin','ceo'))
    order by cl.created_at desc
    limit p_limit_per_source
  ),
  unioned as (
    select * from rl_out
    union all select * from rl_in
    union all select * from el
    union all select * from dl
    union all select * from cl
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_table',         u.source_table,
    'link_id',              u.link_id,
    'direction',            u.direction,
    'relationship',         u.relationship,
    'to_entity_type',       u.to_entity_type,
    'to_entity_id',         u.to_entity_id,
    'external_app',         u.external_app,
    'external_record_type', u.external_record_type,
    'external_record_id',   u.external_record_id,
    'external_url',         u.external_url,
    'external_label',       u.external_label,
    'external_snapshot',    u.external_snapshot,
    'created_at',           u.created_at,
    'created_by',           u.created_by
  ) order by u.created_at desc), '[]'::jsonb)
    into v_result
  from unioned u;

  return v_result;
end;
$$;

comment on function public.rpc_record_relations(text,uuid,int) is
  'Unified read-only view of every kind of link an entity participates in: record_links (outbound and inbound) plus email_links, document_links, calendar_event_links. Each source has its visibility predicate re-enforced inline because SECURITY DEFINER bypasses RLS.';

grant execute on function public.rpc_record_relations(text,uuid,int) to authenticated;

commit;
