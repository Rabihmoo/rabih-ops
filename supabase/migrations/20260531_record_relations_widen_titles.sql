-- Rabih Ops — Phase H4.2 fix #1: widen rpc_record_relations with target titles
-- =====================================================================
-- The H4.2 LinkedRecordsPanel was rendering internal targets as
-- "Task · 8437eeee" because rpc_record_relations didn't ship a target
-- title. We widen each projection arm to LEFT JOIN LATERAL the target
-- entity table on (to_entity_type, to_entity_id) and surface the
-- canonical "name" column as a new top-level field: to_entity_title.
--
-- Naming convention by entity table:
--   * task / follow_up / purchase_request / document              → title
--   * inspection (no title column)                                → area + ' · ' + inspection_date
--   * company                                                     → name
--   * contact                                                     → full_name
--   * note                                                        → coalesce(title, first-80-of-body, 'Untitled note')
--
-- Soft-delete column varies by table:
--   * Most tables use deleted_at — already filtered out by
--     _can_access_entity, so the LEFT JOIN LATERAL also re-filters as a
--     belt-and-braces guard against null-title rows for hard-deleted
--     rows that somehow leak past the access predicate.
--   * notes uses BOTH archived_at (active vs archived) AND deleted_at
--     (hidden hard-delete admin cleanup). We require deleted_at IS NULL
--     in the LATERAL — archived notes still have visible titles, which
--     matches the rest of the app.
--
-- External rows: for shape consistency the projection promotes a sane
-- fallback into to_entity_title:
--   * email_link / record_link external gmail  → existing external_label
--     (subject) is the title; we leave to_entity_title NULL and let the
--     UI fall back to relationLabel() as it does today.
--   * calendar_event_link / record_link calendar → same — UI uses
--     external_label (event title).
--   * document_link → existing external_label (document.title) — leave
--     to_entity_title NULL to keep one source of truth for external
--     labels.
--   * record_link external (drive / url / etc.) → external_label is the
--     pasted label; leave to_entity_title NULL.
-- This keeps external label handling on ONE codepath (relationLabel) and
-- saves the panel from having to pick between to_entity_title and the
-- external snapshot fields.
--
-- The _can_access_entity privacy filter inside each arm's WHERE is
-- UNCHANGED. The LEFT JOIN LATERAL runs only against rows that passed
-- access — a hard-deleted target won't appear because it can't pass
-- access (its row is gone, so _can_access_entity returns false). For
-- soft-deleted targets, access returns false too (every arm filters on
-- deleted_at IS NULL). Either way, the join is defensive only.

begin;

-- =====================================================================
-- rpc_record_relations — widen with to_entity_title
-- =====================================================================
-- create or replace is signature-compatible: same arg list + return type
-- as the previous version. No drop necessary.

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
      -- Target-title resolution — one LATERAL per entity table. Each
      -- variant filters its own soft-delete column.
      tt.to_entity_title   as to_entity_title,
      r.external_app,
      r.external_record_type,
      r.external_record_id,
      r.external_url,
      r.external_label,
      r.external_snapshot,
      r.created_at,
      r.created_by
    from record_links r
    left join lateral (
      select case r.to_entity_type
        when 'task' then (
          select t.title from tasks t
           where t.id = r.to_entity_id and t.deleted_at is null
        )
        when 'follow_up' then (
          select f.title from follow_ups f
           where f.id = r.to_entity_id and f.deleted_at is null
        )
        when 'inspection' then (
          -- inspections has no title column — synthesize one.
          select i.area || ' · ' || to_char(i.inspection_date, 'YYYY-MM-DD')
            from inspections i
           where i.id = r.to_entity_id and i.deleted_at is null
        )
        when 'purchase_request' then (
          select pr.title from purchase_requests pr
           where pr.id = r.to_entity_id and pr.deleted_at is null
        )
        when 'document' then (
          select d.title from documents d
           where d.id = r.to_entity_id and d.deleted_at is null
        )
        when 'company' then (
          select c.name from companies c
           where c.id = r.to_entity_id and c.deleted_at is null
        )
        when 'contact' then (
          select ct.full_name from contacts ct
           where ct.id = r.to_entity_id and ct.deleted_at is null
        )
        when 'note' then (
          select coalesce(
            nullif(btrim(n.title), ''),
            nullif(btrim(left(split_part(n.body_md, E'\n', 1), 80)), ''),
            'Untitled note'
          )
          from notes n
          where n.id = r.to_entity_id and n.deleted_at is null
        )
        else null
      end as to_entity_title
    ) tt on true
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
  -- direction='inbound' and the from-side (other side) projected into
  -- the to_entity_* slots so the UI sees a uniform shape.
  rl_in as (
    select
      'record_link'::text  as source_table,
      r.id                 as link_id,
      'inbound'::text      as direction,
      r.relationship,
      r.from_entity_type   as to_entity_type,
      r.from_entity_id     as to_entity_id,
      tt.to_entity_title   as to_entity_title,
      null::text           as external_app,
      null::text           as external_record_type,
      null::text           as external_record_id,
      null::text           as external_url,
      null::text           as external_label,
      '{}'::jsonb          as external_snapshot,
      r.created_at,
      r.created_by
    from record_links r
    left join lateral (
      -- For inbound rows the "other side" is from_entity_type/id. Same
      -- table fan-out as rl_out, just keyed against from_entity_id.
      select case r.from_entity_type
        when 'task' then (
          select t.title from tasks t
           where t.id = r.from_entity_id and t.deleted_at is null
        )
        when 'follow_up' then (
          select f.title from follow_ups f
           where f.id = r.from_entity_id and f.deleted_at is null
        )
        when 'inspection' then (
          -- inspections has no title column — synthesize one.
          select i.area || ' · ' || to_char(i.inspection_date, 'YYYY-MM-DD')
            from inspections i
           where i.id = r.from_entity_id and i.deleted_at is null
        )
        when 'purchase_request' then (
          select pr.title from purchase_requests pr
           where pr.id = r.from_entity_id and pr.deleted_at is null
        )
        when 'document' then (
          select d.title from documents d
           where d.id = r.from_entity_id and d.deleted_at is null
        )
        when 'company' then (
          select c.name from companies c
           where c.id = r.from_entity_id and c.deleted_at is null
        )
        when 'contact' then (
          select ct.full_name from contacts ct
           where ct.id = r.from_entity_id and ct.deleted_at is null
        )
        when 'note' then (
          select coalesce(
            nullif(btrim(n.title), ''),
            nullif(btrim(left(split_part(n.body_md, E'\n', 1), 80)), ''),
            'Untitled note'
          )
          from notes n
          where n.id = r.from_entity_id and n.deleted_at is null
        )
        else null
      end as to_entity_title
    ) tt on true
    where r.to_entity_type = p_entity_type
      and r.to_entity_id   = p_entity_id
      and r.deleted_at is null
      and public._can_access_entity(r.from_entity_type, r.from_entity_id)
    order by r.created_at desc
    limit p_limit_per_source
  ),
  -- 3. email_links — re-enforces its own SELECT policy inline. We leave
  -- to_entity_title NULL: the UI's relationLabel() already prefers
  -- external_label (subject) for these rows, so promoting subject into
  -- to_entity_title would just duplicate state.
  el as (
    select
      'email_link'::text   as source_table,
      el.id                as link_id,
      'outbound'::text     as direction,
      'email_for'::text    as relationship,
      null::text           as to_entity_type,
      null::uuid           as to_entity_id,
      null::text           as to_entity_title,
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
  -- 4. document_links joined to documents for snapshot fields. The
  -- document title is already projected into external_label; same
  -- de-duplication rationale as email_links — leave to_entity_title
  -- NULL so the UI keeps its single label codepath.
  dl as (
    select
      'document_link'::text as source_table,
      dl.id                 as link_id,
      'outbound'::text      as direction,
      'document_for'::text  as relationship,
      'document'::text      as to_entity_type,
      d.id                  as to_entity_id,
      null::text            as to_entity_title,
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
  -- Event title lives in external_label; leave to_entity_title NULL.
  cl as (
    select
      'calendar_event_link'::text as source_table,
      cl.id                       as link_id,
      'outbound'::text            as direction,
      'calendar_for'::text        as relationship,
      null::text                  as to_entity_type,
      null::uuid                  as to_entity_id,
      null::text                  as to_entity_title,
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
    'to_entity_title',      u.to_entity_title,
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
  'Unified read-only view of every kind of link an entity participates in: record_links (outbound and inbound) plus email_links, document_links, calendar_event_links. Each source has its visibility predicate re-enforced inline because SECURITY DEFINER bypasses RLS. As of 20260531 also projects to_entity_title for internal record_link arms — task/follow_up/inspection/purchase_request/document.title, company.name, contact.full_name, and for notes: coalesce(title, first-80-of-body-line-1, ''Untitled note''). External arms (email/document/calendar) leave to_entity_title NULL because the existing external_label is already authoritative.';

grant execute on function public.rpc_record_relations(text,uuid,int) to authenticated;

commit;
