-- M4.1 — the receivable entity + its deal-event consumer.
--
-- Module: M4 PRD §3.1 (27-field receivable), §3.2 Rule K, §4 rules 1–2;
--         M4_Milestones § M4.1
--
-- Exactly ONE receivable per deal, created and restated by the SYSTEM from the
-- deal event log (FR-M4-01/02/03) — never user-created, never user-deleted (§4
-- rule 1). This migration is the schema + the consumer + the two user-editable
-- mutations M4.1 owns (status lifecycle, variance/write-off and the full override
-- friction gate are M4.3; payments math — collected/balance/idle/aging — is M4.2).
--
-- EVENT CONSUMPTION WITH M4'S OWN CURSOR (m1_2 handoff contract). deal_event is an
-- append-only log with several independent consumers, each tracking its own
-- cursor; M4's is receivable_event_cursor. consume_deal_events drains it: it reads
-- events after the cursor in (occurred_at, id) order and mirrors each deal's
-- snapshot onto its receivable — idempotent (upsert on the unique deal_id) and
-- resumable (the cursor). Re-running from the beginning re-projects every deal to
-- the same state with no duplicates. The app calls it synchronously right after
-- every deal mutation and after each bulk recompute, so a deal write is never
-- visible without its receivable (monolith-first, Master PRD §6).

-- ---------------------------------------------------------------------------
-- receivable_status (§3.1 field 14): Open / Closed / Cancelled, default Open
-- ---------------------------------------------------------------------------

create type commission.receivable_status as enum ('open', 'closed', 'cancelled');

-- ---------------------------------------------------------------------------
-- receivable (M4 PRD §3.1)
-- ---------------------------------------------------------------------------

create table commission.receivable (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- Field 1 — 1:1 with the deal, immutable, system-set. ON DELETE CASCADE: a deal
  -- can only be hard-deleted with zero financial children (M1 rule 2), and when it
  -- is, its receivable goes with it (the receivable is a projection of the deal).
  deal_id uuid not null references commission.deal (id) on delete cascade,

  -- --- Mirrored identity (§3.1 fields 2–10; C, restated on every deal.updated) ---
  -- Projections, not copies that drift (§4 rule 2): consume_deal_events restates
  -- them from the deal snapshot on every deal event. FKs (developer/lead_source)
  -- are mirrored rather than denormalised names, so a developer rename is reflected
  -- automatically and never goes stale — the SaaS improvement over the sheet's
  -- ARRAYFORMULA copy. `payor` (col S) is derived in the read projections
  -- (developer for developer deals, else client) rather than stored, for the same
  -- no-drift reason; the ledger UI (M4.4) resolves it via the developer join.
  deal_code text not null,                                     -- 2 (col B)
  booked_year integer not null,                                -- 3 (col C)
  developer_id uuid references commission.developer (id),          -- 4 (col D; null: Resale/Rental)
  client_name text not null,                                   -- 5 (col E)
  property_details text not null,                              -- 6 (col F)
  deal_type commission.deal_type not null,                         -- 7 (col G)
  lead_source_id uuid not null references commission.lead_source (id), -- 8 (col Y; feeds M7)
  booking_date date not null,                                  -- 9 (col U)

  -- --- Rule K anchors (§3.1 fields 11–13) ---------------------------------------
  booked_net_gci numeric(14, 2) not null,                      -- 11 (col H) = deal.net_gci (K.1)
  -- Mirrored from deal.default_total_collectible (Rule K.2, engine full precision).
  default_total_collectible numeric(14, 2) not null,
  -- Field 12 (col R) — the user's override. Blue-cell input (M4.3 UI); friction-gated
  -- by the REQUIRED note (edge case 17). Null = no override.
  confirmed_collectible numeric(14, 2),
  -- Field 13 (col I) — Rule K.2 precedence, as a generated column so it can never
  -- drift from its inputs and is indexable for M6/M9 balance views. confirmed wins
  -- when set, else the default.
  total_collectible numeric(14, 2)
    generated always as (coalesce(confirmed_collectible, default_total_collectible)) stored,

  -- --- Inputs (§3.1 fields 14, 26) ----------------------------------------------
  status commission.receivable_status not null default 'open',     -- 14 (col J)
  next_action_note text,                                       -- 26 (col T)

  -- --- Payment-derived (§3.1 fields 15–25) --------------------------------------
  -- Present in the schema at their empty/zero defaults; POPULATED BY M4.2 (payments
  -- aggregation) and M4.3 (variance/write-off at close/cancel). No payments math in
  -- M4.1 — these are reserved columns, honestly zero/null until then.
  collected_net numeric(14, 2) not null default 0,             -- 15 (col K) — Rule L (M4.2)
  balance numeric(14, 2),                                      -- 16 (col L) — Rule M (M4.2)
  pct_collected numeric(9, 6),                                 -- 17 (col M) — Rule M (M4.2)
  variance numeric(14, 2),                                     -- 18 (col N) — Rule N (M4.3, Closed)
  written_off numeric(14, 2),                                  -- 19 — Rule O (M4.3, Cancelled)
  last_payment_date date,                                      -- 20 (col O) — M4.2
  first_payment_date date,                                     -- 21 (col W) — M4.2
  months_idle integer,                                         -- 22 (col P) — Rule P (M4.2)
  age_months integer,                                          -- 23 (col V) — Rule P (M4.2)
  days_to_first_release integer,                               -- 24 (col X) — M4.2
  chase_priority numeric,                                      -- 25 (col Q) — Rule Q (M4.2)

  -- --- Soft delete + optimistic lock + audit (§3.1 field 27) --------------------
  -- Archive follows the DEAL's archive (§4 rules 1, 16): consume_deal_events sets
  -- this from the deal snapshot's archived_at. Never independently user-archived.
  archived_at timestamptz,
  version integer not null default 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1:1 with the deal (FR-M4-01: no code path may create a second receivable).
  constraint receivable_deal_unique unique (deal_id),
  -- Override, when set, is a positive figure (§3.1 field 12).
  constraint receivable_confirmed_positive
    check (confirmed_collectible is null or confirmed_collectible > 0),
  constraint receivable_next_action_len
    check (next_action_note is null or char_length(next_action_note) <= 500),
  constraint receivable_version_positive check (version >= 1)
);

comment on table commission.receivable is
  'M4 PRD §3.1. One receivable per deal (unique deal_id), system-managed. Identity fields mirror the deal (restated by consume_deal_events); booked_net_gci and default_total_collectible mirror the deal''s Rule K figures; total_collectible is generated (override precedence). Payment-derived columns are M4.2/M4.3.';
comment on column commission.receivable.total_collectible is
  'M4 Rule K.2 (col I). Generated: coalesce(confirmed_collectible, default_total_collectible). The override (blue cell) wins when set, else the booked default.';
comment on column commission.receivable.developer_id is
  'Mirror of deal.developer_id (§3.1 field 4). Stored as the FK, not a denormalised name, so a developer rename is reflected without drift (§4 rule 2).';

-- Reads: 1:1 lookup by deal (the consumer + the deal detail cross-link), and the
-- ledger/aggregate filters M4.4/M6/M7/M8 will use. The unique constraint already
-- indexes deal_id; these back the active list, per-developer/source rollups and
-- the year views. Partial on active for the common ledger read (archived excluded).
create index receivable_active_idx
  on commission.receivable (workspace_id, status)
  where archived_at is null;
create index receivable_developer_idx
  on commission.receivable (workspace_id, developer_id)
  where developer_id is not null;
create index receivable_lead_source_idx
  on commission.receivable (workspace_id, lead_source_id);
create index receivable_booked_year_idx
  on commission.receivable (workspace_id, booked_year);

alter table commission.receivable enable row level security;

-- Tenant isolation is the RLS job (M0 rule 1), same shape as deal. There is NO
-- delete policy for authenticated: a receivable is never user-deleted (§4 rule 1);
-- it leaves only when its deal is hard-deleted, via the FK cascade (which does not
-- consult RLS). INSERT/UPDATE exist for the SECURITY INVOKER consumer + mutations.
create policy "receivable_select_member"
  on commission.receivable for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "receivable_insert_member"
  on commission.receivable for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "receivable_update_member"
  on commission.receivable for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

create trigger receivable_touch_updated_at
  before update on commission.receivable
  for each row execute function commission_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- receivable_event_cursor — M4's own cursor over the deal event log
-- ---------------------------------------------------------------------------
-- One row per workspace. (last_occurred_at, last_event_id) is the high-water mark
-- of consumed events; '-infinity' start replays the whole log the first time (and
-- proves replay-from-zero correctness — reset it and re-drain to re-project every
-- deal identically). Each consumer of deal_event keeps its own cursor; there is no
-- shared consumed stamp (m1_2 handoff).
create table commission.receivable_event_cursor (
  workspace_id uuid primary key references commission.workspace (id) on delete cascade,
  last_occurred_at timestamptz not null default '-infinity',
  last_event_id uuid,
  updated_at timestamptz not null default now()
);

comment on table commission.receivable_event_cursor is
  'M4.1. The receivable consumer''s high-water mark over commission.deal_event, per workspace. Ordered by (occurred_at, id). Reset to defaults to replay the whole log; consume_deal_events is idempotent so a replay re-projects to the same state.';

alter table commission.receivable_event_cursor enable row level security;

create policy "receivable_cursor_select_member"
  on commission.receivable_event_cursor for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "receivable_cursor_insert_member"
  on commission.receivable_event_cursor for insert
  to authenticated
  with check (commission_private.is_workspace_member(workspace_id));

create policy "receivable_cursor_update_member"
  on commission.receivable_event_cursor for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- commission.consume_deal_events — drain M4's cursor, project receivables (FR-M4-01/02/03)
-- ---------------------------------------------------------------------------
-- Reads deal events after the cursor and upserts each deal's receivable from the
-- event's new_values snapshot: mirrors + Rule K anchors + archive state. The
-- ON CONFLICT overwrites ONLY the mirror/anchor/archive columns — the user inputs
-- (status, confirmed_collectible, next_action_note) are preserved across restates.
-- SECURITY INVOKER, workspace-scoped by RLS. Idempotent + resumable by construction.
create or replace function commission.consume_deal_events(p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_last_at timestamptz;
  v_last_id uuid;
  v_processed integer := 0;
  r record;
  v_snap jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := commission_private.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Load (or initialise) the cursor, locked so concurrent drains serialise on it
  -- and can never double-advance or interleave.
  select last_occurred_at, last_event_id into v_last_at, v_last_id
  from commission.receivable_event_cursor
  where workspace_id = v_ws
  for update;

  if not found then
    insert into commission.receivable_event_cursor (workspace_id)
    values (v_ws)
    on conflict (workspace_id) do nothing;

    select last_occurred_at, last_event_id into v_last_at, v_last_id
    from commission.receivable_event_cursor
    where workspace_id = v_ws
    for update;
  end if;

  for r in
    select e.id, e.occurred_at, e.deal_id, e.new_values
    from commission.deal_event e
    where e.workspace_id = v_ws
      and (
        e.occurred_at > v_last_at
        or (e.occurred_at = v_last_at and v_last_id is not null and e.id > v_last_id)
      )
    order by e.occurred_at, e.id
    limit greatest(p_limit, 1)
  loop
    -- created/updated/archived/restored all carry the current snapshot in new_values.
    v_snap := r.new_values;

    insert into commission.receivable (
      workspace_id, deal_id, deal_code, booked_year, developer_id, client_name,
      property_details, deal_type, lead_source_id, booking_date,
      booked_net_gci, default_total_collectible, archived_at, created_by, updated_by
    )
    values (
      v_ws, r.deal_id,
      v_snap->>'deal_code',
      (v_snap->>'booked_year')::integer,
      (v_snap->>'developer_id')::uuid,
      v_snap->>'client_name',
      v_snap->>'property_details',
      (v_snap->>'deal_type')::commission.deal_type,
      (v_snap->>'lead_source_id')::uuid,
      (v_snap->>'booked_date')::date,
      (v_snap->>'net_gci')::numeric,
      (v_snap->>'default_total_collectible')::numeric,
      (v_snap->>'archived_at')::timestamptz,
      v_uid, v_uid
    )
    on conflict (deal_id) do update set
      deal_code = excluded.deal_code,
      booked_year = excluded.booked_year,
      developer_id = excluded.developer_id,
      client_name = excluded.client_name,
      property_details = excluded.property_details,
      deal_type = excluded.deal_type,
      lead_source_id = excluded.lead_source_id,
      booking_date = excluded.booking_date,
      booked_net_gci = excluded.booked_net_gci,
      default_total_collectible = excluded.default_total_collectible,
      archived_at = excluded.archived_at,
      updated_by = v_uid;

    v_last_at := r.occurred_at;
    v_last_id := r.id;
    v_processed := v_processed + 1;
  end loop;

  if v_processed > 0 then
    update commission.receivable_event_cursor
    set last_occurred_at = v_last_at,
        last_event_id = v_last_id,
        updated_at = now()
    where workspace_id = v_ws;
  end if;

  return jsonb_build_object('ok', true, 'processed', v_processed);
end;
$$;

comment on function commission.consume_deal_events is
  'FR-M4-01/02/03. Drains M4''s cursor over commission.deal_event, upserting each deal''s receivable from the event snapshot (mirrors + Rule K anchors + archive state; user inputs preserved). Idempotent (unique deal_id) and resumable (cursor). Call in a loop until processed = 0.';

revoke all on function commission.consume_deal_events(integer) from public;
grant execute on function commission.consume_deal_events(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.set_next_action_note — FR-M4-07 (a plain, audited edit; not gated)
-- ---------------------------------------------------------------------------
-- The Next Action note is not money-restating, so it is a plain edit — no friction
-- gate — but still audited (rule 12). Empty/blank clears it to null.
create or replace function commission.set_next_action_note(
  p_receivable_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before commission.receivable;
  v_note text;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  if v_before.next_action_note is not distinct from v_note then
    return jsonb_build_object('ok', true, 'changed', false, 'id', v_before.id);
  end if;

  update commission.receivable
  set next_action_note = v_note,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'next_action_note', jsonb_build_object(
        'old', to_jsonb(v_before.next_action_note), 'new', to_jsonb(v_note))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_before.id, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.set_next_action_note is
  'FR-M4-07. Sets/clears the receivable''s Next Action note — a plain audited edit (not money-restating, no friction gate). Blank clears to null.';

revoke all on function commission.set_next_action_note(uuid, text) from public;
grant execute on function commission.set_next_action_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.set_confirmed_collectible — FR-M4-06 (edge case 17: note REQUIRED)
-- ---------------------------------------------------------------------------
-- The Confirmed Collectible override (§3.3 Corrections case 2). Setting a value
-- REQUIRES a non-empty Next Action note (the note is the override's audit trail —
-- the v1 friction gate, edge case 17) and the value must be > 0. Clearing (null)
-- reverts total_collectible to the Rule K.2 default; a note is captured when
-- supplied. Every set/change/clear is audited old→new with the note snapshot.
-- (The restated-override review flag + explicit confirmation dialog are M4.3.)
create or replace function commission.set_confirmed_collectible(
  p_receivable_id uuid,
  p_value numeric,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before commission.receivable;
  v_after commission.receivable;
  v_note text;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  -- Setting an override: value must be positive AND carry its note (edge case 17).
  if p_value is not null then
    if p_value <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    if v_note is null then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
  end if;

  update commission.receivable
  set confirmed_collectible = p_value,
      -- Capture the supplied note; on a clear with no note, keep the existing one.
      next_action_note = coalesce(v_note, next_action_note),
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id
  returning * into v_after;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'confirmed_collectible', jsonb_build_object(
        'old', case when v_before.confirmed_collectible is null then null
                    else to_jsonb(v_before.confirmed_collectible::text) end,
        'new', case when v_after.confirmed_collectible is null then null
                    else to_jsonb(v_after.confirmed_collectible::text) end),
      'next_action_note', jsonb_build_object(
        'old', to_jsonb(v_before.next_action_note),
        'new', to_jsonb(v_after.next_action_note))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'confirmed_collectible',
      case when v_after.confirmed_collectible is null then null
           else v_after.confirmed_collectible::text end,
    'total_collectible', v_after.total_collectible::text,
    'default_total_collectible', v_after.default_total_collectible::text,
    'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.set_confirmed_collectible is
  'FR-M4-06 / edge case 17. Sets/changes/clears the Confirmed Collectible override; setting REQUIRES a positive value and a non-empty note (the friction gate). Clearing reverts total_collectible to the Rule K.2 default. Audited old→new with the note. Restated-override flag is M4.3.';

revoke all on function commission.set_confirmed_collectible(uuid, numeric, text) from public;
grant execute on function commission.set_confirmed_collectible(uuid, numeric, text) to authenticated;
