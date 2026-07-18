-- M6.1 — AnnualTargetOverride (the Collections Dashboard's manual annual GCI target).
--
-- Module: M6 PRD §3.1 (the sheet's cell E15), FR-M6-03; M6_Milestones § M6.1
--
-- One optional override per (workspace, year). When set, its amount REPLACES the
-- TargetTable-derived annual GCI target everywhere in M6 (Section 2 tile + pace,
-- Section 6 cumulative target) — the SaaS equivalent of the sheet's blue E15 cell.
-- M6 owns this entity; everything else on the dashboard is a computed read model.
--
-- WHY A REAL TABLE, NOT A SETTING. The override is a money-planning act (§2 jobs):
-- every set/change/clear is confirmed (friction gate at the action layer) and
-- AUDIT-LOGGED old→new, so the agent can see when and why they moved their goal —
-- the sheet's anonymous cell becomes a first-class audited record (§1.5).
--
-- FRICTION GATE IS THE ACTION LAYER'S JOB (like the receivable transitions /
-- deal-edit gate). These functions are the single writer + audit; the explicit
-- confirmation token (checkConfirmation, M0 §3.2 — mode 'checked', OQ3) is enforced
-- in src/lib/dashboard/actions.ts before the RPC. Tenant isolation is RLS
-- (app.current_workspace_id() scopes every write to the caller's workspace).

-- ---------------------------------------------------------------------------
-- public.annual_target_override — one optional row per (workspace, year)
-- ---------------------------------------------------------------------------
create table public.annual_target_override (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- The paid/dashboard year this override governs. A sane calendar band keeps a
  -- fat-fingered 20260 out; matches the TargetTable's 2020–2032 planning band.
  year integer not null,
  -- Replaces the derived target for the year everywhere in M6. Strictly positive
  -- (a zero/negative target is meaningless — clear the override instead).
  amount numeric(14, 2) not null,
  -- Why the override exists (recommended, not required — OQ3). ≤ 240 chars (§3.1).
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  constraint annual_target_override_amount_positive check (amount > 0),
  constraint annual_target_override_year_range check (year between 2000 and 2100),
  constraint annual_target_override_note_len check (note is null or char_length(note) <= 240),
  -- One optional override per year (§3.1 key). A second row for the same year is
  -- impossible regardless of a racing insert.
  constraint annual_target_override_one_per_year unique (workspace_id, year)
);

comment on table public.annual_target_override is
  'M6 §3.1 (sheet cell E15). One optional manual annual GCI target per (workspace, year); when present its amount replaces the TargetTable-derived target in Section 2 + Section 6. Set/change/clear are confirmed + audited (FR-M6-03).';

create index annual_target_override_workspace_year_idx
  on public.annual_target_override (workspace_id, year);

alter table public.annual_target_override enable row level security;

create policy "annual_target_override_select_member"
  on public.annual_target_override for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "annual_target_override_insert_member"
  on public.annual_target_override for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "annual_target_override_update_member"
  on public.annual_target_override for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create policy "annual_target_override_delete_member"
  on public.annual_target_override for delete
  to authenticated
  using (app.is_workspace_member(workspace_id));

create trigger annual_target_override_touch_updated_at
  before update on public.annual_target_override
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- public.set_annual_target_override — set OR change the override for a year
-- ---------------------------------------------------------------------------
-- Upsert on (workspace, year): a positive amount + optional ≤240-char note. Audits
-- old→new (amount and note); the year is carried on the entry for context. The
-- friction-gate confirmation is enforced at the action layer (FR-M6-03 / OQ3).
create or replace function public.set_annual_target_override(
  p_year integer,
  p_amount numeric,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_before public.annual_target_override;
  v_after public.annual_target_override;
  v_note text;
  v_audit_id uuid;
  v_is_insert boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_year');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 240 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  -- Pre-image for the audit (null on a first set).
  select * into v_before
  from public.annual_target_override
  where workspace_id = v_ws and year = p_year
  for update;
  v_is_insert := not found;

  insert into public.annual_target_override (
    workspace_id, year, amount, note, created_by, updated_by
  )
  values (v_ws, p_year, p_amount, v_note, v_uid, v_uid)
  on conflict (workspace_id, year) do update set
    amount = excluded.amount,
    note = excluded.note,
    updated_by = v_uid
  returning * into v_after;

  v_audit_id := app.write_audit_entry(
    v_ws, 'annual_target_override', v_after.id,
    case when v_is_insert then 'create'::public.audit_action else 'update'::public.audit_action end,
    jsonb_build_object(
      'year', jsonb_build_object('old', to_jsonb(v_before.year), 'new', to_jsonb(v_after.year)),
      'amount', jsonb_build_object(
        'old', case when v_is_insert then null else to_jsonb(v_before.amount::text) end,
        'new', to_jsonb(v_after.amount::text)),
      'note', jsonb_build_object(
        'old', case when v_is_insert then null else to_jsonb(v_before.note) end,
        'new', to_jsonb(v_after.note))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'year', v_after.year,
    'amount', v_after.amount::text, 'note', v_after.note,
    'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function public.set_annual_target_override is
  'FR-M6-03. Sets/changes the AnnualTargetOverride for (workspace, year): positive amount + optional ≤240-char note; upsert on the unique (workspace, year) key. Audited old→new (create on first set, else update). Friction gate at the action layer.';

revoke all on function public.set_annual_target_override(integer, numeric, text) from public;
grant execute on function public.set_annual_target_override(integer, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- public.clear_annual_target_override — remove the override for a year
-- ---------------------------------------------------------------------------
-- Clearing removes the row → the target reverts to the TargetTable derivation
-- (Section 2 shows the derived value again). The removal is audited as 'archive'
-- (the enum's retire-a-record token — the override is a single mutable cell, not a
-- soft-deleted entity, so there is no archived_at; 'archive' records that it was
-- retired old→null). Idempotent: clearing a non-existent override is a no-op.
create or replace function public.clear_annual_target_override(
  p_year integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_before public.annual_target_override;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_before
  from public.annual_target_override
  where workspace_id = v_ws and year = p_year
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'changed', false, 'year', p_year);
  end if;

  delete from public.annual_target_override where id = v_before.id;

  v_audit_id := app.write_audit_entry(
    v_ws, 'annual_target_override', v_before.id, 'archive',
    jsonb_build_object(
      'year', jsonb_build_object('old', to_jsonb(v_before.year), 'new', to_jsonb(v_before.year)),
      'amount', jsonb_build_object('old', to_jsonb(v_before.amount::text), 'new', null),
      'note', jsonb_build_object('old', to_jsonb(v_before.note), 'new', null)
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'year', p_year, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function public.clear_annual_target_override is
  'FR-M6-03. Removes the AnnualTargetOverride for (workspace, year) → the target reverts to the TargetTable derivation. Audited as ''archive'' (amount old→null). Idempotent (no-op when none exists). Friction gate at the action layer.';

revoke all on function public.clear_annual_target_override(integer) from public;
grant execute on function public.clear_annual_target_override(integer) to authenticated;
