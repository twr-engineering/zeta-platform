-- M10.3 — first-deal walkthrough sample lifecycle + the getting-started checklist.
--
-- Module: M10 §3.2 (ChecklistState), §3.5 (sample marker), §4 rules 4/5/6/9/10,
--         FR-M10-07/09/15; M10_Milestones § M10.3
--
-- M10 owns NO financial logic and computes NO money. This migration adds:
--   1. `is_sample` — the §3.5 marker, on the deal (source of truth) and MIRRORED
--      onto its receivable + payments (inherited at write time by a trigger, the
--      same mirror pattern M4 already uses for deal_code / booked_year / etc.).
--      The SAMPLE badge, the persistent banner, the rule-5 delete exception and
--      the checklist's `is_sample = false` filters all key off this one flag.
--   2. The rule-5 CLEANUP CASCADE — one transaction that deletes sample payments →
--      receivable → deal (the ONLY path that deletes a deal WITH payments, and
--      only where is_sample), audit-logged, then rebuilds the affected yield cell
--      so every dashboard returns to its pre-sample values EXACTLY (AC2). A
--      mid-flight failure rolls the whole transaction back — nothing is deleted.
--   3. ChecklistState (§3.2) — one row per workspace holding ONLY the user-set
--      dismissed_at; the four checklist items are DERIVED LIVE from the existing
--      event streams' durable rows (deals / payments / imports / tax review), so
--      they are truthful by construction, never manually checkable, and NEVER gate
--      anything (rule 9).
--
-- THE WRITE PATH IS M1/M0'S PATTERN — SECURITY INVOKER, RLS-governed, actor from
-- auth.uid(), tenant via app.current_workspace_id(). The sample deal is created
-- through the STANDARD create_deal (extended with p_is_sample), so it carries a
-- permanent D-nnn code allocated from the real sequence (OQ5: see the handoff — the
-- reserved-code alternative would need loosening deal_code_format, which M1 rule 1
-- forbids without sign-off; consuming the sequence keeps rule 1 inviolate and is
-- "harmless" per rule 6).

-- ===========================================================================
-- 1. is_sample — the §3.5 marker
-- ===========================================================================

alter table public.deal add column if not exists is_sample boolean not null default false;
comment on column public.deal.is_sample is
  'M10 §3.5. True only for the first-run walkthrough sample deal, set at creation via create_deal(p_is_sample). Never changes after creation; the row is removed by cleanup_sample_data. Keys the SAMPLE badge/banner, the rule-5 delete exception, and the checklist is_sample=false filters (rule 10).';

alter table public.receivable add column if not exists is_sample boolean not null default false;
comment on column public.receivable.is_sample is
  'M10 §3.5. Mirror of the deal''s is_sample, inherited at write time by app.inherit_is_sample_from_deal (like every other deal mirror on this table). Cascade membership is derived from the deal (rule 5).';

alter table public.payment add column if not exists is_sample boolean not null default false;
comment on column public.payment.is_sample is
  'M10 §3.5. Mirror of the deal''s is_sample, inherited at write time. A sample payment never ticks the checklist''s first_payment (rule 10).';

-- Sample rows are a tiny minority (at most one deal + its receivable + a payment
-- or two per workspace); partial indexes keep the badge/banner/cleanup lookups
-- from scanning the money-dense tables.
create index if not exists deal_sample_idx on public.deal (workspace_id) where is_sample;
create index if not exists receivable_sample_idx on public.receivable (workspace_id) where is_sample;
create index if not exists payment_sample_idx on public.payment (workspace_id) where is_sample;

-- Inherit is_sample from the parent deal on every write — additive, so neither
-- create_payment nor consume_deal_events needs rewriting, and the mirror can never
-- drift (it is recomputed from the deal on every insert/update).
create or replace function app.inherit_is_sample_from_deal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.is_sample := coalesce(
    (select d.is_sample from public.deal d where d.id = new.deal_id),
    false
  );
  return new;
end;
$$;

comment on function app.inherit_is_sample_from_deal is
  'M10 §3.5. Sets the row''s is_sample from its parent deal, so receivable/payment sample membership is derived from the deal (rule 5) with no drift.';

create trigger receivable_inherit_is_sample
  before insert or update on public.receivable
  for each row execute function app.inherit_is_sample_from_deal();

create trigger payment_inherit_is_sample
  before insert or update on public.payment
  for each row execute function app.inherit_is_sample_from_deal();

-- Backfill any rows that predate the flag (all false — no sample data exists yet).
update public.receivable r
  set is_sample = coalesce((select d.is_sample from public.deal d where d.id = r.deal_id), false)
  where r.is_sample is distinct from coalesce((select d.is_sample from public.deal d where d.id = r.deal_id), false);
update public.payment p
  set is_sample = coalesce((select d.is_sample from public.deal d where d.id = p.deal_id), false)
  where p.is_sample is distinct from coalesce((select d.is_sample from public.deal d where d.id = p.deal_id), false);

-- ===========================================================================
-- 2. deal_snapshot carries is_sample (FR-M1-08 — append-only key)
-- ===========================================================================

-- Re-emit the LOCKED event payload with the new key appended (never rename/drop).
create or replace function app.deal_snapshot(d public.deal)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'deal_code', d.deal_code,
    'booked_date', d.booked_date,
    'booked_year', d.booked_year,
    'transaction_type', d.transaction_type::text,
    'deal_type', d.deal_type::text,
    'representation', d.representation::text,
    'developer_id', d.developer_id,
    'property_type_id', d.property_type_id,
    'lead_source_id', d.lead_source_id,
    'client_name', d.client_name,
    'property_details', d.property_details,
    'mode_of_payment', d.mode_of_payment::text,
    'display_label', d.display_label,
    -- Money / rate — exact strings.
    'list_price', d.list_price::text,
    'net_list_price', d.net_list_price::text,
    'property_vat', d.property_vat::text,
    'comm_base', d.comm_base::text,
    'vat_basis', d.vat_basis::text,
    'billed_commission', d.billed_commission::text,
    'gci_net_of_vat', d.gci_net_of_vat::text,
    'incentive_billed', d.incentive_billed::text,
    'incentive_taxable', d.incentive_taxable::text,
    'incentive_net', d.incentive_net::text,
    'referral_out', d.referral_out::text,
    'referral_paid', d.referral_paid,
    'net_gci', d.net_gci::text,
    -- M4.1's Rule K.2 anchor (preserved — the append-only contract: add, never drop).
    'default_total_collectible', d.default_total_collectible::text,
    'vat_memo', d.vat_memo::text,
    'ewt_memo', d.ewt_memo::text,
    'yield_on_list', d.yield_on_list::text,
    'taxable', d.taxable,
    'archived_at', to_jsonb(d.archived_at),
    'version', d.version,
    -- M10.3 §3.5 — the sample marker travels on the event so downstream
    -- consumers (M4/M2) that build from the snapshot see it too.
    'is_sample', d.is_sample
  )
$$;

comment on function app.deal_snapshot is
  'FR-M1-08. The locked deal-event payload shape (money as ::text). M4/M5/M2 read these keys; the OLD snapshot on an update is what M2/M4 restate against. Add keys, never rename/drop. M10.3 appended is_sample.';

-- ===========================================================================
-- 3. create_deal gains p_is_sample (§3.5, FR-M10-07)
-- ===========================================================================

-- Adding a parameter is a signature change, which CREATE OR REPLACE cannot do — so
-- DROP + CREATE, exactly as M4.1 did to add default_total_collectible. The body is
-- the LIVE definition verbatim (M4.1's, which threads p_default_total_collectible)
-- plus the is_sample column (set from the new trailing param, which defaults false
-- so EVERY existing caller — the deal form, the importer — books a normal deal with
-- no change).
drop function if exists public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
);

create function public.create_deal(
  -- inputs
  p_booked_date date,
  p_transaction_type public.deal_transaction_type,
  p_deal_type public.deal_type,
  p_developer_id uuid,
  p_client_name text,
  p_representation public.deal_representation,
  p_property_type_id uuid,
  p_lead_source_id uuid,
  p_property_details text,
  p_mode_of_payment public.deal_mode_of_payment,
  p_list_price numeric,
  p_force_vat boolean,
  p_commission_basis public.deal_commission_basis,
  p_rate_pct text,
  p_fixed_amount numeric,
  p_receipt_issued boolean,
  p_incentive_billed numeric,
  p_incentive_taxable public.deal_incentive_taxable,
  p_referral_out_pct numeric,
  p_referral_out_fixed numeric,
  p_referral_paid boolean,
  -- engine-computed (M1.1 DealDerived + M4.1's Rule K anchor)
  p_property_vat public.deal_property_vat,
  p_net_list_price numeric,
  p_comm_base public.deal_comm_base_display,
  p_vat_basis public.deal_vat_basis,
  p_billed_commission numeric,
  p_gci_net_of_vat numeric,
  p_incentive_net numeric,
  p_referral_out numeric,
  p_net_gci numeric,
  p_default_total_collectible numeric,
  p_vat_memo numeric,
  p_ewt_memo numeric,
  p_yield_on_list numeric,
  p_taxable boolean,
  -- M10.3 §3.5 — books the row as the walkthrough sample (default false).
  p_is_sample boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_workspace_id uuid;
  v_seq integer;
  v_code text;
  v_receipt boolean;
  v_booked_year integer;
  v_display_label text;
  v_row public.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  perform app.assert_deal_composition(
    p_billed_commission, p_gci_net_of_vat, p_incentive_net, p_referral_out,
    p_referral_out_pct, p_referral_out_fixed, p_net_gci
  );

  v_receipt := (p_deal_type = 'developer') or coalesce(p_receipt_issued, false);

  update public.workspace
  set deal_id_sequence = deal_id_sequence + 1
  where id = v_workspace_id
  returning deal_id_sequence into v_seq;

  v_code := 'D' || lpad(v_seq::text, 3, '0');

  v_booked_year := extract(year from p_booked_date)::integer;
  v_display_label := v_code || ' — ' || p_client_name;

  insert into public.deal (
    workspace_id, deal_code,
    booked_date, transaction_type, deal_type, developer_id, client_name,
    representation, property_type_id, lead_source_id, property_details,
    mode_of_payment, list_price, force_vat, commission_basis, rate_pct,
    fixed_amount, receipt_issued, incentive_billed, incentive_taxable,
    referral_out_pct, referral_out_fixed, referral_paid,
    property_vat, net_list_price, comm_base, vat_basis, billed_commission,
    gci_net_of_vat, incentive_net, referral_out, net_gci, default_total_collectible,
    vat_memo, ewt_memo, yield_on_list, taxable, booked_year, display_label,
    is_sample,
    created_by, updated_by
  )
  values (
    v_workspace_id, v_code,
    p_booked_date, p_transaction_type, p_deal_type, p_developer_id, p_client_name,
    p_representation, p_property_type_id, p_lead_source_id, p_property_details,
    p_mode_of_payment, p_list_price, coalesce(p_force_vat, false), p_commission_basis, p_rate_pct,
    p_fixed_amount, v_receipt, coalesce(p_incentive_billed, 0), p_incentive_taxable,
    coalesce(p_referral_out_pct, 0), coalesce(p_referral_out_fixed, 0), coalesce(p_referral_paid, false),
    p_property_vat, p_net_list_price, p_comm_base, p_vat_basis, p_billed_commission,
    p_gci_net_of_vat, p_incentive_net, p_referral_out, p_net_gci, p_default_total_collectible,
    p_vat_memo, p_ewt_memo, p_yield_on_list, p_taxable, v_booked_year, v_display_label,
    coalesce(p_is_sample, false),
    v_uid, v_uid
  )
  returning * into v_row;

  v_changes := app.deal_created_changes(v_row);

  v_audit_id := app.write_audit_entry(
    v_workspace_id, 'deal', v_row.id, 'create', v_changes
  );

  insert into public.deal_event (
    workspace_id, actor_user_id, deal_id, deal_code, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_workspace_id, v_uid, v_row.id, v_row.deal_code, 'created',
    null, app.deal_snapshot(v_row), '{}'::jsonb, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'deal_code', v_row.deal_code,
    'net_gci', v_row.net_gci::text,
    'gci_net_of_vat', v_row.gci_net_of_vat::text,
    'version', v_row.version,
    'is_sample', v_row.is_sample,
    'audit_entry_id', v_audit_id,
    'event_id', v_event_id
  );
end;
$$;

comment on function public.create_deal is
  'FR-M1-01. Allocates the permanent code atomically, verifies Rule G/H composition, persists the engine''s derived figures (incl. M4.1''s Rule K anchor), audits, and emits deal.created — one transaction. p_is_sample (M10.3 §3.5, default false) books the walkthrough sample. Send money as JSON strings.';

revoke all on function public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean, boolean
) from public;

grant execute on function public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean, boolean
) to authenticated;

-- ===========================================================================
-- 4. link_sample_deal — pin the walkthrough's sample to the wizard state (§3.1)
-- ===========================================================================

-- Called right after the sample deal is created: stamps onboarding_state.
-- sample_deal_id so the banner/cleanup know a sample exists. Verifies the deal is
-- in the caller's workspace AND is_sample (so it can only ever point at a sample).
create or replace function public.link_sample_deal(p_deal_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_is_sample boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select is_sample into v_is_sample
  from public.deal
  where id = p_deal_id and workspace_id = v_workspace_id;

  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;
  if not v_is_sample then
    raise exception 'deal is not a sample deal' using errcode = 'check_violation';
  end if;

  update public.onboarding_state
  set sample_deal_id = p_deal_id, updated_by = (select auth.uid())
  where workspace_id = v_workspace_id;

  return jsonb_build_object('ok', true, 'sample_deal_id', p_deal_id);
end;
$$;

comment on function public.link_sample_deal is
  'M10 §3.1/§3.5. Pins onboarding_state.sample_deal_id to the walkthrough''s sample deal (must be is_sample in the caller''s workspace). Cleared by cleanup_sample_data.';

revoke all on function public.link_sample_deal(uuid) from public;
grant execute on function public.link_sample_deal(uuid) to authenticated;

-- ===========================================================================
-- 5. The rule-5 delete exception + the one-transaction cleanup cascade
-- ===========================================================================

-- Rule 5: cleanup is the ONE documented exception to M1's delete protection —
-- a deal WITH payments may be hard-deleted, but ONLY where is_sample. RLS is the
-- real enforcement (the delete_deal comment says so), so the exception lives in
-- the DELETE policy: childless OR sample.
drop policy if exists "deal_delete_childless" on public.deal;
create policy "deal_delete_childless"
  on public.deal for delete
  to authenticated
  using (
    app.is_workspace_member(workspace_id)
    and (app.deal_payment_count(id) = 0 or is_sample)
  );

-- Sample children have no user delete path normally (a receivable/payment is
-- never user-deleted). The cleanup cascade needs one, scoped so ONLY sample rows
-- can ever be removed — a forged direct DELETE of a non-sample payment/receivable
-- still matches zero rows.
create policy "payment_delete_sample"
  on public.payment for delete
  to authenticated
  using (app.is_workspace_member(workspace_id) and is_sample);

create policy "receivable_delete_sample"
  on public.receivable for delete
  to authenticated
  using (app.is_workspace_member(workspace_id) and is_sample);

-- The cascade itself (rule 5, FR-M10-09). One transaction, ordered
-- payments → receivable → deal, audit-logged, then the affected yield cell is
-- rebuilt so every downstream figure returns to its pre-sample value EXACTLY
-- (the dashboard reads live, so deleting the rows is enough there; only M2's
-- materialized yield_aggregate needs the explicit per-cell recompute).
--
-- SECURITY INVOKER: RLS' is_sample-scoped delete policies are the guard, so this
-- can never touch a real deal's data. A mid-flight failure raises, and the whole
-- function body being one transaction means NOTHING is deleted (AC2).
create or replace function public.cleanup_sample_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_workspace_id uuid;
  v_deal record;
  v_payments_deleted integer := 0;
  v_receivables_deleted integer := 0;
  v_deals_deleted integer := 0;
  v_n integer;
  -- The (segment, year) cells the deleted deals touched, so M2's aggregate can
  -- be rebuilt from the surviving deals afterwards.
  v_cells jsonb := '[]'::jsonb;
  v_cell jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Walk the sample deals (at most one in v1, but the cascade is set-safe).
  for v_deal in
    select id, deal_code, client_name, net_gci,
           app.deal_segment(transaction_type, deal_type, representation) as segment,
           booked_year
    from public.deal
    where workspace_id = v_workspace_id and is_sample
  loop
    -- The count of sample payments about to go with this deal (for the audit).
    select count(*) into v_n
    from public.payment
    where deal_id = v_deal.id and is_sample;

    -- Audit BEFORE the delete (same transaction — a later failure rolls this back
    -- too, so there is never a phantom "deleted" entry). Action 'delete' matches
    -- delete_deal; the payload records exactly what the cascade removed.
    perform app.write_audit_entry(
      v_workspace_id, 'deal', v_deal.id, 'delete',
      jsonb_build_object(
        'deal_code', jsonb_build_object('old', v_deal.deal_code, 'new', null),
        'client_name', jsonb_build_object('old', v_deal.client_name, 'new', null),
        'net_gci', jsonb_build_object('old', v_deal.net_gci::text, 'new', null),
        'sample_payments_removed', jsonb_build_object('old', v_n, 'new', 0),
        'sample_cleanup', jsonb_build_object('old', null, 'new', true)
      )
    );

    if v_deal.segment is not null then
      v_cells := v_cells || jsonb_build_array(
        jsonb_build_object('segment', v_deal.segment, 'year', v_deal.booked_year)
      );
    end if;
  end loop;

  -- Ordered cascade (rule 5): payments first (a payment's RESTRICT FK to the deal
  -- forbids deleting the deal before them), then the receivable, then the deal.
  -- payment_event cascades with each payment; deal_event cascades with the deal.
  delete from public.payment
  where workspace_id = v_workspace_id and is_sample;
  get diagnostics v_payments_deleted = row_count;

  delete from public.receivable
  where workspace_id = v_workspace_id and is_sample;
  get diagnostics v_receivables_deleted = row_count;

  delete from public.deal
  where workspace_id = v_workspace_id and is_sample;
  get diagnostics v_deals_deleted = row_count;

  -- Rebuild each touched yield cell from the SURVIVING deals — the deleted sample
  -- left no event, so the cursor-based consumer would never re-project it; the
  -- absolute per-cell recompute deletes the cell if it is now empty (AC2: yield
  -- returns to exactly its pre-sample value).
  for v_cell in select * from jsonb_array_elements(v_cells)
  loop
    perform app.recompute_yield_cell(
      v_workspace_id,
      v_cell->>'segment',
      (v_cell->>'year')::integer
    );
  end loop;

  -- The sample is gone; unpin it from the wizard state so the banner disappears.
  update public.onboarding_state
  set sample_deal_id = null, updated_by = v_uid
  where workspace_id = v_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'deals_deleted', v_deals_deleted,
    'receivables_deleted', v_receivables_deleted,
    'payments_deleted', v_payments_deleted
  );
end;
$$;

comment on function public.cleanup_sample_data is
  'FR-M10-09, rule 5. Deletes all sample payments → receivable → deal in ONE transaction (the only path that deletes a deal with payments, RLS-guarded to is_sample), audit-logged, then rebuilds the affected yield cells so dashboards return to pre-sample values exactly. Mid-failure deletes nothing.';

revoke all on function public.cleanup_sample_data() from public;
grant execute on function public.cleanup_sample_data() to authenticated;

-- ===========================================================================
-- 6. ChecklistState (§3.2) — event-derived, never-gating getting-started card
-- ===========================================================================

-- One row per workspace, holding ONLY the user-set dismissed_at. The four items
-- are DERIVED LIVE (get_checklist_state) from the existing durable rows — the
-- checklist reports reality, it never collects claims (§3.2), and it NEVER gates a
-- feature (rule 9): no policy or function anywhere reads it to allow/deny.
create table public.checklist_state (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  -- The only stored, user-editable field (§3.2). Hides the card everywhere;
  -- reversible from Settings.
  dismissed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.checklist_state is
  'M10 §3.2. One getting-started checklist per workspace. Stores ONLY dismissed_at (the user-set field); the four items are derived live from deals/payments/imports/tax review by get_checklist_state. Never gates any feature (rule 9).';

create trigger checklist_state_touch_updated_at
  before update on public.checklist_state
  for each row execute function app.touch_updated_at();

alter table public.checklist_state enable row level security;

create policy "checklist_state_select_member"
  on public.checklist_state for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "checklist_state_insert_member"
  on public.checklist_state for insert
  to authenticated
  with check (app.is_workspace_member(workspace_id));

create policy "checklist_state_update_member"
  on public.checklist_state for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

-- The derivation (§3.2). Each timestamp is the earliest durable evidence of the
-- corresponding event; sample-flagged rows are excluded from first_deal /
-- first_payment (rule 10). dismissed_at is the only stored field.
create or replace function public.get_checklist_state()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_dismissed_at timestamptz;
  v_settings_reviewed_at timestamptz;
  v_first_deal_at timestamptz;
  v_first_payment_at timestamptz;
  v_importer_run_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  select dismissed_at into v_dismissed_at
  from public.checklist_state
  where workspace_id = v_workspace_id;

  -- settings_reviewed: wizard tax_review completed OR the M0 tax settings saved
  -- (the VAT question is stamped on that save). Earliest of the two.
  select least(
    (select min(occurred_at) from public.onboarding_event
       where workspace_id = v_workspace_id and step = 'tax_review'
         and event_type = 'step_completed'),
    (select vat_registered_confirmed_at from public.tax_settings
       where workspace_id = v_workspace_id)
  ) into v_settings_reviewed_at;

  -- first REAL deal (rule 10: is_sample excluded).
  select min(created_at) into v_first_deal_at
  from public.deal
  where workspace_id = v_workspace_id and is_sample = false;

  -- first REAL payment: a non-archived payment against a non-sample deal.
  select min(created_at) into v_first_payment_at
  from public.payment
  where workspace_id = v_workspace_id and is_sample = false and archived_at is null;

  -- first successful import (an import_batch row only exists on a committed run).
  select min(created_at) into v_importer_run_at
  from public.import_batch
  where workspace_id = v_workspace_id;

  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'settings_reviewed_at', v_settings_reviewed_at,
    'first_deal_at', v_first_deal_at,
    'first_payment_at', v_first_payment_at,
    'importer_run_at', v_importer_run_at,
    'dismissed_at', v_dismissed_at
  );
end;
$$;

comment on function public.get_checklist_state is
  'M10 §3.2/FR-M10-15. Derives the four checklist items live from durable event rows (deals/payments/imports/tax review); sample rows never tick first_deal/first_payment (rule 10). dismissed_at is the only stored field. Never gates anything (rule 9).';

-- dismiss / restore — the only writes (§3.2: user-set, reversible from Settings).
create or replace function public.set_checklist_dismissed(p_dismissed boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  insert into public.checklist_state (workspace_id, dismissed_at, created_by, updated_by)
  values (
    v_workspace_id,
    case when p_dismissed then now() else null end,
    (select auth.uid()), (select auth.uid())
  )
  on conflict (workspace_id) do update set
    dismissed_at = case when p_dismissed then now() else null end,
    updated_by = (select auth.uid());

  return public.get_checklist_state();
end;
$$;

comment on function public.set_checklist_dismissed is
  'M10 §3.2/FR-M10-15. Dismisses (hides everywhere) or restores the checklist card. The only write to checklist_state; reversible.';

revoke all on function public.get_checklist_state() from public;
revoke all on function public.set_checklist_dismissed(boolean) from public;
grant execute on function public.get_checklist_state() to authenticated;
grant execute on function public.set_checklist_dismissed(boolean) to authenticated;
