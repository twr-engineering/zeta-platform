-- M0.2 — the durable settings write path.
--
-- Module: M0 §3.3 (TaxSettings), §3.7 (AuditLogEntry), rules 3, 9, 12
--
-- WHY THIS MIGRATION EXISTS — it closes the atomicity hole M0.1 left open and
-- documented (src/lib/audit/write.ts):
--
--   PostgREST gives no transaction across two calls, so M0.1's rename updated
--   the row and *then* wrote the audit entry. A failed entry insert leaves an
--   unaudited change, which rule 12 forbids outright. The fix is to move each
--   mutation into a database function: PostgREST wraps every request in a single
--   transaction, so the update, the audit entry and the recompute event either
--   all land or none do.
--
-- Every function here is SECURITY INVOKER (the default, and deliberate): RLS
-- still applies, so a function cannot become a hole around tenant isolation. The
-- actor is taken from auth.uid() inside the function and never from a parameter
-- — a forged actor is not merely rejected, it is unrepresentable.

-- ---------------------------------------------------------------------------
-- settings_change_event — the recompute-confirmation contract (M0 rule 3)
-- ---------------------------------------------------------------------------

-- Rule 3: booked figures on existing deals were computed with the rates in
-- force. A settings change recomputes *derived* deal fields behind an explicit
-- confirmation — but M1 owns the recompute mechanics and does not exist yet.
--
-- This table is the seam between them. M0.2 emits an event in the same
-- transaction as the settings change; M1 consumes the backlog and marks each
-- one done. The event carries everything needed to replay the restatement
-- later, which is what makes it safe for M0.2 to ship the rate edit before the
-- engine exists: nothing is lost, it is queued.
--
-- Historical payment rows are deliberately NOT in scope (rule 3): they are
-- statements of what was actually withheld and keep their stored splits.
create table public.settings_change_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,

  -- Bare uuid, FK-free, for the same reason as audit_log_entry.actor_user_id:
  -- the trail must outlive the account. Pinned to auth.uid() by RLS.
  actor_user_id uuid not null,

  -- 'tax_settings' today; M0.3's developer comm_base change (rule 8) is the
  -- next emitter, hence the entity columns rather than a tax-shaped table.
  entity_type text not null,
  entity_id uuid not null,

  -- Only the money-restating subset of the audit entry's diff — the fields M1
  -- must actually replay. Decimals as strings, exact (Master PRD §4.3).
  --   { "ewt_rate": { "old": "0.1000", "new": "0.0500" } }
  field_changes jsonb not null default '{}'::jsonb,

  -- What the agent was told when they confirmed. Recorded because the
  -- confirmation is a statement of consequence ("this will recompute N deals")
  -- and the trail should show what was actually claimed at the time.
  affected_deal_count integer not null default 0,

  -- The audit entry written in the same transaction, so an event always has its
  -- human-readable counterpart and vice versa.
  audit_entry_id uuid not null references public.audit_log_entry (id) on delete cascade,

  occurred_at timestamptz not null default now(),

  -- M1 stamps these when it has recomputed. NULL = pending.
  consumed_at timestamptz,
  consumed_by text,

  constraint settings_event_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint settings_event_changes_is_object check (jsonb_typeof(field_changes) = 'object'),
  constraint settings_event_changes_not_empty check (field_changes <> '{}'::jsonb),
  constraint settings_event_deal_count_non_negative check (affected_deal_count >= 0),
  constraint settings_event_consumer_pair check ((consumed_at is null) = (consumed_by is null))
);

comment on table public.settings_change_event is
  'M0 rule 3 recompute contract. M0.2 emits (atomically with the settings change); M1 consumes pending rows and stamps consumed_at/consumed_by. Emitted ONLY after the agent confirmed — a cancelled confirmation writes nothing (AC10).';
comment on column public.settings_change_event.field_changes is
  'The money-restating fields only, old→new, decimals as exact strings. Enough to replay the restatement without re-reading the settings row.';
comment on column public.settings_change_event.affected_deal_count is
  'What the confirmation claimed at the time. M0.2 always emits 0 — no deals table exists until M1.';

-- M1's pending-work queue. Partial: consumed events are history, not work.
create index settings_change_event_pending_idx
  on public.settings_change_event (workspace_id, occurred_at)
  where consumed_at is null;

alter table public.settings_change_event enable row level security;

create policy "settings_event_select_member"
  on public.settings_change_event for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "settings_event_insert_member"
  on public.settings_change_event for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and actor_user_id = (select auth.uid())
  );

-- M1 needs to mark events consumed, so unlike audit_log_entry this table is not
-- flatly append-only. The trigger below is what keeps that narrow: consumption
-- is the ONLY permitted update.
create policy "settings_event_consume_member"
  on public.settings_change_event for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create or replace function app.reject_settings_event_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Everything except the consumption stamp is immutable: the event records
  -- what happened, and history that can be edited is not a trail.
  if (new.id, new.workspace_id, new.actor_user_id, new.entity_type, new.entity_id,
      new.field_changes, new.affected_deal_count, new.audit_entry_id, new.occurred_at)
     is distinct from
     (old.id, old.workspace_id, old.actor_user_id, old.entity_type, old.entity_id,
      old.field_changes, old.affected_deal_count, old.audit_entry_id, old.occurred_at)
  then
    raise exception
      'settings_change_event is append-only except for consumption stamps'
      using errcode = 'restrict_violation';
  end if;

  -- Consumption is one-way. Re-opening a consumed event would let a caller
  -- replay a restatement twice, which is exactly the bug this queue prevents.
  if old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then
    raise exception
      'settings_change_event % is already consumed', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger settings_change_event_consumption_only
  before update on public.settings_change_event
  for each row execute function app.reject_settings_event_rewrite();

-- ---------------------------------------------------------------------------
-- app.write_audit_entry — the one place an entry is written
-- ---------------------------------------------------------------------------

-- Callable only from inside other functions in this schema (app is not exposed
-- via PostgREST). SECURITY INVOKER, so the audit_insert_member policy still
-- decides whether the insert is allowed.
create or replace function app.write_audit_entry(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action public.audit_action,
  p_field_changes jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.audit_log_entry (
    workspace_id, actor_user_id, entity_type, entity_id, action, field_changes
  )
  values (
    p_workspace_id,
    -- Never a parameter. RLS would reject a forged actor anyway; not accepting
    -- one means no caller can even try.
    (select auth.uid()),
    p_entity_type,
    p_entity_id,
    p_action,
    coalesce(p_field_changes, '{}'::jsonb)
  )
  returning id;
$$;

comment on function app.write_audit_entry is
  'Audit insert with the actor pinned to auth.uid(). Call from inside a mutation function so the change and its entry share one transaction (M0 rule 12).';

-- ---------------------------------------------------------------------------
-- public.update_tax_settings — FR-M0-03
-- ---------------------------------------------------------------------------

-- One transaction: diff → update → audit entry → recompute event.
--
-- NULL means "leave this field alone", so the caller sends only what the agent
-- touched. Rates arrive as numeric; the client MUST send them as JSON strings
-- ("0.1250"), which PostgREST casts straight to numeric — a JSON number would
-- have already been through an IEEE-754 double by the time it got here
-- (Master PRD §4.3).
create or replace function public.update_tax_settings(
  p_vat_rate numeric default null,
  p_vat_registered boolean default null,
  p_confirm_vat_registration boolean default false,
  p_ewt_rate numeric default null,
  p_property_vat_threshold numeric default null,
  p_chase_idle_months integer default null,
  p_affected_deal_count integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.tax_settings;
  v_after public.tax_settings;
  v_changes jsonb := '{}'::jsonb;
  v_restating jsonb := '{}'::jsonb;
  v_next_confirmed_at timestamptz;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- RLS narrows this to the caller's own row (one per workspace, one workspace
  -- per user in v1). FOR UPDATE locks it so the diff cannot race a concurrent
  -- save and record an old→new pair that never existed.
  select * into v_before from public.tax_settings for update;

  if not found then
    raise exception 'tax settings not found for this workspace'
      using errcode = 'no_data_found';
  end if;

  -- The question is answered when the agent answers it — not when a default is
  -- written (M0 §3.3: "no silent default"). Re-saving an unchanged answer must
  -- not re-stamp the date, or "confirmed" starts meaning "last saved".
  v_next_confirmed_at := case
    when p_confirm_vat_registration
     and (v_before.vat_registered_confirmed_at is null
          or coalesce(p_vat_registered, v_before.vat_registered) is distinct from v_before.vat_registered)
    then now()
    else v_before.vat_registered_confirmed_at
  end;

  update public.tax_settings set
    vat_rate = coalesce(p_vat_rate, vat_rate),
    vat_registered = coalesce(p_vat_registered, vat_registered),
    vat_registered_confirmed_at = v_next_confirmed_at,
    ewt_rate = coalesce(p_ewt_rate, ewt_rate),
    property_vat_threshold = coalesce(p_property_vat_threshold, property_vat_threshold),
    chase_idle_months = coalesce(p_chase_idle_months, chase_idle_months)
  where id = v_before.id
  returning * into v_after;

  -- Diffed from the rows themselves, not from the parameters: numeric(6,4)
  -- coerces 0.125 to 0.1250 on the way in, and the trail must show what was
  -- actually stored. `is distinct from` on numeric compares by value, so
  -- 0.1250 vs 0.125 is correctly a non-change.
  if v_after.vat_rate is distinct from v_before.vat_rate then
    v_changes := v_changes || jsonb_build_object('vat_rate',
      jsonb_build_object('old', v_before.vat_rate::text, 'new', v_after.vat_rate::text));
  end if;

  if v_after.ewt_rate is distinct from v_before.ewt_rate then
    v_changes := v_changes || jsonb_build_object('ewt_rate',
      jsonb_build_object('old', v_before.ewt_rate::text, 'new', v_after.ewt_rate::text));
  end if;

  if v_after.property_vat_threshold is distinct from v_before.property_vat_threshold then
    v_changes := v_changes || jsonb_build_object('property_vat_threshold',
      jsonb_build_object('old', v_before.property_vat_threshold::text, 'new', v_after.property_vat_threshold::text));
  end if;

  if v_after.vat_registered is distinct from v_before.vat_registered then
    v_changes := v_changes || jsonb_build_object('vat_registered',
      jsonb_build_object('old', to_jsonb(v_before.vat_registered), 'new', to_jsonb(v_after.vat_registered)));
  end if;

  if v_after.chase_idle_months is distinct from v_before.chase_idle_months then
    v_changes := v_changes || jsonb_build_object('chase_idle_months',
      jsonb_build_object('old', to_jsonb(v_before.chase_idle_months), 'new', to_jsonb(v_after.chase_idle_months)));
  end if;

  if v_after.vat_registered_confirmed_at is distinct from v_before.vat_registered_confirmed_at then
    v_changes := v_changes || jsonb_build_object('vat_registered_confirmed_at',
      jsonb_build_object(
        'old', to_jsonb(v_before.vat_registered_confirmed_at),
        'new', to_jsonb(v_after.vat_registered_confirmed_at)));
  end if;

  -- Nothing moved: no write to report, no entry to write. An audit row saying
  -- "0.1000 → 0.1000" is noise in a trail whose only job is showing what
  -- changed. The UPDATE above still ran (and touched updated_at) — harmless,
  -- and the price of diffing against the locked row rather than a stale read.
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('changed', false, 'field_changes', v_changes);
  end if;

  v_audit_id := app.write_audit_entry(
    v_after.workspace_id, 'tax_settings', v_after.id, 'update', v_changes
  );

  -- The money-restating subset (rule 3). chase_idle_months drives M6's chase
  -- flag, not a peso figure, and vat_registered_confirmed_at records that a
  -- question was answered — neither restates a booked number, so neither
  -- queues a recompute.
  v_restating := v_changes - 'chase_idle_months' - 'vat_registered_confirmed_at';

  if v_restating <> '{}'::jsonb then
    insert into public.settings_change_event (
      workspace_id, actor_user_id, entity_type, entity_id,
      field_changes, affected_deal_count, audit_entry_id
    )
    values (
      v_after.workspace_id, (select auth.uid()), 'tax_settings', v_after.id,
      v_restating, greatest(coalesce(p_affected_deal_count, 0), 0), v_audit_id
    )
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'changed', true,
    'field_changes', v_changes,
    'restating_changes', v_restating,
    'audit_entry_id', v_audit_id,
    'recompute_event_id', v_event_id,
    -- Rates as text, for the same reason every select casts them: a JSON number
    -- is a float by the time the client parses it.
    'tax_settings', jsonb_build_object(
      'id', v_after.id,
      'workspace_id', v_after.workspace_id,
      'vat_rate', v_after.vat_rate::text,
      'vat_registered', v_after.vat_registered,
      'vat_registered_confirmed_at', v_after.vat_registered_confirmed_at,
      'ewt_rate', v_after.ewt_rate::text,
      'property_vat_threshold', v_after.property_vat_threshold::text,
      'chase_idle_months', v_after.chase_idle_months,
      'created_at', v_after.created_at,
      'updated_at', v_after.updated_at
    )
  );
end;
$$;

comment on function public.update_tax_settings is
  'FR-M0-03. Atomic: diff, update, audit entry, recompute event — one transaction. Send rates as JSON strings ("0.1250"); a JSON number arrives as a float. Range validation stays on the table constraints, so a forged request cannot land an out-of-range rate.';

-- ---------------------------------------------------------------------------
-- public.rename_workspace — migrating M0.1 off the two-call pattern
-- ---------------------------------------------------------------------------

-- M0.1 shipped rename as update-then-audit and flagged it: "M0.2 should make
-- the pair atomic. Do not add more callers on the two-call pattern first."
-- This is that fix — the one existing caller moves here, and after this commit
-- there are no callers left on the old path.
create or replace function public.rename_workspace(p_name text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.workspace;
  v_after public.workspace;
  v_name text := btrim(p_name);
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from public.workspace for update;

  if not found then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if v_name = v_before.name then
    return jsonb_build_object('changed', false, 'name', v_before.name);
  end if;

  -- workspace_name_not_blank / workspace_name_max_len still do the enforcing;
  -- this function does not restate them.
  update public.workspace set name = v_name
  where id = v_before.id
  returning * into v_after;

  -- The workspace IS the tenant, so its own id is the workspace_id the entry
  -- is scoped by.
  perform app.write_audit_entry(
    v_after.id, 'workspace', v_after.id, 'update',
    jsonb_build_object('name', jsonb_build_object('old', v_before.name, 'new', v_after.name))
  );

  return jsonb_build_object('changed', true, 'name', v_after.name);
end;
$$;

comment on function public.rename_workspace is
  'FR-M0-02. Rename + audit entry in one transaction. Not friction-gated: rule 9 reserves gates for destructive and money-restating actions, and a name change is neither.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Both functions raise on a null auth.uid() and RLS refuses anon regardless;
-- revoking is belt-and-braces so an anonymous caller cannot even reach the body.
revoke all on function public.update_tax_settings(numeric, boolean, boolean, numeric, numeric, integer, integer) from public;
revoke all on function public.rename_workspace(text) from public;

grant execute on function public.update_tax_settings(numeric, boolean, boolean, numeric, numeric, integer, integer) to authenticated;
grant execute on function public.rename_workspace(text) to authenticated;
