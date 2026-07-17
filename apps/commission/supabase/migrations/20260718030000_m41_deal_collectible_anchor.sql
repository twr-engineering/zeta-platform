-- M4.1 — the deal's default Total Collectible anchor (Rule K.2), carried on events.
--
-- Module: M4 PRD §3.2 Rule K, §4 rule 3; M4_Milestones § M4.1
--
-- WHY THIS LIVES ON THE DEAL. A receivable's Total Collectible is `gci_net_of_vat
-- + incentive_net` (Rule K.2) — the full cash the payor sends in, before the agent
-- disburses referrers themselves. Computing it from the *stored* 2-dp figures drifts
-- a centavo (D013 → 906,752.24 instead of 906,752.23): the sum must be taken at full
-- precision, which only exists inside the M1.1 engine (computeDeal). So the engine
-- now emits `default_total_collectible`, the deal stores it, and app.deal_snapshot
-- carries it — M4's receivable consumer then MIRRORS it off the event, introducing no
-- arithmetic of its own (the same single-source-of-money-truth discipline as every
-- other figure, FR-M1-05). This is a pure additive extension of M1.2/M1.5's write
-- path: one new column, one new snapshot key, one new write argument.

-- ---------------------------------------------------------------------------
-- deal.default_total_collectible (Rule K.2) — a computed figure, engine-sourced
-- ---------------------------------------------------------------------------

alter table public.deal
  add column if not exists default_total_collectible numeric(14, 2);

-- Backfill any pre-existing rows. There are none at this milestone's baseline
-- (0 deals), so this touches nothing; it exists so the column can go NOT NULL
-- safely on a populated database. The 2-dp component sum is acceptable only as a
-- legacy backfill — every row written *through the engine* from here on carries the
-- full-precision value.
update public.deal
set default_total_collectible = gci_net_of_vat + incentive_net
where default_total_collectible is null;

alter table public.deal
  alter column default_total_collectible set not null;

comment on column public.deal.default_total_collectible is
  'M4 Rule K.2: gci_net_of_vat + incentive_net at full precision (the engine''s DealDerived.default_total_collectible). The receivable''s default Total Collectible; mirrored onto the receivable by M4''s consumer. NOT a workbook Deal-Log column.';

-- ---------------------------------------------------------------------------
-- app.deal_snapshot — add the Rule K.2 key (append-only contract: add, never drop)
-- ---------------------------------------------------------------------------

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
    -- M4 Rule K.2 anchor (added M4.1). M4 mirrors booked_net_gci=net_gci and
    -- default_total_collectible off this snapshot; the append-only contract is
    -- "add keys, never rename/drop", so existing consumers are unaffected.
    'default_total_collectible', d.default_total_collectible::text,
    'vat_memo', d.vat_memo::text,
    'ewt_memo', d.ewt_memo::text,
    'yield_on_list', d.yield_on_list::text,
    'taxable', d.taxable,
    'archived_at', to_jsonb(d.archived_at),
    'version', d.version
  )
$$;

comment on function app.deal_snapshot is
  'FR-M1-08. The locked deal-event payload shape (money as ::text). M4/M5/M2 read these keys; the OLD snapshot on an update is what M2/M4 restate against. Add keys, never rename/drop. (M4.1 added default_total_collectible.)';

-- ---------------------------------------------------------------------------
-- create_deal — FR-M1-01, extended with the Rule K.2 argument
-- ---------------------------------------------------------------------------
-- Adding a parameter changes the signature, so the old function is dropped and
-- recreated (CREATE OR REPLACE cannot change the argument list, and leaving both
-- overloads would make the PostgREST call ambiguous). The body is M1.2's verbatim,
-- plus persisting p_default_total_collectible. PostgREST binds arguments by name,
-- so existing/new callers are unaffected by the position.

drop function if exists public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
);

create function public.create_deal(
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
    'audit_entry_id', v_audit_id,
    'event_id', v_event_id
  );
end;
$$;

comment on function public.create_deal is
  'FR-M1-01. Allocates the permanent code atomically, verifies Rule G/H composition, persists the engine''s derived figures (incl. M4 Rule K.2 default_total_collectible), audits, and emits deal.created — one transaction. Send money as JSON strings.';

-- ---------------------------------------------------------------------------
-- update_deal — FR-M1-03, extended with the Rule K.2 argument
-- ---------------------------------------------------------------------------

drop function if exists public.update_deal(
  uuid, integer, date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean
);

create function public.update_deal(
  p_id uuid,
  p_expected_version integer,
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
  p_taxable boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before public.deal;
  v_after public.deal;
  v_receipt boolean;
  v_changes jsonb;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform app.assert_deal_composition(
    p_billed_commission, p_gci_net_of_vat, p_incentive_net, p_referral_out,
    p_referral_out_pct, p_referral_out_fixed, p_net_gci
  );

  select * into v_before from public.deal where id = p_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  if v_before.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'reason', 'stale_version',
      'id', v_before.id, 'current_version', v_before.version
    );
  end if;

  v_receipt := (p_deal_type = 'developer') or coalesce(p_receipt_issued, false);

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
  v_after.default_total_collectible := p_default_total_collectible;
  v_after.vat_memo := p_vat_memo;
  v_after.ewt_memo := p_ewt_memo;
  v_after.yield_on_list := p_yield_on_list;
  v_after.taxable := p_taxable;
  v_after.booked_year := extract(year from p_booked_date)::integer;
  v_after.display_label := v_before.deal_code || ' — ' || p_client_name;

  v_changes := app.jsonb_diff(app.deal_audit_row(v_before), app.deal_audit_row(v_after));

  if v_changes = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'id', v_before.id,
      'deal_code', v_before.deal_code, 'version', v_before.version
    );
  end if;

  v_after.version := v_before.version + 1;

  update public.deal set
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
    default_total_collectible = v_after.default_total_collectible,
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

  v_audit_id := app.write_audit_entry(
    v_before.workspace_id, 'deal', v_after.id, 'update', v_changes
  );

  insert into public.deal_event (
    workspace_id, actor_user_id, deal_id, deal_code, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_before.workspace_id, v_uid, v_after.id, v_after.deal_code, 'updated',
    app.deal_snapshot(v_before), app.deal_snapshot(v_after), v_changes, v_audit_id
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

comment on function public.update_deal is
  'FR-M1-03. Persists recomputed inputs+derived (incl. M4 Rule K.2 default_total_collectible), field-level audit, deal.updated with old+new snapshots; refuses a stale version (§8). The edit-after-payments gate is enforced in the app action.';

-- ---------------------------------------------------------------------------
-- apply_recompute_batch — FR-M1-07, restate the Rule K.2 anchor too
-- ---------------------------------------------------------------------------
-- Signature unchanged (p_results is jsonb); the batch just reads and persists the
-- extra derived key. A bulk recompute that moves gci/incentive now moves the
-- default collectible in lock-step, and the deal.updated event carries it — so M4's
-- receivable follows a bulk restatement exactly as it follows a single edit.

create or replace function public.apply_recompute_batch(
  p_job_id uuid,
  p_results jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.recompute_job;
  v_event_id uuid;
  r jsonb;
  v_before public.deal;
  v_after public.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_processed integer := 0;
  v_restated integer := 0;
  v_max_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_job from public.recompute_job where id = p_job_id for update;
  if not found then
    raise exception 'recompute job not found' using errcode = 'no_data_found';
  end if;
  v_event_id := v_job.settings_change_event_id;

  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    v_processed := v_processed + 1;
    v_max_id := (r->>'id')::uuid;

    select * into v_before from public.deal where id = (r->>'id')::uuid for update;
    if not found or v_before.version <> (r->>'expected_version')::integer then
      continue;
    end if;

    perform app.assert_deal_composition(
      v_before.billed_commission,
      (r->>'gci_net_of_vat')::numeric,
      (r->>'incentive_net')::numeric,
      (r->>'referral_out')::numeric,
      v_before.referral_out_pct,
      v_before.referral_out_fixed,
      (r->>'net_gci')::numeric
    );

    v_after := v_before;
    v_after.property_vat := (r->>'property_vat')::public.deal_property_vat;
    v_after.net_list_price := (r->>'net_list_price')::numeric;
    v_after.comm_base := (r->>'comm_base')::public.deal_comm_base_display;
    v_after.vat_basis := (r->>'vat_basis')::public.deal_vat_basis;
    v_after.billed_commission := (r->>'billed_commission')::numeric;
    v_after.gci_net_of_vat := (r->>'gci_net_of_vat')::numeric;
    v_after.incentive_net := (r->>'incentive_net')::numeric;
    v_after.referral_out := (r->>'referral_out')::numeric;
    v_after.net_gci := (r->>'net_gci')::numeric;
    v_after.default_total_collectible := (r->>'default_total_collectible')::numeric;
    v_after.vat_memo := (r->>'vat_memo')::numeric;
    v_after.ewt_memo := (r->>'ewt_memo')::numeric;
    v_after.yield_on_list := (r->>'yield_on_list')::numeric;
    v_after.taxable := (r->>'taxable')::boolean;

    v_changes := app.jsonb_diff(app.deal_audit_row(v_before), app.deal_audit_row(v_after));

    if v_changes = '{}'::jsonb then
      continue;
    end if;

    v_after.version := v_before.version + 1;

    update public.deal set
      property_vat = v_after.property_vat,
      net_list_price = v_after.net_list_price,
      comm_base = v_after.comm_base,
      vat_basis = v_after.vat_basis,
      billed_commission = v_after.billed_commission,
      gci_net_of_vat = v_after.gci_net_of_vat,
      incentive_net = v_after.incentive_net,
      referral_out = v_after.referral_out,
      net_gci = v_after.net_gci,
      default_total_collectible = v_after.default_total_collectible,
      vat_memo = v_after.vat_memo,
      ewt_memo = v_after.ewt_memo,
      yield_on_list = v_after.yield_on_list,
      taxable = v_after.taxable,
      version = v_after.version,
      updated_by = v_uid
    where id = v_before.id
    returning * into v_after;

    v_audit_id := app.write_sourced_audit_entry(
      v_before.workspace_id, 'deal', v_after.id, 'update', v_changes, v_event_id
    );

    insert into public.deal_event (
      workspace_id, actor_user_id, deal_id, deal_code, event_type,
      old_values, new_values, field_changes, audit_entry_id, settings_change_event_id
    )
    values (
      v_before.workspace_id, v_uid, v_after.id, v_after.deal_code, 'updated',
      app.deal_snapshot(v_before), app.deal_snapshot(v_after), v_changes, v_audit_id, v_event_id
    );

    v_restated := v_restated + 1;
  end loop;

  update public.recompute_job set
    status = 'running',
    processed_deals = processed_deals + v_processed,
    restated_deals = restated_deals + v_restated,
    last_deal_id = coalesce(v_max_id, last_deal_id),
    error = null
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'ok', true,
    'batch_processed', v_processed,
    'batch_restated', v_restated,
    'processed', v_job.processed_deals,
    'restated', v_job.restated_deals,
    'total', v_job.total_deals
  );
end;
$$;

comment on function public.apply_recompute_batch is
  'FR-M1-07. Single writer for a recompute batch: per deal, re-check Rule G/H, diff, and on change persist derived figures (incl. M4 Rule K.2 default_total_collectible) + a sourced audit entry + a deal.updated event. Skips version-moved deals; no-ops unchanged ones. Advances the job cursor atomically.';

-- ---------------------------------------------------------------------------
-- Grants — the recreated create_deal / update_deal (new signatures)
-- ---------------------------------------------------------------------------

revoke all on function public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
) from public;

grant execute on function public.create_deal(
  date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
) to authenticated;

revoke all on function public.update_deal(
  uuid, integer, date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
) from public;

grant execute on function public.update_deal(
  uuid, integer, date, public.deal_transaction_type, public.deal_type, uuid, text,
  public.deal_representation, uuid, uuid, text, public.deal_mode_of_payment,
  numeric, boolean, public.deal_commission_basis, text, numeric, boolean,
  numeric, public.deal_incentive_taxable, numeric, numeric, boolean,
  public.deal_property_vat, numeric, public.deal_comm_base_display,
  public.deal_vat_basis, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
) to authenticated;
