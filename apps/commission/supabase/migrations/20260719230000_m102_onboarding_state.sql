-- M10.2 — the first-run wizard's state machine + instrumentation.
--
-- Module: M10 §3.1 (OnboardingState), §4 rules 1/2/7/8, FR-M10-01/08/18
--
-- M10 owns NO financial logic and stores NO money (§3): these are UI-state and
-- instrumentation rows only. The wizard ORCHESTRATES the existing M0/M1 write
-- paths (rename_workspace, update_tax_settings, seed_*, run_workbook_import) —
-- every audited/financial change still flows through those functions and their
-- own audit trail. What lives here is the wizard's own progress:
--
--   * one OnboardingState per workspace — status + current_step, persisted after
--     every step so the wizard is RESUMABLE (rule 2) and NEVER-BLOCKING (rule 1:
--     dismissable at any point, the app is fully usable regardless);
--   * an append-only onboarding_event log — the lightweight instrumentation the
--     PRD asks for (FR-M10-18: step completed/skipped, wizard completed/dismissed)
--     to measure the <10-minute NFR. No financial values in events (§8).
--
-- THE WRITE PATH IS M0.2'S PATTERN — one database function per mutation, all
-- SECURITY INVOKER so RLS still governs, the actor read from auth.uid() inside
-- the function and never a parameter, the tenant resolved via
-- commission_private.current_workspace_id(). No commission_private.write_audit_entry calls here: onboarding
-- transitions are UI state, not a financial/settings change (§3) — the audited
-- work is done by the embedded M0/M1 functions the wizard calls.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- §3.1. not_started → in_progress → completed | dismissed. Dismissed ≠ blocked:
-- the app is always fully usable (rule 1); dismissal is reversible from Settings
-- (rule 7).
create type commission.onboarding_status as enum (
  'not_started',
  'in_progress',
  'completed',
  'dismissed'
);

-- §3.1. The five steps, in order. M10.2 builds 1–4; first_deal (step 5) is the
-- M10.3 walkthrough — current_step can reach it, but the wizard renders a seam
-- there until then (the milestone split).
create type commission.onboarding_step as enum (
  'basics',
  'tax_review',
  'seed_lists',
  'migration_fork',
  'first_deal'
);

-- ---------------------------------------------------------------------------
-- onboarding_state (§3.1 — one per workspace)
-- ---------------------------------------------------------------------------

create table commission.onboarding_state (
  id uuid primary key default gen_random_uuid(),

  -- One row per workspace (§3.1). Created with the workspace by the trigger
  -- below (new signups) or backfilled (existing workspaces).
  workspace_id uuid not null unique references commission.workspace (id) on delete cascade,

  status commission.onboarding_status not null default 'not_started',
  current_step commission.onboarding_step not null default 'basics',

  -- Per-step scratch (chosen fork, which seed sets were offered, etc.) — never
  -- a financial value (§3.1).
  step_data jsonb not null default '{}'::jsonb,

  -- Links to the M1.4 importer run the wizard launched (§3.1). Nullable; set
  -- when step 4 takes the import path. ON DELETE SET NULL so cleaning up an
  -- import never strands the wizard.
  import_job_id uuid references commission.import_batch (id) on delete set null,

  -- The walkthrough's sample deal (§3.1). Wired by M10.3; the column exists now
  -- so the state machine is complete. ON DELETE SET NULL for the cleanup cascade.
  sample_deal_id uuid references commission.deal (id) on delete set null,

  completed_at timestamptz,
  dismissed_at timestamptz,

  -- Audit uniformity (M0 §3 preamble): in v1 always the owner, FK-free so
  -- attribution survives the account. NULL on the trigger-created row (no
  -- authenticated actor during the signup bootstrap).
  created_by uuid,
  updated_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint onboarding_state_step_data_is_object
    check (jsonb_typeof(step_data) = 'object'),
  -- completed/dismissed stamps line up with the status they name.
  constraint onboarding_state_completed_pair
    check ((status = 'completed') = (completed_at is not null)),
  constraint onboarding_state_dismissed_pair
    check ((status = 'dismissed') = (dismissed_at is not null))
);

comment on table commission.onboarding_state is
  'M10 §3.1. One first-run-wizard state per workspace. UI state only — no money (§3). RESUMABLE (rule 2) + NEVER-BLOCKING (rule 1). The audited work is done by the embedded M0/M1 functions the wizard calls.';
comment on column commission.onboarding_state.status is
  'not_started → in_progress → completed | dismissed. Dismissed ≠ blocked (rule 1); reversible from Settings (rule 7).';
comment on column commission.onboarding_state.current_step is
  'Persisted after every step so the wizard resumes exactly where it was left (rule 2).';

create trigger onboarding_state_touch_updated_at
  before update on commission.onboarding_state
  for each row execute function commission_private.touch_updated_at();

alter table commission.onboarding_state enable row level security;

create policy "onboarding_state_select_member"
  on commission.onboarding_state for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "onboarding_state_insert_member"
  on commission.onboarding_state for insert
  to authenticated
  with check (commission_private.is_workspace_member(workspace_id));

create policy "onboarding_state_update_member"
  on commission.onboarding_state for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- onboarding_event (§FR-M10-18 — append-only instrumentation)
-- ---------------------------------------------------------------------------

create table commission.onboarding_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- Pinned to auth.uid() by the RLS insert policy — same discipline as
  -- audit_log_entry.actor_user_id, FK-free so the trail outlives the account.
  actor_user_id uuid not null,

  -- 'step_completed' | 'step_skipped' | 'wizard_opened' | 'wizard_completed'
  -- | 'wizard_dismissed' | 'wizard_reopened'. Plain text (not an enum) so a new
  -- event kind in M10.3–M10.5 is a code change, not a migration.
  event_type text not null,

  -- The step the event is about (the step just completed/skipped, or the
  -- wizard's current step at open/dismiss). Nullable for wizard-level events.
  step commission.onboarding_step,

  -- Free-form, non-financial (§8): e.g. { "to_step": "seed_lists" }.
  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  constraint onboarding_event_type_not_blank check (btrim(event_type) <> ''),
  constraint onboarding_event_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table commission.onboarding_event is
  'M10 FR-M10-18. Append-only wizard instrumentation — measures the <10-min NFR (§8). No financial values ever (§8). Written atomically with each state transition by the functions below.';

create index onboarding_event_workspace_idx
  on commission.onboarding_event (workspace_id, occurred_at);

alter table commission.onboarding_event enable row level security;

create policy "onboarding_event_select_member"
  on commission.onboarding_event for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "onboarding_event_insert_member"
  on commission.onboarding_event for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and actor_user_id = (select auth.uid())
  );

-- No update/delete policy: the instrumentation log is append-only.

-- ---------------------------------------------------------------------------
-- commission_private.log_onboarding_event — the one place an event is written
-- ---------------------------------------------------------------------------

-- Callable only from inside the functions below (commission_private is not exposed via
-- PostgREST). SECURITY INVOKER, so the insert policy still pins the actor.
create or replace function commission_private.log_onboarding_event(
  p_workspace_id uuid,
  p_event_type text,
  p_step commission.onboarding_step,
  p_metadata jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into commission.onboarding_event (workspace_id, actor_user_id, event_type, step, metadata)
  values (
    p_workspace_id,
    (select auth.uid()),
    p_event_type,
    p_step,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create the state row with the workspace (§3.1)
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the same reason as commission_private.handle_new_user: at signup the
-- workspace row is inserted BEFORE the owner's membership exists, so an
-- INVOKER insert would be refused by the member policy. The definer path
-- bypasses RLS; the row is a fixed default, nothing forgeable.
create or replace function commission_private.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into commission.onboarding_state (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

comment on function commission_private.handle_new_workspace() is
  'Creates the first-run OnboardingState alongside a new workspace (M10 §3.1). Definer, so it runs during the signup bootstrap before membership exists.';

create trigger on_workspace_created
  after insert on commission.workspace
  for each row execute function commission_private.handle_new_workspace();

-- ---------------------------------------------------------------------------
-- commission.ensure_onboarding_state — get-or-create (idempotent read seam)
-- ---------------------------------------------------------------------------

-- New workspaces get their row from the trigger; workspaces that predate this
-- migration are backfilled below. This exists so the app's read path can never
-- find a missing row for an authenticated member — it self-heals any gap.
create or replace function commission.ensure_onboarding_state()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_row from commission.onboarding_state where workspace_id = v_workspace_id;

  if not found then
    insert into commission.onboarding_state (workspace_id, created_by, updated_by)
    values (v_workspace_id, (select auth.uid()), (select auth.uid()))
    on conflict (workspace_id) do nothing;

    select * into v_row from commission.onboarding_state where workspace_id = v_workspace_id;
  end if;

  return commission_private.onboarding_state_json(v_row);
end;
$$;

-- The row → jsonb shape the app reads. One place, so every function returns the
-- same thing. Defined before its callers (SQL bodies validate at CREATE time).
create or replace function commission_private.onboarding_state_json(v commission.onboarding_state)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id,
    'workspace_id', v.workspace_id,
    'status', v.status,
    'current_step', v.current_step,
    'step_data', v.step_data,
    'import_job_id', v.import_job_id,
    'sample_deal_id', v.sample_deal_id,
    'completed_at', v.completed_at,
    'dismissed_at', v.dismissed_at,
    'created_at', v.created_at,
    'updated_at', v.updated_at
  );
$$;

-- ensure_onboarding_state references onboarding_state_json, defined after it.
-- plpgsql resolves function calls at RUN time (not CREATE time), so the forward
-- reference is fine — but re-create ensure now that the helper exists so a fresh
-- apply on an empty DB never races the lookup.
create or replace function commission.ensure_onboarding_state()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_row from commission.onboarding_state where workspace_id = v_workspace_id;

  if not found then
    insert into commission.onboarding_state (workspace_id, created_by, updated_by)
    values (v_workspace_id, (select auth.uid()), (select auth.uid()))
    on conflict (workspace_id) do nothing;

    select * into v_row from commission.onboarding_state where workspace_id = v_workspace_id;
  end if;

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.ensure_onboarding_state is
  'M10 §3.1 read seam: returns the workspace''s OnboardingState, creating the default row first if one is somehow missing. Idempotent.';

-- ---------------------------------------------------------------------------
-- commission.advance_onboarding — persist a step transition (rule 2)
-- ---------------------------------------------------------------------------

-- The wizard calls this after each step so current_step survives a reload
-- (resumability). Advancing also OPENS the wizard (not_started → in_progress).
-- p_skipped distinguishes "Skip" from "Continue" for the instrumentation (§18).
-- Steps are not forced to move forward only: re-run (rule 7) can revisit any
-- step, so the target is trusted as given.
create or replace function commission.advance_onboarding(
  p_from_step commission.onboarding_step,
  p_to_step commission.onboarding_step,
  p_step_data jsonb default null,
  p_skipped boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  update commission.onboarding_state set
    current_step = p_to_step,
    -- Opening/continuing the wizard is always in_progress. A completed or
    -- dismissed wizard being advanced is a re-run (rule 7) and re-opens.
    status = 'in_progress',
    completed_at = null,
    dismissed_at = null,
    step_data = step_data || coalesce(p_step_data, '{}'::jsonb),
    updated_by = (select auth.uid())
  where workspace_id = v_workspace_id
  returning * into v_row;

  if not found then
    raise exception 'onboarding state not found' using errcode = 'no_data_found';
  end if;

  perform commission_private.log_onboarding_event(
    v_workspace_id,
    case when p_skipped then 'step_skipped' else 'step_completed' end,
    p_from_step,
    jsonb_build_object('to_step', p_to_step)
  );

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.advance_onboarding is
  'FR-M10-08. Persists current_step (resumability, rule 2) and logs step_completed/step_skipped (FR-M10-18). Opens/re-opens the wizard (status → in_progress).';

-- ---------------------------------------------------------------------------
-- commission.open_onboarding — the auto-open transition (FR-M10-01, "opened once")
-- ---------------------------------------------------------------------------

-- Called when the wizard first renders on a not_started workspace: flips it to
-- in_progress so the one-time auto-open never fires again (the dashboard only
-- redirects on not_started; an in_progress workspace gets the non-modal
-- "Continue setup" prompt instead — rule 2). A no-op on any other status.
create or replace function commission.open_onboarding()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select * into v_row from commission.onboarding_state where workspace_id = v_workspace_id;
  if not found then
    raise exception 'onboarding state not found' using errcode = 'no_data_found';
  end if;

  if v_row.status = 'not_started' then
    update commission.onboarding_state set
      status = 'in_progress',
      updated_by = (select auth.uid())
    where workspace_id = v_workspace_id
    returning * into v_row;

    perform commission_private.log_onboarding_event(v_workspace_id, 'wizard_opened', v_row.current_step, '{}'::jsonb);
  end if;

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.open_onboarding is
  'FR-M10-01. The one-time auto-open: not_started → in_progress (logged). No-op otherwise, so the app never forces the wizard twice (rule 1).';

-- ---------------------------------------------------------------------------
-- commission.reopen_onboarding — Settings → "Setup assistant" (rule 7)
-- ---------------------------------------------------------------------------

-- Re-run against current state: a dismissed or completed wizard becomes
-- in_progress again, current_step untouched so steps show existing values
-- (rule 7). The embedded seed/import steps stay idempotent by their own design.
create or replace function commission.reopen_onboarding()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  update commission.onboarding_state set
    status = 'in_progress',
    completed_at = null,
    dismissed_at = null,
    updated_by = (select auth.uid())
  where workspace_id = v_workspace_id
  returning * into v_row;

  if not found then
    raise exception 'onboarding state not found' using errcode = 'no_data_found';
  end if;

  perform commission_private.log_onboarding_event(v_workspace_id, 'wizard_reopened', v_row.current_step, '{}'::jsonb);

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.reopen_onboarding is
  'Rule 7. Re-opens the wizard from Settings against current state (in_progress, current_step kept). Embedded steps stay idempotent (no duplicate seeds; import history preserved).';

-- ---------------------------------------------------------------------------
-- commission.dismiss_onboarding — "Set up later" (rule 1)
-- ---------------------------------------------------------------------------

create or replace function commission.dismiss_onboarding()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  update commission.onboarding_state set
    status = 'dismissed',
    dismissed_at = now(),
    completed_at = null,
    updated_by = (select auth.uid())
  where workspace_id = v_workspace_id
  returning * into v_row;

  if not found then
    raise exception 'onboarding state not found' using errcode = 'no_data_found';
  end if;

  perform commission_private.log_onboarding_event(v_workspace_id, 'wizard_dismissed', v_row.current_step, '{}'::jsonb);

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.dismiss_onboarding is
  'FR-M10-01/18. One-click, non-destructive dismissal (rule 1). The app stays fully usable; reversible via reopen_onboarding.';

-- ---------------------------------------------------------------------------
-- commission.complete_onboarding — finish the wizard
-- ---------------------------------------------------------------------------

create or replace function commission.complete_onboarding(
  p_step_data jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_row commission.onboarding_state;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  update commission.onboarding_state set
    status = 'completed',
    completed_at = now(),
    dismissed_at = null,
    step_data = step_data || coalesce(p_step_data, '{}'::jsonb),
    updated_by = (select auth.uid())
  where workspace_id = v_workspace_id
  returning * into v_row;

  if not found then
    raise exception 'onboarding state not found' using errcode = 'no_data_found';
  end if;

  perform commission_private.log_onboarding_event(v_workspace_id, 'wizard_completed', v_row.current_step, '{}'::jsonb);

  return commission_private.onboarding_state_json(v_row);
end;
$$;

comment on function commission.complete_onboarding is
  'FR-M10-18. Marks the wizard completed and logs wizard_completed.';

-- ---------------------------------------------------------------------------
-- Backfill existing workspaces (this migration runs as service-role, bypassing
-- RLS — the trigger only covers workspaces created after it).
-- ---------------------------------------------------------------------------

insert into commission.onboarding_state (workspace_id)
select w.id from commission.workspace w
on conflict (workspace_id) do nothing;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function commission.ensure_onboarding_state() from public;
revoke all on function commission.advance_onboarding(commission.onboarding_step, commission.onboarding_step, jsonb, boolean) from public;
revoke all on function commission.open_onboarding() from public;
revoke all on function commission.reopen_onboarding() from public;
revoke all on function commission.dismiss_onboarding() from public;
revoke all on function commission.complete_onboarding(jsonb) from public;

grant execute on function commission.ensure_onboarding_state() to authenticated;
grant execute on function commission.advance_onboarding(commission.onboarding_step, commission.onboarding_step, jsonb, boolean) to authenticated;
grant execute on function commission.open_onboarding() to authenticated;
grant execute on function commission.reopen_onboarding() to authenticated;
grant execute on function commission.dismiss_onboarding() to authenticated;
grant execute on function commission.complete_onboarding(jsonb) to authenticated;
