-- M0.3 — the three configuration lists.
--
-- Module: M0 §3.4 (PropertyType), §3.5 (Developer), §3.6 (LeadSource),
--         rules 5, 6, 7, 8, 11, 12; FR-M0-04/05/06/07
--
-- These lists drive every dropdown and, through vat_rule and comm_base, a large
-- part of what M1 computes. The workbook keeps them as three editable blocks on
-- the Settings tab whose deletion silently breaks VAT (a missing type falls back
-- to Always-VAT, a missing developer to Net, both surfaced only as a Data Health
-- note afterwards). Rule 5 says that must never be reproduced: here the fallback
-- is replaced by prevention.
--
-- THE WRITE PATH IS M0.2'S, EXTENDED — read
-- 20260717200000_m02_settings_write_path.sql first. Every mutation below is one
-- database function, because PostgREST wraps a request in a transaction and two
-- calls have no such guarantee: the change, its audit entry (rule 12) and any
-- recompute event (rule 3) land together or not at all. All SECURITY INVOKER, so
-- RLS still governs and no function becomes a hole around tenant isolation. The
-- actor is auth.uid(), read inside the function, never a parameter.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- M0 §3.4. Sheet: "Threshold = exempt if List price <= VAT threshold, else
-- VAT-able. Always VAT / Always Exempt ignore price." The comparison M1 inherits
-- is strictly "above threshold => VAT-able" (rule 4).
create type commission.property_vat_rule as enum (
  'threshold',
  'always_vat',
  'always_exempt'
);

-- M0 §3.5. Sheet: "Gross (rate applies to gross TCP, e.g. Megaworld) or Net
-- (net-of-VAT price). Default Net."
create type commission.developer_comm_base as enum ('gross', 'net');

-- ---------------------------------------------------------------------------
-- property_type (M0 §3.4)
-- ---------------------------------------------------------------------------

create table commission.property_type (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  name text not null,
  vat_rule commission.property_vat_rule not null,

  -- Soft delete (M0 §3, rule 5): an archived type leaves the M1 dropdown and
  -- keeps every deal that references it computing exactly as before.
  archived_at timestamptz,

  -- M0 §3 preamble: "plus created_by/updated_by, which in v1 always resolve to
  -- the owner — kept for v2 compatibility and audit uniformity". FK-free for the
  -- same reason as audit_log_entry.actor_user_id: attribution must survive the
  -- account, and tenant integrity rides on workspace_id, which IS a foreign key.
  created_by uuid,
  updated_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Rule 7: uniqueness is case-insensitive AND trimmed. The trim is enforced as
  -- a constraint rather than done by a trigger, so "Condo " cannot be *stored*
  -- — a value that looks unique only because of a space it is not allowed to
  -- have would defeat the index below.
  constraint property_type_name_not_blank check (btrim(name) <> ''),
  constraint property_type_name_trimmed check (name = btrim(name)),
  constraint property_type_name_max_len check (char_length(name) <= 80)
);

comment on table commission.property_type is
  'M0 §3.4. Feeds M1''s Type dropdown; vat_rule decides Property VAT (RR 1-2024). Seeded only by the M0.3 offer flow or M1''s importer — never silently (rule 11).';
comment on column commission.property_type.archived_at is
  'Rule 5: archived types leave dropdowns and keep history. A referenced type can only ever be archived, never hard-deleted.';

-- Rule 7, enforced by the database rather than by the write path: the functions
-- below check first to give a useful message, this makes the guarantee.
--
-- NOT partial on archived_at, deliberately. Letting an active "Condo" coexist
-- with an archived "Condo" would give M7 two buckets with one name and make
-- rename-propagation (rule 6) ambiguous. Re-adding an archived name is a
-- RESTORE, and the create path says so.
create unique index property_type_name_unique
  on commission.property_type (workspace_id, lower(name));

-- The dropdown read (FR-M0-07: active items only).
create index property_type_active_idx
  on commission.property_type (workspace_id, name)
  where archived_at is null;

alter table commission.property_type enable row level security;

-- ---------------------------------------------------------------------------
-- developer (M0 §3.5)
-- ---------------------------------------------------------------------------

create table commission.developer (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  name text not null,
  -- Default Net per §3.5 and the sheet's own note.
  comm_base commission.developer_comm_base not null default 'net',

  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint developer_name_not_blank check (btrim(name) <> ''),
  constraint developer_name_trimmed check (name = btrim(name)),
  constraint developer_name_max_len check (char_length(name) <= 120)
);

comment on table commission.developer is
  'M0 §3.5. comm_base drives M1''s Comm Base column. Changing it is a rule-8 confirmed-recompute: it restates every deal booked against this developer.';

create unique index developer_name_unique
  on commission.developer (workspace_id, lower(name));

create index developer_active_idx
  on commission.developer (workspace_id, name)
  where archived_at is null;

alter table commission.developer enable row level security;

-- ---------------------------------------------------------------------------
-- lead_source (M0 §3.6)
-- ---------------------------------------------------------------------------

create table commission.lead_source (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  name text not null,

  -- Manual dropdown ordering (§3.6). Dense 1..N per workspace, maintained by
  -- reorder_lead_source. Deliberately NOT unique: renumbering a list passes
  -- through intermediate states, and a unique constraint would force either
  -- deferral or a pointless multi-pass shuffle for a value that is a display
  -- hint, not an identity.
  sort_order integer not null default 1,

  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lead_source_name_not_blank check (btrim(name) <> ''),
  constraint lead_source_name_trimmed check (name = btrim(name)),
  constraint lead_source_name_max_len check (char_length(name) <= 80),
  constraint lead_source_sort_order_positive check (sort_order >= 1)
);

comment on table commission.lead_source is
  'M0 §3.6. Feeds M1''s Source dropdown and M7''s Source Performance report. The sheet caps at 50 rows; there is no hard cap here — M0.3 warns past 50 so M7 stays legible (PRD open question 4: warning only).';
comment on column commission.lead_source.sort_order is
  'Dense 1..N across the workspace''s rows, archived included. Maintained by reorder_lead_source; never unique (see the table definition).';

create unique index lead_source_name_unique
  on commission.lead_source (workspace_id, lower(name));

create index lead_source_order_idx
  on commission.lead_source (workspace_id, sort_order);

alter table commission.lead_source enable row level security;

-- ---------------------------------------------------------------------------
-- Reference counts — the one thing M1 must implement (rule 5)
-- ---------------------------------------------------------------------------

-- "A PropertyType/Developer/LeadSource referenced by >= 1 deal can only be
-- archived; hard delete only when reference count = 0."
--
-- ZERO, ALWAYS, IN M0.3 — and honestly so, exactly like countAffectedDeals():
-- there is no deals table until M1, so the true count is zero, not unknown.
-- These three function bodies are the ONLY thing M1 changes to turn the whole
-- contract on: the delete policies below, the delete functions, the reference
-- count column in the UI and the blocked-delete audit trail all start carrying
-- real counts with no other edit. M1 replaces each body with, e.g.:
--
--   select count(*) from commission.deal where property_type_id = p_id;
--
-- `stable` (not immutable): the count changes as deals are written, and an
-- immutable marking would license the planner to cache it across statements.
create or replace function commission_private.property_type_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select 0::bigint $$;

create or replace function commission_private.developer_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select 0::bigint $$;

create or replace function commission_private.lead_source_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select 0::bigint $$;

comment on function commission_private.property_type_reference_count is
  'M0 rule 5. Returns 0 until M1 has deals — replace the body with a count over deal.property_type_id. Called by RLS, so the delete policy tightens automatically.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- THE DELETE POLICIES ARE WHERE RULE 5 IS ACTUALLY ENFORCED, and that placement
-- is the point. The milestone's definition of done is explicit: "a referenced
-- type cannot be hard-deleted via API even with a forged request." A check
-- inside delete_property_type() alone would not achieve that — PostgREST also
-- exposes DELETE /property_type?id=eq.… directly, which never enters the
-- function. Putting the reference count in the policy means the *database*
-- refuses, whatever the caller does: a forged direct delete of a referenced row
-- matches no rows and changes nothing.
--
-- No DELETE policy would have been the other way to be safe, but then the
-- function could not delete either (SECURITY INVOKER is not a bypass) — and
-- FR-M0-04/05/06 require the unreferenced delete to work.

create policy "property_type_select_member"
  on commission.property_type for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "property_type_insert_member"
  on commission.property_type for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "property_type_update_member"
  on commission.property_type for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

create policy "property_type_delete_unreferenced"
  on commission.property_type for delete
  to authenticated
  using (
    commission_private.is_workspace_member(workspace_id)
    and commission_private.property_type_reference_count(id) = 0
  );

create policy "developer_select_member"
  on commission.developer for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "developer_insert_member"
  on commission.developer for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "developer_update_member"
  on commission.developer for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

create policy "developer_delete_unreferenced"
  on commission.developer for delete
  to authenticated
  using (
    commission_private.is_workspace_member(workspace_id)
    and commission_private.developer_reference_count(id) = 0
  );

create policy "lead_source_select_member"
  on commission.lead_source for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "lead_source_insert_member"
  on commission.lead_source for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "lead_source_update_member"
  on commission.lead_source for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

create policy "lead_source_delete_unreferenced"
  on commission.lead_source for delete
  to authenticated
  using (
    commission_private.is_workspace_member(workspace_id)
    and commission_private.lead_source_reference_count(id) = 0
  );

create trigger property_type_touch_updated_at
  before update on commission.property_type
  for each row execute function commission_private.touch_updated_at();

create trigger developer_touch_updated_at
  before update on commission.developer
  for each row execute function commission_private.touch_updated_at();

create trigger lead_source_touch_updated_at
  before update on commission.lead_source
  for each row execute function commission_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- commission_private.current_workspace_id — the caller's tenant, from the database's own view
-- ---------------------------------------------------------------------------

-- v1 is one workspace per agent (M0 §3.1), and RLS narrows `workspace` to the
-- caller's own row. Reading it here rather than accepting a p_workspace_id
-- parameter keeps the tenant unforgeable for the same reason the actor is:
-- there is nothing to forge.
create or replace function commission_private.current_workspace_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select id from commission.workspace limit 1 $$;

-- Dense renumbering of a workspace's lead sources, preserving relative order.
-- Defined before its callers: SQL-language bodies are validated at CREATE time,
-- which is the ordering trap the foundation migrations already hit once.
create or replace function commission_private.renumber_lead_sources(p_workspace_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update commission.lead_source ls
  set sort_order = o.rn
  from (
    select id, row_number() over (order by sort_order, created_at) as rn
    from commission.lead_source
    where workspace_id = p_workspace_id
  ) o
  where ls.id = o.id and ls.sort_order is distinct from o.rn::integer;
$$;

-- ---------------------------------------------------------------------------
-- property_type mutations (FR-M0-04)
-- ---------------------------------------------------------------------------

create or replace function commission.create_property_type(
  p_name text,
  p_vat_rule commission.property_vat_rule
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_existing commission.property_type;
  v_row commission.property_type;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'a property type needs a name' using errcode = '23514';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Rule 7, checked here for the sake of the MESSAGE — the unique index is what
  -- makes the guarantee, including against a race this check cannot see. An
  -- archived collision is a different answer ("restore it") from an active one
  -- ("you already have this"), and the agent deserves the right one.
  select * into v_existing
  from commission.property_type
  where workspace_id = v_workspace_id and lower(name) = lower(v_name)
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_existing.archived_at is null then 'duplicate' else 'archived_duplicate' end,
      'id', v_existing.id,
      'name', v_existing.name
    );
  end if;

  insert into commission.property_type (workspace_id, name, vat_rule, created_by, updated_by)
  values (v_workspace_id, v_name, p_vat_rule, (select auth.uid()), (select auth.uid()))
  returning * into v_row;

  -- old = null on a create: the field went from not existing to a value, and
  -- the trail should read that way rather than inventing an empty string.
  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id, 'property_type', v_row.id, 'create',
    jsonb_build_object(
      'name', jsonb_build_object('old', null, 'new', v_row.name),
      'vat_rule', jsonb_build_object('old', null, 'new', v_row.vat_rule::text)
    )
  );

  return jsonb_build_object(
    'ok', true, 'id', v_row.id, 'name', v_row.name,
    'vat_rule', v_row.vat_rule::text, 'audit_entry_id', v_audit_id
  );
end;
$$;

-- NULL means "leave this field alone", as in update_tax_settings.
--
-- A vat_rule change is a rule-3 money restatement and emits a recompute event.
-- The PRD names only Developer.comm_base (rule 8) explicitly, but vat_rule
-- decides whether a deal's list price is VAT-able at all, which moves Net List
-- Price and therefore GCI — the same restatement by a different route. Treating
-- it as cosmetic because rule 8 forgot to name it would silently restate booked
-- money, which is the one thing rule 3 exists to prevent. Flagged in
-- progress.txt as a deliberate extension.
--
-- A RENAME IS NOT a restatement (rule 6): deals reference this row by id, so a
-- rename propagates to every display and aggregates under one bucket in M7 with
-- no number moving.
create or replace function commission.update_property_type(
  p_id uuid,
  p_name text default null,
  p_vat_rule commission.property_vat_rule default null,
  p_affected_deal_count integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.property_type;
  v_after commission.property_type;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_changes jsonb := '{}'::jsonb;
  v_restating jsonb := '{}'::jsonb;
  v_existing_id uuid;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_name is not null and v_name is null then
    raise exception 'a property type needs a name' using errcode = '23514';
  end if;

  -- RLS makes another tenant's row invisible, so a cross-tenant id is simply
  -- not found — never a 200 with someone else's data (AC9). FOR UPDATE locks the
  -- row so the diff cannot race a concurrent save and record an old→new pair
  -- that never existed.
  select * into v_before from commission.property_type where id = p_id for update;
  if not found then
    raise exception 'property type not found' using errcode = 'no_data_found';
  end if;

  if v_name is not null then
    select id into v_existing_id
    from commission.property_type
    where workspace_id = v_before.workspace_id
      and lower(name) = lower(v_name)
      and id <> p_id
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'duplicate', 'id', v_existing_id, 'name', v_name);
    end if;
  end if;

  update commission.property_type set
    name = coalesce(v_name, name),
    vat_rule = coalesce(p_vat_rule, vat_rule),
    updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  -- Diffed from the rows, not the parameters — the trail must show what was
  -- actually stored.
  if v_after.name is distinct from v_before.name then
    v_changes := v_changes || jsonb_build_object('name',
      jsonb_build_object('old', v_before.name, 'new', v_after.name));
  end if;

  if v_after.vat_rule is distinct from v_before.vat_rule then
    v_changes := v_changes || jsonb_build_object('vat_rule',
      jsonb_build_object('old', v_before.vat_rule::text, 'new', v_after.vat_rule::text));
    v_restating := v_restating || jsonb_build_object('vat_rule',
      jsonb_build_object('old', v_before.vat_rule::text, 'new', v_after.vat_rule::text));
  end if;

  -- Nothing moved: an entry saying "Condo → Condo" is noise in a trail whose
  -- only job is showing what changed.
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_after.id, 'name', v_after.name);
  end if;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'property_type', v_after.id, 'update', v_changes
  );

  if v_restating <> '{}'::jsonb then
    insert into commission.settings_change_event (
      workspace_id, actor_user_id, entity_type, entity_id,
      field_changes, affected_deal_count, audit_entry_id
    )
    values (
      v_before.workspace_id, (select auth.uid()), 'property_type', v_after.id,
      v_restating, greatest(coalesce(p_affected_deal_count, 0), 0), v_audit_id
    )
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'vat_rule', v_after.vat_rule::text, 'field_changes', v_changes,
    'audit_entry_id', v_audit_id, 'recompute_event_id', v_event_id
  );
end;
$$;

-- Archive/restore (rule 5). Not friction-gated: archiving is reversible in one
-- click and destroys nothing — every deal referencing the type still displays
-- and computes exactly as before. Rule 9 reserves gates for destructive and
-- money-restating acts, and gating an ordinary toggle trains the agent to click
-- through without reading.
create or replace function commission.set_property_type_archived(
  p_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.property_type;
  v_after commission.property_type;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.property_type where id = p_id for update;
  if not found then
    raise exception 'property type not found' using errcode = 'no_data_found';
  end if;

  if (v_before.archived_at is not null) = p_archived then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_before.id, 'name', v_before.name);
  end if;

  update commission.property_type
  set archived_at = case when p_archived then now() else null end,
      updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  perform commission_private.write_audit_entry(
    v_before.workspace_id, 'property_type', v_after.id,
    case when p_archived then 'archive' else 'restore' end::commission.audit_action,
    jsonb_build_object(
      'name', jsonb_build_object('old', v_before.name, 'new', v_after.name),
      'archived_at', jsonb_build_object(
        'old', to_jsonb(v_before.archived_at), 'new', to_jsonb(v_after.archived_at))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'archived', p_archived
  );
end;
$$;

-- Hard delete, permitted only at reference count 0 (rule 5).
--
-- WHY A BLOCKED DELETE RETURNS RATHER THAN RAISES: it writes a `delete_blocked`
-- audit entry (§3.7 has the action precisely for this), and an exception would
-- roll that entry back — the attempt would vanish along with the refusal. So the
-- refusal is a value, not an error, and the transaction commits with the trail
-- intact. The DELETE policy is the actual enforcement; this is the part that
-- explains itself to the agent and offers Archive instead (AC4).
create or replace function commission.delete_property_type(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row commission.property_type;
  v_count bigint;
  v_deleted uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from commission.property_type where id = p_id for update;
  if not found then
    raise exception 'property type not found' using errcode = 'no_data_found';
  end if;

  v_count := commission_private.property_type_reference_count(p_id);

  if v_count > 0 then
    -- old = new: nothing moved. This entry records an ATTEMPT and the state that
    -- refused it, which is why the viewer renders equal pairs as a single value.
    perform commission_private.write_audit_entry(
      v_row.workspace_id, 'property_type', v_row.id, 'delete_blocked',
      jsonb_build_object(
        'name', jsonb_build_object('old', v_row.name, 'new', v_row.name),
        'reference_count', jsonb_build_object('old', v_count, 'new', v_count)
      )
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'referenced',
      'id', v_row.id, 'name', v_row.name, 'reference_count', v_count
    );
  end if;

  delete from commission.property_type where id = p_id returning id into v_deleted;

  -- The policy disagreed with the count — i.e. M1 wired a real count into one
  -- and not the other. Fail loudly rather than reporting a delete that did not
  -- happen.
  if v_deleted is null then
    raise exception 'property type % could not be deleted: it is still referenced', p_id
      using errcode = 'restrict_violation';
  end if;

  perform commission_private.write_audit_entry(
    v_row.workspace_id, 'property_type', v_row.id, 'delete',
    jsonb_build_object(
      'name', jsonb_build_object('old', v_row.name, 'new', null),
      'vat_rule', jsonb_build_object('old', v_row.vat_rule::text, 'new', null)
    )
  );

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- developer mutations (FR-M0-05)
-- ---------------------------------------------------------------------------

create or replace function commission.create_developer(
  p_name text,
  p_comm_base commission.developer_comm_base default 'net'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_existing commission.developer;
  v_row commission.developer;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'a developer needs a name' using errcode = '23514';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_existing
  from commission.developer
  where workspace_id = v_workspace_id and lower(name) = lower(v_name)
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_existing.archived_at is null then 'duplicate' else 'archived_duplicate' end,
      'id', v_existing.id,
      'name', v_existing.name
    );
  end if;

  insert into commission.developer (workspace_id, name, comm_base, created_by, updated_by)
  values (v_workspace_id, v_name, coalesce(p_comm_base, 'net'), (select auth.uid()), (select auth.uid()))
  returning * into v_row;

  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id, 'developer', v_row.id, 'create',
    jsonb_build_object(
      'name', jsonb_build_object('old', null, 'new', v_row.name),
      'comm_base', jsonb_build_object('old', null, 'new', v_row.comm_base::text)
    )
  );

  return jsonb_build_object(
    'ok', true, 'id', v_row.id, 'name', v_row.name,
    'comm_base', v_row.comm_base::text, 'audit_entry_id', v_audit_id
  );
end;
$$;

-- Rule 8: "Comm Base changes on a Developer recompute that developer's deals
-- (with rule-3 confirmation), mirroring the sheet's live lookup." That is the
-- settings_change_event emitted below — the queue M1 drains. The sheet does this
-- live and silently; the whole point of the queue is that the SaaS does not.
create or replace function commission.update_developer(
  p_id uuid,
  p_name text default null,
  p_comm_base commission.developer_comm_base default null,
  p_affected_deal_count integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.developer;
  v_after commission.developer;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_changes jsonb := '{}'::jsonb;
  v_restating jsonb := '{}'::jsonb;
  v_existing_id uuid;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_name is not null and v_name is null then
    raise exception 'a developer needs a name' using errcode = '23514';
  end if;

  select * into v_before from commission.developer where id = p_id for update;
  if not found then
    raise exception 'developer not found' using errcode = 'no_data_found';
  end if;

  if v_name is not null then
    select id into v_existing_id
    from commission.developer
    where workspace_id = v_before.workspace_id
      and lower(name) = lower(v_name)
      and id <> p_id
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'duplicate', 'id', v_existing_id, 'name', v_name);
    end if;
  end if;

  update commission.developer set
    name = coalesce(v_name, name),
    comm_base = coalesce(p_comm_base, comm_base),
    updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  if v_after.name is distinct from v_before.name then
    v_changes := v_changes || jsonb_build_object('name',
      jsonb_build_object('old', v_before.name, 'new', v_after.name));
  end if;

  if v_after.comm_base is distinct from v_before.comm_base then
    v_changes := v_changes || jsonb_build_object('comm_base',
      jsonb_build_object('old', v_before.comm_base::text, 'new', v_after.comm_base::text));
    v_restating := v_restating || jsonb_build_object('comm_base',
      jsonb_build_object('old', v_before.comm_base::text, 'new', v_after.comm_base::text));
  end if;

  if v_changes = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_after.id, 'name', v_after.name);
  end if;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'developer', v_after.id, 'update', v_changes
  );

  if v_restating <> '{}'::jsonb then
    insert into commission.settings_change_event (
      workspace_id, actor_user_id, entity_type, entity_id,
      field_changes, affected_deal_count, audit_entry_id
    )
    values (
      v_before.workspace_id, (select auth.uid()), 'developer', v_after.id,
      v_restating, greatest(coalesce(p_affected_deal_count, 0), 0), v_audit_id
    )
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'comm_base', v_after.comm_base::text, 'field_changes', v_changes,
    'audit_entry_id', v_audit_id, 'recompute_event_id', v_event_id
  );
end;
$$;

create or replace function commission.set_developer_archived(
  p_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.developer;
  v_after commission.developer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.developer where id = p_id for update;
  if not found then
    raise exception 'developer not found' using errcode = 'no_data_found';
  end if;

  if (v_before.archived_at is not null) = p_archived then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_before.id, 'name', v_before.name);
  end if;

  update commission.developer
  set archived_at = case when p_archived then now() else null end,
      updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  perform commission_private.write_audit_entry(
    v_before.workspace_id, 'developer', v_after.id,
    case when p_archived then 'archive' else 'restore' end::commission.audit_action,
    jsonb_build_object(
      'name', jsonb_build_object('old', v_before.name, 'new', v_after.name),
      'archived_at', jsonb_build_object(
        'old', to_jsonb(v_before.archived_at), 'new', to_jsonb(v_after.archived_at))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'archived', p_archived
  );
end;
$$;

create or replace function commission.delete_developer(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row commission.developer;
  v_count bigint;
  v_deleted uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from commission.developer where id = p_id for update;
  if not found then
    raise exception 'developer not found' using errcode = 'no_data_found';
  end if;

  v_count := commission_private.developer_reference_count(p_id);

  if v_count > 0 then
    perform commission_private.write_audit_entry(
      v_row.workspace_id, 'developer', v_row.id, 'delete_blocked',
      jsonb_build_object(
        'name', jsonb_build_object('old', v_row.name, 'new', v_row.name),
        'reference_count', jsonb_build_object('old', v_count, 'new', v_count)
      )
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'referenced',
      'id', v_row.id, 'name', v_row.name, 'reference_count', v_count
    );
  end if;

  delete from commission.developer where id = p_id returning id into v_deleted;

  if v_deleted is null then
    raise exception 'developer % could not be deleted: it is still referenced', p_id
      using errcode = 'restrict_violation';
  end if;

  perform commission_private.write_audit_entry(
    v_row.workspace_id, 'developer', v_row.id, 'delete',
    jsonb_build_object(
      'name', jsonb_build_object('old', v_row.name, 'new', null),
      'comm_base', jsonb_build_object('old', v_row.comm_base::text, 'new', null)
    )
  );

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_source mutations (FR-M0-06)
-- ---------------------------------------------------------------------------

create or replace function commission.create_lead_source(p_name text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_existing commission.lead_source;
  v_row commission.lead_source;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'a lead source needs a name' using errcode = '23514';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_existing
  from commission.lead_source
  where workspace_id = v_workspace_id and lower(name) = lower(v_name)
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_existing.archived_at is null then 'duplicate' else 'archived_duplicate' end,
      'id', v_existing.id,
      'name', v_existing.name
    );
  end if;

  -- New sources land at the end of the agent's own ordering, which is where
  -- someone adding a row expects to find it.
  insert into commission.lead_source (workspace_id, name, sort_order, created_by, updated_by)
  values (
    v_workspace_id, v_name,
    coalesce((select max(sort_order) from commission.lead_source where workspace_id = v_workspace_id), 0) + 1,
    (select auth.uid()), (select auth.uid())
  )
  returning * into v_row;

  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id, 'lead_source', v_row.id, 'create',
    jsonb_build_object('name', jsonb_build_object('old', null, 'new', v_row.name))
  );

  return jsonb_build_object(
    'ok', true, 'id', v_row.id, 'name', v_row.name,
    'sort_order', v_row.sort_order, 'audit_entry_id', v_audit_id,
    -- The sheet's 50-row cap is a warning here, not a limit (PRD open question
    -- 4). The count is returned so the caller need not ask again.
    'total', (select count(*) from commission.lead_source where workspace_id = v_workspace_id)
  );
end;
$$;

-- A lead source has no money-bearing field: renaming is rule 6 (propagates by
-- id, aggregates under one row in M7 with no orphan bucket), so nothing here
-- restates and nothing is gated.
create or replace function commission.update_lead_source(
  p_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.lead_source;
  v_after commission.lead_source;
  v_name text := btrim(coalesce(p_name, ''));
  v_existing_id uuid;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'a lead source needs a name' using errcode = '23514';
  end if;

  select * into v_before from commission.lead_source where id = p_id for update;
  if not found then
    raise exception 'lead source not found' using errcode = 'no_data_found';
  end if;

  select id into v_existing_id
  from commission.lead_source
  where workspace_id = v_before.workspace_id
    and lower(name) = lower(v_name)
    and id <> p_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'duplicate', 'id', v_existing_id, 'name', v_name);
  end if;

  if v_name = v_before.name then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_before.id, 'name', v_before.name);
  end if;

  update commission.lead_source
  set name = v_name, updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'lead_source', v_after.id, 'update',
    jsonb_build_object('name', jsonb_build_object('old', v_before.name, 'new', v_after.name))
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'audit_entry_id', v_audit_id
  );
end;
$$;

create or replace function commission.set_lead_source_archived(
  p_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before commission.lead_source;
  v_after commission.lead_source;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.lead_source where id = p_id for update;
  if not found then
    raise exception 'lead source not found' using errcode = 'no_data_found';
  end if;

  if (v_before.archived_at is not null) = p_archived then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_before.id, 'name', v_before.name);
  end if;

  update commission.lead_source
  set archived_at = case when p_archived then now() else null end,
      updated_by = (select auth.uid())
  where id = p_id
  returning * into v_after;

  -- Rule 6 / prompt edge case 18: an archived source must never orphan deals —
  -- M7 keeps them as an "(inactive)" bucket, which is why this soft-deletes and
  -- the reporting read (FR-M0-07) returns archived rows too.
  perform commission_private.write_audit_entry(
    v_before.workspace_id, 'lead_source', v_after.id,
    case when p_archived then 'archive' else 'restore' end::commission.audit_action,
    jsonb_build_object(
      'name', jsonb_build_object('old', v_before.name, 'new', v_after.name),
      'archived_at', jsonb_build_object(
        'old', to_jsonb(v_before.archived_at), 'new', to_jsonb(v_after.archived_at))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'name', v_after.name,
    'archived', p_archived
  );
end;
$$;

create or replace function commission.delete_lead_source(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row commission.lead_source;
  v_count bigint;
  v_deleted uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from commission.lead_source where id = p_id for update;
  if not found then
    raise exception 'lead source not found' using errcode = 'no_data_found';
  end if;

  v_count := commission_private.lead_source_reference_count(p_id);

  if v_count > 0 then
    perform commission_private.write_audit_entry(
      v_row.workspace_id, 'lead_source', v_row.id, 'delete_blocked',
      jsonb_build_object(
        'name', jsonb_build_object('old', v_row.name, 'new', v_row.name),
        'reference_count', jsonb_build_object('old', v_count, 'new', v_count)
      )
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'referenced',
      'id', v_row.id, 'name', v_row.name, 'reference_count', v_count
    );
  end if;

  delete from commission.lead_source where id = p_id returning id into v_deleted;

  if v_deleted is null then
    raise exception 'lead source % could not be deleted: it is still referenced', p_id
      using errcode = 'restrict_violation';
  end if;

  perform commission_private.write_audit_entry(
    v_row.workspace_id, 'lead_source', v_row.id, 'delete',
    jsonb_build_object('name', jsonb_build_object('old', v_row.name, 'new', null))
  );

  -- The list keeps its dense 1..N ordering: a gap is not wrong, but it makes
  -- every later reorder reason about holes for no benefit.
  perform commission_private.renumber_lead_sources(v_row.workspace_id);

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name);
end;
$$;

-- Drag sort (§3.6, M0 §6).
--
-- WHY THIS TAKES ONE ROW AND A POSITION rather than the whole new order: a drag
-- has one subject. Moving the 13th source to the top shifts twelve others as a
-- mechanical consequence — recording twelve audit entries would bury the one
-- edit the agent actually made under its own side effects, and rule 12's trail
-- is meant to answer "what did I change". So exactly one entry is written, on
-- the row that moved, saying where it moved from and to.
--
-- p_position is a 1..N slot in the workspace's full ordering (archived rows
-- included — they hold their place so restoring one is not a surprise).
create or replace function commission.reorder_lead_source(
  p_id uuid,
  p_position integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row commission.lead_source;
  v_total integer;
  v_pos integer;
  v_old integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from commission.lead_source where id = p_id for update;
  if not found then
    raise exception 'lead source not found' using errcode = 'no_data_found';
  end if;

  -- Renumber first: a list that has drifted (an older delete, an import) must
  -- not make positions mean different things to the client and the server.
  perform commission_private.renumber_lead_sources(v_row.workspace_id);

  select count(*) into v_total from commission.lead_source where workspace_id = v_row.workspace_id;
  select sort_order into v_old from commission.lead_source where id = p_id;

  -- Clamped, not rejected: a drop past the end of the list means "last", which
  -- is what the agent did, not an error to argue with.
  v_pos := least(greatest(coalesce(p_position, v_old), 1), v_total);

  if v_pos = v_old then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_row.id, 'sort_order', v_old);
  end if;

  -- Everyone else closes ranks and reopens at the target slot. sort_order is
  -- deliberately not unique, so these intermediate states need no deferral.
  update commission.lead_source ls
  set sort_order = o.new_order
  from (
    select id, case when rn < v_pos then rn else rn + 1 end as new_order
    from (
      select id, row_number() over (order by sort_order, created_at) as rn
      from commission.lead_source
      where workspace_id = v_row.workspace_id and id <> p_id
    ) x
  ) o
  where ls.id = o.id and ls.sort_order is distinct from o.new_order::integer;

  update commission.lead_source
  set sort_order = v_pos, updated_by = (select auth.uid())
  where id = p_id;

  perform commission_private.write_audit_entry(
    v_row.workspace_id, 'lead_source', v_row.id, 'update',
    jsonb_build_object(
      'name', jsonb_build_object('old', v_row.name, 'new', v_row.name),
      'sort_order', jsonb_build_object('old', v_old, 'new', v_pos)
    )
  );

  return jsonb_build_object('ok', true, 'changed', true, 'id', v_row.id, 'sort_order', v_pos);
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed offers (rule 11)
-- ---------------------------------------------------------------------------

-- "Workspace creation seeds nothing silently. The first-run wizard (M10)
-- *offers* the seed lists; the agent can accept, edit, or skip."
--
-- THE CONTENT IS NOT HERE, AND THAT IS THE POINT. These functions take whatever
-- the agent accepted; the workbook's example lists live in TypeScript
-- (src/lib/settings/seed-lists.ts) where the UI can show them, let the agent
-- deselect rows, and hand back only what they chose. A seed list hard-coded in
-- SQL would be a product default wearing an offer's clothes — §3.4/§3.5 are
-- explicit that these are "user-editable, NOT hard-coded" and "never product
-- defaults".
--
-- Refusing a non-empty list is what makes accepting the offer idempotent: a
-- double-click, a retry after a flaky connection, or M10 re-running its wizard
-- cannot silently double the list.
create or replace function commission.seed_property_types(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
  v_row commission.property_type;
  v_created integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  if exists (select 1 from commission.property_type where workspace_id = v_workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_empty');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into commission.property_type (workspace_id, name, vat_rule, created_by, updated_by)
    values (
      v_workspace_id,
      btrim(v_item ->> 'name'),
      (v_item ->> 'vat_rule')::commission.property_vat_rule,
      (select auth.uid()), (select auth.uid())
    )
    returning * into v_row;

    -- One entry per row, not one for the batch: rule 12 is about what the list
    -- contains and where it came from, and "seeded 7 types" would leave the
    -- agent unable to answer "where did Condotel come from?" six months later.
    perform commission_private.write_audit_entry(
      v_workspace_id, 'property_type', v_row.id, 'create',
      jsonb_build_object(
        'name', jsonb_build_object('old', null, 'new', v_row.name),
        'vat_rule', jsonb_build_object('old', null, 'new', v_row.vat_rule::text)
      )
    );

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

create or replace function commission.seed_developers(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
  v_row commission.developer;
  v_created integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  if exists (select 1 from commission.developer where workspace_id = v_workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_empty');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into commission.developer (workspace_id, name, comm_base, created_by, updated_by)
    values (
      v_workspace_id,
      btrim(v_item ->> 'name'),
      coalesce((v_item ->> 'comm_base')::commission.developer_comm_base, 'net'),
      (select auth.uid()), (select auth.uid())
    )
    returning * into v_row;

    perform commission_private.write_audit_entry(
      v_workspace_id, 'developer', v_row.id, 'create',
      jsonb_build_object(
        'name', jsonb_build_object('old', null, 'new', v_row.name),
        'comm_base', jsonb_build_object('old', null, 'new', v_row.comm_base::text)
      )
    );

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

create or replace function commission.seed_lead_sources(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
  v_row commission.lead_source;
  v_created integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  if exists (select 1 from commission.lead_source where workspace_id = v_workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_empty');
  end if;

  -- The accepted order IS the order: the offer is a list the agent just looked
  -- at and edited, and re-sorting it on the way in would answer a question they
  -- did not ask.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_created := v_created + 1;

    insert into commission.lead_source (workspace_id, name, sort_order, created_by, updated_by)
    values (
      v_workspace_id, btrim(v_item ->> 'name'), v_created,
      (select auth.uid()), (select auth.uid())
    )
    returning * into v_row;

    perform commission_private.write_audit_entry(
      v_workspace_id, 'lead_source', v_row.id, 'create',
      jsonb_build_object('name', jsonb_build_object('old', null, 'new', v_row.name))
    );
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Every function raises on a null auth.uid() and RLS refuses anon regardless;
-- revoking is belt-and-braces so an anonymous caller cannot reach the body.
revoke all on function commission.create_property_type(text, commission.property_vat_rule) from public;
revoke all on function commission.update_property_type(uuid, text, commission.property_vat_rule, integer) from public;
revoke all on function commission.set_property_type_archived(uuid, boolean) from public;
revoke all on function commission.delete_property_type(uuid) from public;
revoke all on function commission.seed_property_types(jsonb) from public;

revoke all on function commission.create_developer(text, commission.developer_comm_base) from public;
revoke all on function commission.update_developer(uuid, text, commission.developer_comm_base, integer) from public;
revoke all on function commission.set_developer_archived(uuid, boolean) from public;
revoke all on function commission.delete_developer(uuid) from public;
revoke all on function commission.seed_developers(jsonb) from public;

revoke all on function commission.create_lead_source(text) from public;
revoke all on function commission.update_lead_source(uuid, text) from public;
revoke all on function commission.set_lead_source_archived(uuid, boolean) from public;
revoke all on function commission.delete_lead_source(uuid) from public;
revoke all on function commission.reorder_lead_source(uuid, integer) from public;
revoke all on function commission.seed_lead_sources(jsonb) from public;

grant execute on function commission.create_property_type(text, commission.property_vat_rule) to authenticated;
grant execute on function commission.update_property_type(uuid, text, commission.property_vat_rule, integer) to authenticated;
grant execute on function commission.set_property_type_archived(uuid, boolean) to authenticated;
grant execute on function commission.delete_property_type(uuid) to authenticated;
grant execute on function commission.seed_property_types(jsonb) to authenticated;

grant execute on function commission.create_developer(text, commission.developer_comm_base) to authenticated;
grant execute on function commission.update_developer(uuid, text, commission.developer_comm_base, integer) to authenticated;
grant execute on function commission.set_developer_archived(uuid, boolean) to authenticated;
grant execute on function commission.delete_developer(uuid) to authenticated;
grant execute on function commission.seed_developers(jsonb) to authenticated;

grant execute on function commission.create_lead_source(text) to authenticated;
grant execute on function commission.update_lead_source(uuid, text) to authenticated;
grant execute on function commission.set_lead_source_archived(uuid, boolean) to authenticated;
grant execute on function commission.delete_lead_source(uuid) to authenticated;
grant execute on function commission.reorder_lead_source(uuid, integer) to authenticated;
grant execute on function commission.seed_lead_sources(jsonb) to authenticated;
