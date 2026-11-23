-- M1.2 — the deal write path, and the moment M0.3's reference counts turn real.
--
-- Module: M1 PRD §4 (business rules), §4.1 (permanent IDs), §9 (acceptance),
--         FR-M1-01/03/04/08; M1_Milestones § M1.2
--
-- THE WRITE PATH IS M0.2'S, EXTENDED. Every mutation is one SECURITY INVOKER
-- database function so PostgREST's per-request transaction makes the change, its
-- audit entry (rule 12) and its deal event (FR-M1-08) atomic — all land or none
-- do. The actor is auth.uid(), read inside the function, never a parameter.
--
-- THE ENGINE RUNS IN THE APP, NOT HERE. src/lib/engine (TypeScript) is the single
-- source of money truth (FR-M1-05); reimplementing Rules A–J in SQL would create
-- a second, divergent truth. So the app calls computeDeal() and passes the
-- derived figures in, and these functions are the SINGLE WRITER that persists
-- them. What the DB *can* verify without re-deriving are the pure composition
-- invariants — Rule G (referral_out) and Rule H (NET GCI) are addition, not tax
-- math — so it does, rejecting any derived payload that fails them. That is what
-- "verify/accept as the single writer" means: the tax math is trusted from the
-- engine, the arithmetic that ties the figures together is enforced here.

-- ---------------------------------------------------------------------------
-- Diff helpers — field-level audit without 36 hand-written comparisons
-- ---------------------------------------------------------------------------

-- Every editable input + every computed field, value-normalised through the
-- column types (numeric(14,2) renders "8000000.00" on both sides, so a re-save
-- of the same figure is correctly a non-change) and money as ::text (never a
-- JSON float). This is the audit view of a deal; the EVENT payload is the
-- separate, downstream-facing commission_private.deal_snapshot.
create or replace function commission_private.deal_audit_row(d commission.deal)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'booked_date', to_jsonb(d.booked_date),
    'transaction_type', d.transaction_type::text,
    'deal_type', d.deal_type::text,
    'developer_id', to_jsonb(d.developer_id),
    'client_name', d.client_name,
    'representation', d.representation::text,
    'property_type_id', to_jsonb(d.property_type_id),
    'lead_source_id', to_jsonb(d.lead_source_id),
    'property_details', d.property_details,
    'mode_of_payment', d.mode_of_payment::text,
    'list_price', d.list_price::text,
    'force_vat', to_jsonb(d.force_vat),
    'commission_basis', d.commission_basis::text,
    'rate_pct', to_jsonb(d.rate_pct),
    'fixed_amount', case when d.fixed_amount is null then null else to_jsonb(d.fixed_amount::text) end,
    'receipt_issued', to_jsonb(d.receipt_issued),
    'incentive_billed', d.incentive_billed::text,
    'incentive_taxable', to_jsonb(d.incentive_taxable::text),
    'referral_out_pct', d.referral_out_pct::text,
    'referral_out_fixed', d.referral_out_fixed::text,
    'referral_paid', to_jsonb(d.referral_paid),
    'property_vat', d.property_vat::text,
    'net_list_price', d.net_list_price::text,
    'comm_base', d.comm_base::text,
    'vat_basis', d.vat_basis::text,
    'billed_commission', d.billed_commission::text,
    'gci_net_of_vat', d.gci_net_of_vat::text,
    'incentive_net', d.incentive_net::text,
    'referral_out', d.referral_out::text,
    'net_gci', d.net_gci::text,
    'vat_memo', d.vat_memo::text,
    'ewt_memo', d.ewt_memo::text,
    'yield_on_list', d.yield_on_list::text,
    'taxable', to_jsonb(d.taxable),
    'booked_year', to_jsonb(d.booked_year),
    'display_label', d.display_label
  )
$$;

-- Old→new diff of two audit rows: the keys whose value moved, each as
-- {old, new}. Assumes the same key set on both sides (deal_audit_row always
-- produces it).
create or replace function commission_private.jsonb_diff(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(a.key, jsonb_build_object('old', p_before -> a.key, 'new', a.value)),
    '{}'::jsonb
  )
  from jsonb_each(p_after) a
  where a.value is distinct from (p_before -> a.key)
$$;

-- The full row as create-time changes: every field old=null → new=value.
create or replace function commission_private.deal_created_changes(d commission.deal)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(e.key, jsonb_build_object('old', null, 'new', e.value)),
    '{}'::jsonb
  )
  from jsonb_each(commission_private.deal_audit_row(d)) e
$$;

-- ---------------------------------------------------------------------------
-- commission_private.assert_deal_composition — the invariants the DB enforces on the engine
-- ---------------------------------------------------------------------------

-- Rules G and H are pure addition; the DB re-checks them so a forged call that
-- bypasses the engine cannot land an internally-inconsistent deal. Tax math
-- (Rules A–F, I, J) is trusted from the engine — reproducing it here would be a
-- second source of truth. ₱0.01 tolerance because the engine rounds each stored
-- figure to centavos independently (ROUNDING.md).
create or replace function commission_private.assert_deal_composition(
  p_billed_commission numeric,
  p_gci_net_of_vat numeric,
  p_incentive_net numeric,
  p_referral_out numeric,
  p_referral_out_pct numeric,
  p_referral_out_fixed numeric,
  p_net_gci numeric
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  -- Rule G: referral_out = pct × billed + fixed.
  if abs(p_referral_out - (p_referral_out_pct * p_billed_commission + p_referral_out_fixed)) > 0.01 then
    raise exception 'deal composition violates Rule G (referral_out)'
      using errcode = 'check_violation';
  end if;
  -- Rule H: net_gci = gci + incentive_net − referral_out.
  if abs(p_net_gci - (p_gci_net_of_vat + p_incentive_net - p_referral_out)) > 0.01 then
    raise exception 'deal composition violates Rule H (NET GCI)'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- commission.create_deal — FR-M1-01
-- ---------------------------------------------------------------------------

-- One transaction: allocate the permanent code, verify composition, insert,
-- audit, emit the created event. Inputs AND the engine's derived figures are
-- parameters; the app computed the latter with computeDeal().
create or replace function commission.create_deal(
  -- inputs
  p_booked_date date,
  p_transaction_type commission.deal_transaction_type,
  p_deal_type commission.deal_type,
  p_developer_id uuid,
  p_client_name text,
  p_representation commission.deal_representation,
  p_property_type_id uuid,
  p_lead_source_id uuid,
  p_property_details text,
  p_mode_of_payment commission.deal_mode_of_payment,
  p_list_price numeric,
  p_force_vat boolean,
  p_commission_basis commission.deal_commission_basis,
  p_rate_pct text,
  p_fixed_amount numeric,
  p_receipt_issued boolean,
  p_incentive_billed numeric,
  p_incentive_taxable commission.deal_incentive_taxable,
  p_referral_out_pct numeric,
  p_referral_out_fixed numeric,
  p_referral_paid boolean,
  -- engine-computed (the M1.1 DealDerived fields; booked_year/display_label are
  -- derived in-body since display_label needs the freshly-allocated code)
  p_property_vat commission.deal_property_vat,
  p_net_list_price numeric,
  p_comm_base commission.deal_comm_base_display,
  p_vat_basis commission.deal_vat_basis,
  p_billed_commission numeric,
  p_gci_net_of_vat numeric,
  p_incentive_net numeric,
  p_referral_out numeric,
  p_net_gci numeric,
  p_vat_memo numeric,
  p_ewt_memo numeric,
  p_yield_on_list numeric,
  p_taxable boolean
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
  v_row commission.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_workspace_id := commission_private.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- The engine is trusted for tax math; the arithmetic that ties the figures is
  -- enforced (see the function's note).
  perform commission_private.assert_deal_composition(
    p_billed_commission, p_gci_net_of_vat, p_incentive_net, p_referral_out,
    p_referral_out_pct, p_referral_out_fixed, p_net_gci
  );

  -- Developer deals are always treated Yes (§3.1 field 20), so the stored row
  -- matches the workbook regardless of what the form sent.
  v_receipt := (p_deal_type = 'developer') or coalesce(p_receipt_issued, false);

  -- ATOMIC, CONCURRENCY-SAFE CODE ALLOCATION (§4.1). The UPDATE takes a row lock
  -- on the workspace, so two concurrent create_deal calls for the same workspace
  -- serialise here: each reads a distinct, monotonically increasing sequence
  -- value. No gaps in the success path, never a reused number — the DB sequence
  -- replaces the workbook's fragile Apps Script.
  update commission.workspace
  set deal_id_sequence = deal_id_sequence + 1
  where id = v_workspace_id
  returning deal_id_sequence into v_seq;

  v_code := 'D' || lpad(v_seq::text, 3, '0');

  -- The two trivial non-money derivations M1.2 owns (M1.1 handoff). display_label
  -- needs the freshly-allocated code, so both are built HERE rather than passed —
  -- the app cannot know the code before this call, and year(date) has one answer.
  v_booked_year := extract(year from p_booked_date)::integer;
  v_display_label := v_code || ' — ' || p_client_name;

  insert into commission.deal (
    workspace_id, deal_code,
    booked_date, transaction_type, deal_type, developer_id, client_name,
    representation, property_type_id, lead_source_id, property_details,
    mode_of_payment, list_price, force_vat, commission_basis, rate_pct,
    fixed_amount, receipt_issued, incentive_billed, incentive_taxable,
    referral_out_pct, referral_out_fixed, referral_paid,
    property_vat, net_list_price, comm_base, vat_basis, billed_commission,
    gci_net_of_vat, incentive_net, referral_out, net_gci, vat_memo, ewt_memo,
    yield_on_list, taxable, booked_year, display_label,
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
    p_gci_net_of_vat, p_incentive_net, p_referral_out, p_net_gci, p_vat_memo, p_ewt_memo,
    p_yield_on_list, p_taxable, v_booked_year, v_display_label,
    v_uid, v_uid
  )
  returning * into v_row;

  v_changes := commission_private.deal_created_changes(v_row);

  v_audit_id := commission_private.write_audit_entry(
    v_workspace_id, 'deal', v_row.id, 'create', v_changes
  );

  -- FR-M1-08: created → old NULL, new = the full snapshot. M4 upserts a
  -- receivable from this; M2 counts it into segment aggregates.
  insert into commission.deal_event (
    workspace_id, actor_user_id, deal_id, deal_code, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_workspace_id, v_uid, v_row.id, v_row.deal_code, 'created',
    null, commission_private.deal_snapshot(v_row), '{}'::jsonb, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'deal_code', v_row.deal_code,
    'net_gci', v_row.net_gci::text,
    'gci_net_of_vat', v_row.gci_net_of_vat::text,
    'version', v_row.version,
    'audit_entry_id', v_audit_id,
    'event_id', v_event_id
  );
end;
$$;

comment on function commission.create_deal is
  'FR-M1-01. Allocates the permanent code atomically, verifies Rule G/H composition, persists the engine''s derived figures, audits, and emits deal.created — one transaction. Send money as JSON strings.';

-- ---------------------------------------------------------------------------
-- commission.update_deal — FR-M1-03 (+ optimistic locking §8)
-- ---------------------------------------------------------------------------

-- The engine recomputes in the app; this persists the new inputs+derived,
-- field-level audits the old→new diff, and emits deal.updated with BOTH
-- snapshots (M2/M4 restate against the OLD one). Optimistic locking: the caller
-- passes the version it read; a stale version is refused as a value (not an
-- error), so M1.3 can render a conflict prompt.
--
-- The edit-after-payments friction gate (edge case 13) is enforced in the app
-- action via checkConfirmation (server-side), the same place every gate decision
-- is made; this function trusts that the gate was cleared, exactly as the M0.3
-- list functions trust their comm_base/vat_rule gate. commission_private.deal_payment_count is
-- the count the action reads to decide whether to gate (0 until M5).
create or replace function commission.update_deal(
  p_id uuid,
  p_expected_version integer,
  p_booked_date date,
  p_transaction_type commission.deal_transaction_type,
  p_deal_type commission.deal_type,
  p_developer_id uuid,
  p_client_name text,
  p_representation commission.deal_representation,
  p_property_type_id uuid,
  p_lead_source_id uuid,
  p_property_details text,
  p_mode_of_payment commission.deal_mode_of_payment,
  p_list_price numeric,
  p_force_vat boolean,
  p_commission_basis commission.deal_commission_basis,
  p_rate_pct text,
  p_fixed_amount numeric,
  p_receipt_issued boolean,
  p_incentive_billed numeric,
  p_incentive_taxable commission.deal_incentive_taxable,
  p_referral_out_pct numeric,
  p_referral_out_fixed numeric,
  p_referral_paid boolean,
  p_property_vat commission.deal_property_vat,
  p_net_list_price numeric,
  p_comm_base commission.deal_comm_base_display,
  p_vat_basis commission.deal_vat_basis,
  p_billed_commission numeric,
  p_gci_net_of_vat numeric,
  p_incentive_net numeric,
  p_referral_out numeric,
  p_net_gci numeric,
  p_vat_memo numeric,
  p_ewt_memo numeric,
  p_yield_on_list numeric,
  p_taxable boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before commission.deal;
  v_after commission.deal;
  v_receipt boolean;
  v_changes jsonb;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform commission_private.assert_deal_composition(
    p_billed_commission, p_gci_net_of_vat, p_incentive_net, p_referral_out,
    p_referral_out_pct, p_referral_out_fixed, p_net_gci
  );

  -- RLS makes another tenant's row invisible, so a cross-tenant id is simply not
  -- found — never a 200 with someone else's data (AC9). FOR UPDATE locks it so
  -- the diff cannot race a concurrent save.
  select * into v_before from commission.deal where id = p_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  -- Optimistic lock (§8): the row moved under the caller. A value, not an
  -- exception — raising would roll back nothing to report but denies M1.3 the
  -- current version it needs to offer "reload and reapply".
  if v_before.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'reason', 'stale_version',
      'id', v_before.id, 'current_version', v_before.version
    );
  end if;

  v_receipt := (p_deal_type = 'developer') or coalesce(p_receipt_issued, false);

  -- Build the would-be row by copying the locked one and overwriting the
  -- editable + computed fields. Diffing two full rows (below) is scale-safe
  -- because both render through the same column types.
  v_after := v_before;
  v_after.booked_date := p_booked_date;
  v_after.transaction_type := p_transaction_type;
  v_after.deal_type := p_deal_type;
  v_after.developer_id := p_developer_id;
  v_after.client_name := p_client_name;
  v_after.representation := p_representation;
  v_after.property_type_id := p_property_type_id;
  v_after.lead_source_id := p_lead_source_id;
  v_after.property_details := p_property_details;
  v_after.mode_of_payment := p_mode_of_payment;
  v_after.list_price := p_list_price;
  v_after.force_vat := coalesce(p_force_vat, false);
  v_after.commission_basis := p_commission_basis;
  v_after.rate_pct := p_rate_pct;
  v_after.fixed_amount := p_fixed_amount;
  v_after.receipt_issued := v_receipt;
  v_after.incentive_billed := coalesce(p_incentive_billed, 0);
  v_after.incentive_taxable := p_incentive_taxable;
  v_after.referral_out_pct := coalesce(p_referral_out_pct, 0);
  v_after.referral_out_fixed := coalesce(p_referral_out_fixed, 0);
  v_after.referral_paid := coalesce(p_referral_paid, false);
  v_after.property_vat := p_property_vat;
  v_after.net_list_price := p_net_list_price;
  v_after.comm_base := p_comm_base;
  v_after.vat_basis := p_vat_basis;
  v_after.billed_commission := p_billed_commission;
  v_after.gci_net_of_vat := p_gci_net_of_vat;
  v_after.incentive_net := p_incentive_net;
  v_after.referral_out := p_referral_out;
  v_after.net_gci := p_net_gci;
  v_after.vat_memo := p_vat_memo;
  v_after.ewt_memo := p_ewt_memo;
  v_after.yield_on_list := p_yield_on_list;
  v_after.taxable := p_taxable;
  -- Recomputed here, not passed: booked_year follows the (possibly edited) date,
  -- and display_label follows the client name under the deal's PERMANENT code.
  v_after.booked_year := extract(year from p_booked_date)::integer;
  v_after.display_label := v_before.deal_code || ' — ' || p_client_name;

  v_changes := commission_private.jsonb_diff(commission_private.deal_audit_row(v_before), commission_private.deal_audit_row(v_after));

  -- Nothing moved: no write, no version bump, no audit, no event. A re-save of
  -- identical inputs is a no-op, not a stale-version trap for the next reader.
  if v_changes = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'id', v_before.id,
      'deal_code', v_before.deal_code, 'version', v_before.version
    );
  end if;

  v_after.version := v_before.version + 1;

  update commission.deal set
    booked_date = v_after.booked_date,
    transaction_type = v_after.transaction_type,
    deal_type = v_after.deal_type,
    developer_id = v_after.developer_id,
    client_name = v_after.client_name,
    representation = v_after.representation,
    property_type_id = v_after.property_type_id,
    lead_source_id = v_after.lead_source_id,
    property_details = v_after.property_details,
    mode_of_payment = v_after.mode_of_payment,
    list_price = v_after.list_price,
    force_vat = v_after.force_vat,
    commission_basis = v_after.commission_basis,
    rate_pct = v_after.rate_pct,
    fixed_amount = v_after.fixed_amount,
    receipt_issued = v_after.receipt_issued,
    incentive_billed = v_after.incentive_billed,
    incentive_taxable = v_after.incentive_taxable,
    referral_out_pct = v_after.referral_out_pct,
    referral_out_fixed = v_after.referral_out_fixed,
    referral_paid = v_after.referral_paid,
    property_vat = v_after.property_vat,
    net_list_price = v_after.net_list_price,
    comm_base = v_after.comm_base,
    vat_basis = v_after.vat_basis,
    billed_commission = v_after.billed_commission,
    gci_net_of_vat = v_after.gci_net_of_vat,
    incentive_net = v_after.incentive_net,
    referral_out = v_after.referral_out,
    net_gci = v_after.net_gci,
    vat_memo = v_after.vat_memo,
    ewt_memo = v_after.ewt_memo,
    yield_on_list = v_after.yield_on_list,
    taxable = v_after.taxable,
    booked_year = v_after.booked_year,
    display_label = v_after.display_label,
    version = v_after.version,
    updated_by = v_uid
  where id = p_id
  returning * into v_after;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'deal', v_after.id, 'update', v_changes
  );

  -- FR-M1-08: updated → BOTH snapshots + the diff. M4 restates the receivable's
  -- booked figures; M2 moves the deal between segment aggregates using the old
  -- values. The OLD snapshot is why this shape is a locked contract.
  insert into commission.deal_event (
    workspace_id, actor_user_id, deal_id, deal_code, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_before.workspace_id, v_uid, v_after.id, v_after.deal_code, 'updated',
    commission_private.deal_snapshot(v_before), commission_private.deal_snapshot(v_after), v_changes, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'deal_code', v_after.deal_code, 'net_gci', v_after.net_gci::text,
    'version', v_after.version, 'field_changes', v_changes,
    'audit_entry_id', v_audit_id, 'event_id', v_event_id
  );
end;
$$;

comment on function commission.update_deal is
  'FR-M1-03. Persists recomputed inputs+derived, field-level audit, deal.updated with old+new snapshots; refuses a stale version (§8). The edit-after-payments gate is enforced in the app action.';

-- ---------------------------------------------------------------------------
-- commission.set_deal_archived — FR-M1-04 (soft delete, rule 2)
-- ---------------------------------------------------------------------------

-- Archive is the always-available reversible delete (rule 2: soft-delete
-- always). It leaves the deal out of the active list, keeps every figure intact,
-- and emits archived/restored so M4 can archive/restore the receivable. The
-- archive-cascade confirmation (which lists the N payments and the receivable
-- that go with it) is the APP's job to show; this returns the payment count so
-- the action can populate it (0 until M5).
create or replace function commission.set_deal_archived(
  p_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before commission.deal;
  v_after commission.deal;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.deal where id = p_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  if (v_before.archived_at is not null) = p_archived then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'id', v_before.id,
      'deal_code', v_before.deal_code, 'archived', p_archived,
      'payment_count', commission_private.deal_payment_count(p_id)
    );
  end if;

  update commission.deal
  set archived_at = case when p_archived then now() else null end,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_id
  returning * into v_after;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'deal', v_after.id,
    case when p_archived then 'archive' else 'restore' end::commission.audit_action,
    jsonb_build_object(
      'deal_code', jsonb_build_object('old', v_before.deal_code, 'new', v_after.deal_code),
      'archived_at', jsonb_build_object(
        'old', to_jsonb(v_before.archived_at), 'new', to_jsonb(v_after.archived_at))
    )
  );

  insert into commission.deal_event (
    workspace_id, actor_user_id, deal_id, deal_code, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_before.workspace_id, v_uid, v_after.id, v_after.deal_code,
    case when p_archived then 'archived' else 'restored' end::commission.deal_event_type,
    commission_private.deal_snapshot(v_before), commission_private.deal_snapshot(v_after), '{}'::jsonb, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'deal_code', v_after.deal_code, 'archived', p_archived,
    'payment_count', commission_private.deal_payment_count(p_id),
    'audit_entry_id', v_audit_id, 'event_id', v_event_id
  );
end;
$$;

comment on function commission.set_deal_archived is
  'FR-M1-04 rule 2. Soft delete/restore; emits deal.archived/restored. Returns payment_count so the app can show the archive-cascade confirmation (0 until M5).';

-- ---------------------------------------------------------------------------
-- commission.delete_deal — FR-M1-04 (hard delete, rule 2: never with children)
-- ---------------------------------------------------------------------------

-- Hard delete is permitted ONLY at payment count 0 (rule 2). Like the M0.3 list
-- deletes, a blocked attempt RETURNS (writing a delete_blocked audit entry) —
-- raising would roll that entry back with the record of the attempt. The DELETE
-- policy is the real enforcement; this explains itself and offers Archive.
--
-- No deal event on hard delete: it is only reachable with zero financial
-- children, so nothing downstream turned the created event into durable state.
-- The FK cascade removes this deal's events with it — the log stays a history of
-- deals that exist. For a deal with any downstream footprint the answer is
-- Archive, which is why that path emits events and this one does not.
create or replace function commission.delete_deal(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row commission.deal;
  v_count bigint;
  v_deleted uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from commission.deal where id = p_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  v_count := commission_private.deal_payment_count(p_id);

  if v_count > 0 then
    perform commission_private.write_audit_entry(
      v_row.workspace_id, 'deal', v_row.id, 'delete_blocked',
      jsonb_build_object(
        'deal_code', jsonb_build_object('old', v_row.deal_code, 'new', v_row.deal_code),
        'payment_count', jsonb_build_object('old', v_count, 'new', v_count)
      )
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'has_payments',
      'id', v_row.id, 'deal_code', v_row.deal_code, 'payment_count', v_count
    );
  end if;

  delete from commission.deal where id = p_id returning id into v_deleted;

  -- The policy disagreed with the count — i.e. M5 wired a real count into the
  -- policy but not here (or vice versa). Fail loudly rather than reporting a
  -- delete that did not happen.
  if v_deleted is null then
    raise exception 'deal % could not be deleted: it still has payments', p_id
      using errcode = 'restrict_violation';
  end if;

  -- The code is retired, never reused (§4 rule 1): the audit entry is the
  -- surviving record that D-nnn existed and was deleted.
  perform commission_private.write_audit_entry(
    v_row.workspace_id, 'deal', v_row.id, 'delete',
    jsonb_build_object(
      'deal_code', jsonb_build_object('old', v_row.deal_code, 'new', null),
      'client_name', jsonb_build_object('old', v_row.client_name, 'new', null),
      'net_gci', jsonb_build_object('old', v_row.net_gci::text, 'new', null)
    )
  );

  return jsonb_build_object('ok', true, 'id', v_row.id, 'deal_code', v_row.deal_code);
end;
$$;

comment on function commission.delete_deal is
  'FR-M1-04 rule 2. Hard delete only at payment count 0; a blocked attempt returns with a delete_blocked audit entry. Retires the code permanently.';

-- ---------------------------------------------------------------------------
-- Reference counts turn REAL (M0.3 handoff — the one edit that turns it all on)
-- ---------------------------------------------------------------------------

-- M0.3 shipped these three bodies returning 0 with a note: "replace with a count
-- over deal.<fk>_id". This is that replacement. With no other change, the
-- settings list screens' "used by N deals" column, the delete-blocked audit
-- trail, and — because the RLS delete policies call these — the actual refusal
-- of a hard delete all start carrying real counts (M0.3 milestone DoD, proven
-- live there with a forged direct DELETE).
--
-- ALL deals count, archived included: an archived deal still references its type/
-- developer/source and still computes with the stored FK (§4 rule 15), so the
-- list item cannot be hard-deleted while any deal uses it. Archiving the list
-- item stays allowed (M0.3 semantics) — only hard delete is gated on this count.
create or replace function commission_private.property_type_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select count(*) from commission.deal where property_type_id = p_id $$;

create or replace function commission_private.developer_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select count(*) from commission.deal where developer_id = p_id $$;

create or replace function commission_private.lead_source_reference_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select count(*) from commission.deal where lead_source_id = p_id $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function commission.create_deal(
  date, commission.deal_transaction_type, commission.deal_type, uuid, text,
  commission.deal_representation, uuid, uuid, text, commission.deal_mode_of_payment,
  numeric, boolean, commission.deal_commission_basis, text, numeric, boolean,
  numeric, commission.deal_incentive_taxable, numeric, numeric, boolean,
  commission.deal_property_vat, numeric, commission.deal_comm_base_display,
  commission.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
) from public;

revoke all on function commission.update_deal(
  uuid, integer, date, commission.deal_transaction_type, commission.deal_type, uuid, text,
  commission.deal_representation, uuid, uuid, text, commission.deal_mode_of_payment,
  numeric, boolean, commission.deal_commission_basis, text, numeric, boolean,
  numeric, commission.deal_incentive_taxable, numeric, numeric, boolean,
  commission.deal_property_vat, numeric, commission.deal_comm_base_display,
  commission.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
) from public;

revoke all on function commission.set_deal_archived(uuid, boolean) from public;
revoke all on function commission.delete_deal(uuid) from public;

grant execute on function commission.create_deal(
  date, commission.deal_transaction_type, commission.deal_type, uuid, text,
  commission.deal_representation, uuid, uuid, text, commission.deal_mode_of_payment,
  numeric, boolean, commission.deal_commission_basis, text, numeric, boolean,
  numeric, commission.deal_incentive_taxable, numeric, numeric, boolean,
  commission.deal_property_vat, numeric, commission.deal_comm_base_display,
  commission.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
) to authenticated;

grant execute on function commission.update_deal(
  uuid, integer, date, commission.deal_transaction_type, commission.deal_type, uuid, text,
  commission.deal_representation, uuid, uuid, text, commission.deal_mode_of_payment,
  numeric, boolean, commission.deal_commission_basis, text, numeric, boolean,
  numeric, commission.deal_incentive_taxable, numeric, numeric, boolean,
  commission.deal_property_vat, numeric, commission.deal_comm_base_display,
  commission.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
) to authenticated;

grant execute on function commission.set_deal_archived(uuid, boolean) to authenticated;
grant execute on function commission.delete_deal(uuid) to authenticated;
