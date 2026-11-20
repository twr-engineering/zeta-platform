-- M3.2 — Targets & rates persistence: PlanYearTarget + FunnelRates as validated,
-- audited records, plus the write RPCs M3.3's screen and the M1.4 importer use.
--
-- Module: M3 PRD §3.1 (PlanYearTarget), §3.2 (FunnelRates), §4 rules 1/2/3/9/10/13/14,
--         FR-M3-01/02/11; M3_Milestones § M3.2. Handoffs: m3_1Handoff (the engine that
--         consumes these records — computePlan / deriveAnnualTarget), m0_2 write-path
--         pattern (one DB fn per mutation, SECURITY INVOKER, audit in-transaction),
--         m6_1Handoff (the M6 Section-2 target feed this unblocks).
--
-- WHAT THESE ENTITIES ARE. The agent's personal MREA business plan, stored (not the
-- workbook's magic blank-or-zero cells):
--   • plan_year_target — one row per (workspace, year): the Net Income Target, cost
--     assumptions (opex/cos), and optional yield/avg-price overrides. All rates are
--     stored as EXACT decimals (0.22, never 22 and never a float). A null field is the
--     "use default / use all-time" state made explicit (§1.1). A null net_income_target
--     is a year staged early but "not plannable" (rule 9) — the row persists; the plan
--     and the M6 target for that year are absent until an NIT is set.
--   • funnel_rates — the seven global conversion rates (§3.2). One row per workspace
--     (the `year` column is nullable and reserved for the OQ-5 per-year upgrade, so the
--     schema never needs a migration to make rates per-year). Seeded to the workbook's
--     defaults (25/70/30/20 seller, 30/70/10 buyer) on first read-or-write — a lazy path
--     so workspaces created before this migration get them too (FR-M3-02).
--
-- MONEY / RATE DISCIPLINE (Master PRD §4.3). Every numeric column is exact `numeric`,
-- never float; the app selects each `::text` and the money layer does the arithmetic
-- as decimals. rates ∈ (0,1] / [0,1); targets > 0 — mirrored as CHECK constraints so a
-- forged direct write cannot land an impossible value the engine would divide by.
--
-- WRITE PATH = ONE DB FUNCTION PER MUTATION (m0_2 pattern). upsert_plan_year_target /
-- delete_plan_year_target / update_funnel_rates each do their change AND its audit
-- entry (rule 13) in ONE transaction — SECURITY INVOKER so RLS still governs, actor
-- pinned to auth.uid(), tenant resolved via app.current_workspace_id(). The friction
-- gate (rule 14 — these edits restate the dashboard pace line, so they are money-
-- planning acts) lives at the ACTION layer (checkConfirmation), exactly like the
-- annual-target override and the receivable transitions. Validation that mirrors the
-- CHECKs is returned as typed reasons (not exceptions) so the UI shows a field error.

-- ===========================================================================
-- public.plan_year_target — one row per (workspace, year) (§3.1)
-- ===========================================================================
create table public.plan_year_target (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- The planning year. Unique per workspace; a sane calendar band keeps a
  -- fat-fingered 20260 out (§3.1 "any year ≥ 2000", bounded above like the override).
  year integer not null,

  -- Net Income Target for the year (§3.1 col C). NULL → the year is not plannable
  -- (rule 9): no plan, no M6 target; the row still persists so opex/cos/overrides can
  -- be staged early. When set it must be > 0.
  net_income_target numeric(14, 2),

  -- Operating-expenses / cost-of-sales fractions of GCI (§3.1 cols D/E). Stored as
  -- exact decimals (0.22, 0.10). NULL → the documented default (0.22 / 0.10) at read
  -- time (Rule P1); the importer maps the sheet's blank OR 0 to NULL (rule 10). Each
  -- individually 0 ≤ r < 1; the combined "net income % > 0" rule (opex+cos < 100%) is
  -- a cross-field check enforced by the write RPC + the engine (Rule P2).
  opex_pct numeric(6, 4),
  cos_pct numeric(6, 4),

  -- Optional per-year overrides of the planning basis (§3.1 cols F/G). NULL → the
  -- all-time realized yield / avg price from M2 (Rule P5). A yield is a fraction in
  -- (0,1); an avg price is money > 0.
  yield_override numeric(9, 8),
  avg_price_override numeric(14, 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  constraint plan_year_target_year_range check (year between 2000 and 2100),
  constraint plan_year_target_nit_positive
    check (net_income_target is null or net_income_target > 0),
  constraint plan_year_target_opex_range
    check (opex_pct is null or (opex_pct >= 0 and opex_pct < 1)),
  constraint plan_year_target_cos_range
    check (cos_pct is null or (cos_pct >= 0 and cos_pct < 1)),
  constraint plan_year_target_yield_range
    check (yield_override is null or (yield_override > 0 and yield_override < 1)),
  constraint plan_year_target_price_positive
    check (avg_price_override is null or avg_price_override > 0),
  -- One row per year (§3.1 key). A second row for the same year is impossible even
  -- under a racing insert.
  constraint plan_year_target_one_per_year unique (workspace_id, year)
);

comment on table public.plan_year_target is
  'M3 §3.1. One row per (workspace, year): Net Income Target + opex/cos assumptions + optional yield/avg-price overrides. Rates stored as exact decimals; NULL = use default/all-time. NULL net_income_target = year not plannable (rule 9). Mutations audited old→new, confirmation-gated at the action layer (rule 14). Feeds M6 Section-2 via deriveAnnualTarget (FR-M3-11).';

create index plan_year_target_workspace_year_idx
  on public.plan_year_target (workspace_id, year);

alter table public.plan_year_target enable row level security;

create policy "plan_year_target_select_member"
  on public.plan_year_target for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "plan_year_target_insert_member"
  on public.plan_year_target for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "plan_year_target_update_member"
  on public.plan_year_target for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create policy "plan_year_target_delete_member"
  on public.plan_year_target for delete
  to authenticated
  using (app.is_workspace_member(workspace_id));

create trigger plan_year_target_touch_updated_at
  before update on public.plan_year_target
  for each row execute function app.touch_updated_at();

-- ===========================================================================
-- public.funnel_rates — the seven global conversion rates (§3.2)
-- ===========================================================================
create table public.funnel_rates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  -- NULL = the GLOBAL rate set (v1, OQ-5 default). Reserved non-null for a future
  -- per-year upgrade so that change is additive (no migration to make rates per-year).
  year integer,

  -- Seller ladder (divide upward): SOLD ÷ listing_to_sold = Listings to take; ÷
  -- listing_appointment_rate = Appointments; ÷ seller_contact_to_appt = Contacts; ÷
  -- seller_lead_to_contact = Leads.
  listing_to_sold numeric(6, 4) not null,
  listing_appointment_rate numeric(6, 4) not null,
  seller_contact_to_appt numeric(6, 4) not null,
  seller_lead_to_contact numeric(6, 4) not null,
  -- Buyer ladder: ATP ÷ buyer_viewing_to_atp = Viewings; ÷ buyer_contact_to_viewing =
  -- Contacts; ÷ buyer_lead_to_contact = Leads.
  buyer_viewing_to_atp numeric(6, 4) not null,
  buyer_contact_to_viewing numeric(6, 4) not null,
  buyer_lead_to_contact numeric(6, 4) not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  -- Every rate is a conversion fraction in (0,1] — r = 1 (a step that never loses
  -- anyone) is the valid boundary; r ≤ 0 would divide by zero upward.
  constraint funnel_rates_listing_to_sold_range check (listing_to_sold > 0 and listing_to_sold <= 1),
  constraint funnel_rates_listing_appt_range check (listing_appointment_rate > 0 and listing_appointment_rate <= 1),
  constraint funnel_rates_seller_contact_range check (seller_contact_to_appt > 0 and seller_contact_to_appt <= 1),
  constraint funnel_rates_seller_lead_range check (seller_lead_to_contact > 0 and seller_lead_to_contact <= 1),
  constraint funnel_rates_buyer_viewing_range check (buyer_viewing_to_atp > 0 and buyer_viewing_to_atp <= 1),
  constraint funnel_rates_buyer_contact_range check (buyer_contact_to_viewing > 0 and buyer_contact_to_viewing <= 1),
  constraint funnel_rates_buyer_lead_range check (buyer_lead_to_contact > 0 and buyer_lead_to_contact <= 1)
);

comment on table public.funnel_rates is
  'M3 §3.2. The seven global conversion rates (one row per workspace; year NULL = global, reserved non-null for the OQ-5 per-year upgrade). Each rate ∈ (0,1]. Seeded to the workbook defaults (25/70/30/20 / 30/70/10) lazily on first read-or-write (FR-M3-02). Edits audited old→new, gated at the action layer.';

-- One GLOBAL (year IS NULL) row per workspace, and at most one per (workspace, year)
-- for the reserved per-year case. Partial indexes because a plain UNIQUE would treat
-- multiple NULL years as distinct (Postgres NULL semantics) and allow duplicates.
create unique index funnel_rates_workspace_global_uq
  on public.funnel_rates (workspace_id) where year is null;
create unique index funnel_rates_workspace_year_uq
  on public.funnel_rates (workspace_id, year) where year is not null;

alter table public.funnel_rates enable row level security;

create policy "funnel_rates_select_member"
  on public.funnel_rates for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "funnel_rates_insert_member"
  on public.funnel_rates for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "funnel_rates_update_member"
  on public.funnel_rates for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create trigger funnel_rates_touch_updated_at
  before update on public.funnel_rates
  for each row execute function app.touch_updated_at();

-- ===========================================================================
-- public.upsert_plan_year_target — set or change a year's target row (FR-M3-01)
-- ===========================================================================
-- Upsert on (workspace, year). Every field validated per §3.1 (each returned as a
-- typed reason, never an exception); the cross-field "opex + cos < 100%" rule (Rule
-- P2, so net income % > 0) is checked on the EFFECTIVE values (nulls → 0.22/0.10),
-- reproducing AC5's rejection. Audits old→new (create on first set, else update). The
-- friction-gate confirmation is enforced at the action layer (rule 14).
create or replace function public.upsert_plan_year_target(
  p_year integer,
  p_net_income_target numeric,
  p_opex_pct numeric,
  p_cos_pct numeric,
  p_yield_override numeric,
  p_avg_price_override numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_before public.plan_year_target;
  v_after public.plan_year_target;
  v_is_insert boolean;
  v_opex_eff numeric;
  v_cos_eff numeric;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Per-field validation (mirrors the CHECK constraints; returned as values so the
  -- UI can flag the offending field rather than surfacing a 500).
  if p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_year');
  end if;
  if p_net_income_target is not null and p_net_income_target <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'nit_not_positive');
  end if;
  if p_opex_pct is not null and (p_opex_pct < 0 or p_opex_pct >= 1) then
    return jsonb_build_object('ok', false, 'reason', 'opex_out_of_range');
  end if;
  if p_cos_pct is not null and (p_cos_pct < 0 or p_cos_pct >= 1) then
    return jsonb_build_object('ok', false, 'reason', 'cos_out_of_range');
  end if;
  if p_yield_override is not null and (p_yield_override <= 0 or p_yield_override >= 1) then
    return jsonb_build_object('ok', false, 'reason', 'yield_out_of_range');
  end if;
  if p_avg_price_override is not null and p_avg_price_override <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'price_not_positive');
  end if;

  -- Cross-field: net income % = 1 − opex_eff − cos_eff must be > 0 (Rule P2 / AC5).
  -- Effective values apply the documented defaults for a blank field.
  v_opex_eff := coalesce(p_opex_pct, 0.22);
  v_cos_eff := coalesce(p_cos_pct, 0.10);
  if v_opex_eff + v_cos_eff >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'net_income_pct_nonpositive');
  end if;

  select * into v_before
  from public.plan_year_target
  where workspace_id = v_ws and year = p_year
  for update;
  v_is_insert := not found;

  insert into public.plan_year_target (
    workspace_id, year, net_income_target, opex_pct, cos_pct,
    yield_override, avg_price_override, created_by, updated_by
  )
  values (
    v_ws, p_year, p_net_income_target, p_opex_pct, p_cos_pct,
    p_yield_override, p_avg_price_override, v_uid, v_uid
  )
  on conflict (workspace_id, year) do update set
    net_income_target = excluded.net_income_target,
    opex_pct = excluded.opex_pct,
    cos_pct = excluded.cos_pct,
    yield_override = excluded.yield_override,
    avg_price_override = excluded.avg_price_override,
    updated_by = v_uid
  returning * into v_after;

  v_audit_id := app.write_audit_entry(
    v_ws, 'plan_year_target', v_after.id,
    case when v_is_insert then 'create'::public.audit_action else 'update'::public.audit_action end,
    jsonb_build_object(
      'year', jsonb_build_object('old', to_jsonb(v_before.year), 'new', to_jsonb(v_after.year)),
      'net_income_target', jsonb_build_object(
        'old', case when v_is_insert or v_before.net_income_target is null then null else to_jsonb(v_before.net_income_target::text) end,
        'new', case when v_after.net_income_target is null then null else to_jsonb(v_after.net_income_target::text) end),
      'opex_pct', jsonb_build_object(
        'old', case when v_is_insert or v_before.opex_pct is null then null else to_jsonb(v_before.opex_pct::text) end,
        'new', case when v_after.opex_pct is null then null else to_jsonb(v_after.opex_pct::text) end),
      'cos_pct', jsonb_build_object(
        'old', case when v_is_insert or v_before.cos_pct is null then null else to_jsonb(v_before.cos_pct::text) end,
        'new', case when v_after.cos_pct is null then null else to_jsonb(v_after.cos_pct::text) end),
      'yield_override', jsonb_build_object(
        'old', case when v_is_insert or v_before.yield_override is null then null else to_jsonb(v_before.yield_override::text) end,
        'new', case when v_after.yield_override is null then null else to_jsonb(v_after.yield_override::text) end),
      'avg_price_override', jsonb_build_object(
        'old', case when v_is_insert or v_before.avg_price_override is null then null else to_jsonb(v_before.avg_price_override::text) end,
        'new', case when v_after.avg_price_override is null then null else to_jsonb(v_after.avg_price_override::text) end)
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id, 'year', v_after.year,
    'net_income_target', case when v_after.net_income_target is null then null else v_after.net_income_target::text end,
    'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function public.upsert_plan_year_target is
  'FR-M3-01. Sets/changes the PlanYearTarget for (workspace, year): NIT (>0 or null=not-plannable), opex/cos [0,1) with combined <100% (Rule P2), optional yield (0,1)/price (>0) overrides. Upsert on the unique key; audited old→new. Validation returned as typed reasons; friction gate at the action layer.';

revoke all on function public.upsert_plan_year_target(integer, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.upsert_plan_year_target(integer, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- ===========================================================================
-- public.delete_plan_year_target — remove a year's target row (FR-M3-01)
-- ===========================================================================
-- Removes the whole year row (the targets-table editor's "remove year"). Audited as
-- 'archive' (the enum's retire token — the row is deleted, not soft-deleted, so there
-- is no archived_at). Idempotent: deleting a non-existent year is a no-op.
create or replace function public.delete_plan_year_target(
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
  v_before public.plan_year_target;
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
  from public.plan_year_target
  where workspace_id = v_ws and year = p_year
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'changed', false, 'year', p_year);
  end if;

  delete from public.plan_year_target where id = v_before.id;

  v_audit_id := app.write_audit_entry(
    v_ws, 'plan_year_target', v_before.id, 'archive',
    jsonb_build_object(
      'year', jsonb_build_object('old', to_jsonb(v_before.year), 'new', to_jsonb(v_before.year)),
      'net_income_target', jsonb_build_object(
        'old', case when v_before.net_income_target is null then null else to_jsonb(v_before.net_income_target::text) end, 'new', null),
      'opex_pct', jsonb_build_object(
        'old', case when v_before.opex_pct is null then null else to_jsonb(v_before.opex_pct::text) end, 'new', null),
      'cos_pct', jsonb_build_object(
        'old', case when v_before.cos_pct is null then null else to_jsonb(v_before.cos_pct::text) end, 'new', null),
      'yield_override', jsonb_build_object(
        'old', case when v_before.yield_override is null then null else to_jsonb(v_before.yield_override::text) end, 'new', null),
      'avg_price_override', jsonb_build_object(
        'old', case when v_before.avg_price_override is null then null else to_jsonb(v_before.avg_price_override::text) end, 'new', null)
    )
  );

  return jsonb_build_object('ok', true, 'changed', true, 'year', p_year, 'audit_entry_id', v_audit_id);
end;
$$;

comment on function public.delete_plan_year_target is
  'FR-M3-01. Removes the PlanYearTarget for (workspace, year) → the year has no plan and no M6 target. Audited as ''archive'' (all fields old→null). Idempotent. Friction gate at the action layer.';

revoke all on function public.delete_plan_year_target(integer) from public;
grant execute on function public.delete_plan_year_target(integer) to authenticated;

-- ===========================================================================
-- public.get_or_seed_funnel_rates — the lazy-seeding read (FR-M3-02)
-- ===========================================================================
-- Returns the workspace's global funnel-rate row, SEEDING the workbook defaults on
-- first read for a workspace that predates this migration (FR-M3-02 says "seeded on
-- workspace creation"; a lazy read-or-write path covers both new and existing
-- workspaces uniformly). Seeding a system default is NOT a user mutation → not audited.
-- Rates returned as ::text so the caller does decimal, never float, arithmetic.
create or replace function public.get_or_seed_funnel_rates()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_row public.funnel_rates;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Seed the global row on first read; the partial unique index makes a concurrent
  -- seed a no-op (ON CONFLICT on the (workspace_id) WHERE year IS NULL index).
  insert into public.funnel_rates (
    workspace_id, year,
    listing_to_sold, listing_appointment_rate, seller_contact_to_appt, seller_lead_to_contact,
    buyer_viewing_to_atp, buyer_contact_to_viewing, buyer_lead_to_contact,
    created_by, updated_by
  )
  values (
    v_ws, null,
    0.25, 0.70, 0.30, 0.20,
    0.30, 0.70, 0.10,
    v_uid, v_uid
  )
  on conflict (workspace_id) where year is null do nothing;

  select * into v_row
  from public.funnel_rates
  where workspace_id = v_ws and year is null;

  return jsonb_build_object(
    'ok', true,
    'listing_to_sold', v_row.listing_to_sold::text,
    'listing_appointment_rate', v_row.listing_appointment_rate::text,
    'seller_contact_to_appt', v_row.seller_contact_to_appt::text,
    'seller_lead_to_contact', v_row.seller_lead_to_contact::text,
    'buyer_viewing_to_atp', v_row.buyer_viewing_to_atp::text,
    'buyer_contact_to_viewing', v_row.buyer_contact_to_viewing::text,
    'buyer_lead_to_contact', v_row.buyer_lead_to_contact::text
  );
end;
$$;

comment on function public.get_or_seed_funnel_rates is
  'FR-M3-02. Returns the workspace''s global funnel-rate row, seeding the workbook defaults (25/70/30/20 / 30/70/10) on first read (covers pre-migration workspaces). Rates as ::text. Seeding a default is not a user mutation → not audited.';

revoke all on function public.get_or_seed_funnel_rates() from public;
grant execute on function public.get_or_seed_funnel_rates() to authenticated;

-- ===========================================================================
-- public.update_funnel_rates — edit the seven global rates (FR-M3-02)
-- ===========================================================================
-- Validates each rate ∈ (0,1] (typed reason on failure), ensures the global row
-- exists (seeding defaults first so the audit diff is meaningful), then updates all
-- seven and audits old→new. Friction gate at the action layer (rule 14).
create or replace function public.update_funnel_rates(
  p_listing_to_sold numeric,
  p_listing_appointment_rate numeric,
  p_seller_contact_to_appt numeric,
  p_seller_lead_to_contact numeric,
  p_buyer_viewing_to_atp numeric,
  p_buyer_contact_to_viewing numeric,
  p_buyer_lead_to_contact numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_before public.funnel_rates;
  v_after public.funnel_rates;
  v_audit_id uuid;
  v_rates numeric[] := array[
    p_listing_to_sold, p_listing_appointment_rate, p_seller_contact_to_appt,
    p_seller_lead_to_contact, p_buyer_viewing_to_atp, p_buyer_contact_to_viewing,
    p_buyer_lead_to_contact
  ];
  v_names text[] := array[
    'listing_to_sold', 'listing_appointment_rate', 'seller_contact_to_appt',
    'seller_lead_to_contact', 'buyer_viewing_to_atp', 'buyer_contact_to_viewing',
    'buyer_lead_to_contact'
  ];
  v_i integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Every rate is required and must be in (0,1] (§3.2). Named so the UI flags the
  -- offending field.
  for v_i in 1 .. array_length(v_rates, 1) loop
    if v_rates[v_i] is null or v_rates[v_i] <= 0 or v_rates[v_i] > 1 then
      return jsonb_build_object('ok', false, 'reason', 'rate_out_of_range', 'field', v_names[v_i]);
    end if;
  end loop;

  -- Ensure the global row exists (defaults) so the pre-image is a real baseline.
  insert into public.funnel_rates (
    workspace_id, year,
    listing_to_sold, listing_appointment_rate, seller_contact_to_appt, seller_lead_to_contact,
    buyer_viewing_to_atp, buyer_contact_to_viewing, buyer_lead_to_contact,
    created_by, updated_by
  )
  values (
    v_ws, null,
    0.25, 0.70, 0.30, 0.20,
    0.30, 0.70, 0.10,
    v_uid, v_uid
  )
  on conflict (workspace_id) where year is null do nothing;

  select * into v_before
  from public.funnel_rates
  where workspace_id = v_ws and year is null
  for update;

  update public.funnel_rates set
    listing_to_sold = p_listing_to_sold,
    listing_appointment_rate = p_listing_appointment_rate,
    seller_contact_to_appt = p_seller_contact_to_appt,
    seller_lead_to_contact = p_seller_lead_to_contact,
    buyer_viewing_to_atp = p_buyer_viewing_to_atp,
    buyer_contact_to_viewing = p_buyer_contact_to_viewing,
    buyer_lead_to_contact = p_buyer_lead_to_contact,
    updated_by = v_uid
  where id = v_before.id
  returning * into v_after;

  v_audit_id := app.write_audit_entry(
    v_ws, 'funnel_rates', v_after.id, 'update',
    jsonb_build_object(
      'listing_to_sold', jsonb_build_object('old', to_jsonb(v_before.listing_to_sold::text), 'new', to_jsonb(v_after.listing_to_sold::text)),
      'listing_appointment_rate', jsonb_build_object('old', to_jsonb(v_before.listing_appointment_rate::text), 'new', to_jsonb(v_after.listing_appointment_rate::text)),
      'seller_contact_to_appt', jsonb_build_object('old', to_jsonb(v_before.seller_contact_to_appt::text), 'new', to_jsonb(v_after.seller_contact_to_appt::text)),
      'seller_lead_to_contact', jsonb_build_object('old', to_jsonb(v_before.seller_lead_to_contact::text), 'new', to_jsonb(v_after.seller_lead_to_contact::text)),
      'buyer_viewing_to_atp', jsonb_build_object('old', to_jsonb(v_before.buyer_viewing_to_atp::text), 'new', to_jsonb(v_after.buyer_viewing_to_atp::text)),
      'buyer_contact_to_viewing', jsonb_build_object('old', to_jsonb(v_before.buyer_contact_to_viewing::text), 'new', to_jsonb(v_after.buyer_contact_to_viewing::text)),
      'buyer_lead_to_contact', jsonb_build_object('old', to_jsonb(v_before.buyer_lead_to_contact::text), 'new', to_jsonb(v_after.buyer_lead_to_contact::text))
    )
  );

  return jsonb_build_object('ok', true, 'changed', true, 'id', v_after.id, 'audit_entry_id', v_audit_id);
end;
$$;

comment on function public.update_funnel_rates is
  'FR-M3-02. Updates all seven global funnel rates (each ∈ (0,1], typed reason on failure); seeds defaults first so the audit has a baseline, then audits old→new. Friction gate at the action layer.';

revoke all on function public.update_funnel_rates(numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.update_funnel_rates(numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
