-- M3.2 — extend the workbook importer with the planning-targets leg (additive).
--
-- Module: M3 PRD §4 rule 10 (importer semantics: blank/0 → null), AC11 (the 2026
--         TargetTable row + funnel rates round-trip); M3_Milestones § M3.2 importer
--         leg; m1_4Handoff ("extend the importer additively WITHOUT breaking its
--         idempotency or the existing reconciliation").
--
-- WHAT CHANGES. run_workbook_import gains ONE leg between payments and the summary
-- stamp: it inserts the GCI Calculator TARGETS rows (parsed + reconciled in the app —
-- the plan year's derived working goal ties to the sheet's F8 cache = 16,920,000) as
-- plan_year_target rows, and seeds the workspace's global funnel-rate row with the
-- workbook defaults (25/70/30/20 / 30/70/10 — the sheet's editable rate cells hold
-- exactly these values; OQ-5 keeps rates global). The signature is unchanged (jsonb),
-- so this is a CREATE OR REPLACE — the idempotency (file hash), empty-workspace guard,
-- and every existing leg are reproduced verbatim; only the new leg + summary keys are
-- added. The targets are a trusted bulk insert (like the deals leg), NOT the gated
-- upsert_plan_year_target RPC — import bypasses the friction gate (m4_1/m5_1 pattern).

create or replace function public.run_workbook_import(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_hash text := btrim(coalesce(p_payload->>'file_hash', ''));
  v_batch_id uuid;
  v_item jsonb;
  v_deal jsonb;
  v_derived jsonb;
  v_id uuid;
  v_pt_created integer := 0;
  v_dev_created integer := 0;
  v_ls_created integer := 0;
  v_deals_created integer := 0;
  v_overlays_applied integer := 0;
  v_payments_created integer := 0;
  v_targets_created integer := 0;
  v_next_order integer;
  v_pt_id uuid;
  v_dev_id uuid;
  v_ls_id uuid;
  v_code text;
  v_suffix integer;
  v_max_suffix integer := 0;
  v_receipt boolean;
  v_booked_year integer;
  v_display_label text;
  v_row public.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_deal_id uuid;
  v_target jsonb;
  v_target_id uuid;
  v_n integer;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if v_hash = '' then
    raise exception 'import payload missing file_hash' using errcode = '22023';
  end if;

  -- (1) Idempotency + empty-workspace guards.
  if exists (select 1 from public.import_batch where workspace_id = v_ws and file_hash = v_hash) then
    return jsonb_build_object('ok', false, 'reason', 'already_imported');
  end if;
  if exists (select 1 from public.deal where workspace_id = v_ws) then
    return jsonb_build_object('ok', false, 'reason', 'workspace_not_empty');
  end if;

  insert into public.import_batch (workspace_id, file_hash, file_name, created_by)
  values (v_ws, v_hash, p_payload->>'file_name', v_uid)
  returning id into v_batch_id;

  -- (2) Tax settings.
  if p_payload ? 'tax' then
    update public.tax_settings set
      vat_rate = coalesce((p_payload->'tax'->>'vat_rate')::numeric, vat_rate),
      ewt_rate = coalesce((p_payload->'tax'->>'ewt_rate')::numeric, ewt_rate),
      property_vat_threshold = coalesce((p_payload->'tax'->>'property_vat_threshold')::numeric, property_vat_threshold),
      chase_idle_months = coalesce((p_payload->'tax'->>'chase_idle_months')::integer, chase_idle_months),
      vat_registered = coalesce((p_payload->'tax'->>'vat_registered')::boolean, vat_registered)
    where workspace_id = v_ws;
  end if;

  -- (3) Lists — resolve-or-create, case-insensitive.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'property_types', '[]'::jsonb)) loop
    select id into v_pt_id from public.property_type
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_pt_id is null then
      insert into public.property_type (workspace_id, name, vat_rule, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), (v_item->>'vat_rule')::public.property_vat_rule, v_uid, v_uid)
      returning id into v_pt_id;
      perform app.write_audit_entry(v_ws, 'property_type', v_pt_id, 'create',
        jsonb_build_object(
          'name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name')),
          'vat_rule', jsonb_build_object('old', null, 'new', v_item->>'vat_rule')));
      v_pt_created := v_pt_created + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'developers', '[]'::jsonb)) loop
    select id into v_dev_id from public.developer
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_dev_id is null then
      insert into public.developer (workspace_id, name, comm_base, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), coalesce((v_item->>'comm_base')::public.developer_comm_base, 'net'), v_uid, v_uid)
      returning id into v_dev_id;
      perform app.write_audit_entry(v_ws, 'developer', v_dev_id, 'create',
        jsonb_build_object(
          'name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name')),
          'comm_base', jsonb_build_object('old', null, 'new', coalesce(v_item->>'comm_base', 'net'))));
      v_dev_created := v_dev_created + 1;
    end if;
  end loop;

  v_next_order := coalesce((select max(sort_order) from public.lead_source where workspace_id = v_ws), 0);
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'lead_sources', '[]'::jsonb)) loop
    select id into v_ls_id from public.lead_source
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_ls_id is null then
      v_next_order := v_next_order + 1;
      insert into public.lead_source (workspace_id, name, sort_order, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), v_next_order, v_uid, v_uid)
      returning id into v_ls_id;
      perform app.write_audit_entry(v_ws, 'lead_source', v_ls_id, 'create',
        jsonb_build_object('name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name'))));
      v_ls_created := v_ls_created + 1;
    end if;
  end loop;

  -- (4) Deals — preserve the workbook code, mirror create_deal's write.
  for v_deal in select value from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) loop
    v_derived := v_deal->'derived';
    v_code := btrim(v_deal->>'deal_code');

    select id into v_pt_id from public.property_type
      where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'property_type_name')) limit 1;
    if v_pt_id is null then
      raise exception 'import: property type % not found for %', v_deal->>'property_type_name', v_code
        using errcode = 'foreign_key_violation';
    end if;

    v_dev_id := null;
    if nullif(btrim(coalesce(v_deal->>'developer_name', '')), '') is not null then
      select id into v_dev_id from public.developer
        where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'developer_name')) limit 1;
      if v_dev_id is null then
        raise exception 'import: developer % not found for %', v_deal->>'developer_name', v_code
          using errcode = 'foreign_key_violation';
      end if;
    end if;

    select id into v_ls_id from public.lead_source
      where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'lead_source_name')) limit 1;
    if v_ls_id is null then
      raise exception 'import: lead source % not found for %', v_deal->>'lead_source_name', v_code
        using errcode = 'foreign_key_violation';
    end if;

    perform app.assert_deal_composition(
      (v_derived->>'billed_commission')::numeric,
      (v_derived->>'gci_net_of_vat')::numeric,
      (v_derived->>'incentive_net')::numeric,
      (v_derived->>'referral_out')::numeric,
      (v_deal->>'referral_out_pct')::numeric,
      (v_deal->>'referral_out_fixed')::numeric,
      (v_derived->>'net_gci')::numeric
    );

    v_receipt := (v_deal->>'deal_type' = 'developer') or coalesce((v_deal->>'receipt_issued')::boolean, false);
    v_booked_year := extract(year from (v_deal->>'booked_date')::date)::integer;
    v_display_label := v_code || ' — ' || (v_deal->>'client_name');

    insert into public.deal (
      workspace_id, deal_code,
      booked_date, transaction_type, deal_type, developer_id, client_name,
      representation, property_type_id, lead_source_id, property_details,
      mode_of_payment, list_price, force_vat, commission_basis, rate_pct,
      fixed_amount, receipt_issued, incentive_billed, incentive_taxable,
      referral_out_pct, referral_out_fixed, referral_paid,
      property_vat, net_list_price, comm_base, vat_basis, billed_commission,
      gci_net_of_vat, incentive_net, referral_out, net_gci, vat_memo, ewt_memo,
      yield_on_list, taxable, booked_year, display_label,
      default_total_collectible, created_by, updated_by
    )
    values (
      v_ws, v_code,
      (v_deal->>'booked_date')::date,
      (v_deal->>'transaction_type')::public.deal_transaction_type,
      (v_deal->>'deal_type')::public.deal_type,
      v_dev_id,
      v_deal->>'client_name',
      (v_deal->>'representation')::public.deal_representation,
      v_pt_id, v_ls_id,
      v_deal->>'property_details',
      (v_deal->>'mode_of_payment')::public.deal_mode_of_payment,
      (v_deal->>'list_price')::numeric,
      coalesce((v_deal->>'force_vat')::boolean, false),
      (v_deal->>'commission_basis')::public.deal_commission_basis,
      v_deal->>'rate_pct',
      case when v_deal->>'fixed_amount' is null then null else (v_deal->>'fixed_amount')::numeric end,
      v_receipt,
      coalesce((v_deal->>'incentive_billed')::numeric, 0),
      case when v_deal->>'incentive_taxable' is null then null else (v_deal->>'incentive_taxable')::public.deal_incentive_taxable end,
      coalesce((v_deal->>'referral_out_pct')::numeric, 0),
      coalesce((v_deal->>'referral_out_fixed')::numeric, 0),
      coalesce((v_deal->>'referral_paid')::boolean, false),
      (v_derived->>'property_vat')::public.deal_property_vat,
      (v_derived->>'net_list_price')::numeric,
      (v_derived->>'comm_base')::public.deal_comm_base_display,
      (v_derived->>'vat_basis')::public.deal_vat_basis,
      (v_derived->>'billed_commission')::numeric,
      (v_derived->>'gci_net_of_vat')::numeric,
      (v_derived->>'incentive_net')::numeric,
      (v_derived->>'referral_out')::numeric,
      (v_derived->>'net_gci')::numeric,
      (v_derived->>'vat_memo')::numeric,
      (v_derived->>'ewt_memo')::numeric,
      (v_derived->>'yield_on_list')::numeric,
      coalesce((v_derived->>'taxable')::boolean, false),
      v_booked_year, v_display_label,
      (v_derived->>'default_total_collectible')::numeric,
      v_uid, v_uid
    )
    returning * into v_row;

    v_changes := app.deal_created_changes(v_row);
    v_audit_id := app.write_audit_entry(v_ws, 'deal', v_row.id, 'create', v_changes);

    insert into public.deal_event (
      workspace_id, actor_user_id, deal_id, deal_code, event_type,
      old_values, new_values, field_changes, audit_entry_id
    )
    values (
      v_ws, v_uid, v_row.id, v_row.deal_code, 'created',
      null, app.deal_snapshot(v_row), '{}'::jsonb, v_audit_id
    );

    v_suffix := nullif(regexp_replace(v_code, '^\D+', ''), '')::integer;
    if v_suffix is not null and v_suffix > v_max_suffix then
      v_max_suffix := v_suffix;
    end if;

    v_deals_created := v_deals_created + 1;
  end loop;

  if v_max_suffix > 0 then
    update public.workspace
    set deal_id_sequence = greatest(deal_id_sequence, v_max_suffix)
    where id = v_ws;
  end if;

  -- (5) Project the deal.created events onto receivables (auto-create).
  loop
    select coalesce((public.consume_deal_events(500)->>'processed')::integer, 0) into v_n;
    exit when v_n = 0;
  end loop;

  -- (6) Overlays — status / confirmed / note onto the auto-created receivables.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'overlays', '[]'::jsonb)) loop
    select id into v_deal_id from public.deal
      where workspace_id = v_ws and deal_code = btrim(v_item->>'deal_code');
    if v_deal_id is not null then
      perform public.import_receivable_overlay(
        v_deal_id,
        (v_item->>'status')::public.receivable_status,
        case when v_item->>'confirmed' is null then null else (v_item->>'confirmed')::numeric end,
        v_item->>'note',
        coalesce((v_item->>'legacy_note_missing')::boolean, false)
      );
      v_overlays_applied := v_overlays_applied + 1;
    end if;
  end loop;

  -- (7) Payments — the M5.1 un-gated bulk path (create_payment per row).
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'payments', '[]'::jsonb)) loop
    select id into v_deal_id from public.deal
      where workspace_id = v_ws and deal_code = btrim(v_item->>'deal_code');
    if v_deal_id is null then
      raise exception 'import: payment references unknown deal %', v_item->>'deal_code'
        using errcode = 'foreign_key_violation';
    end if;
    perform public.create_payment(
      v_deal_id,
      (v_item->>'payment_date')::date,
      (v_item->>'gross_amount')::numeric,
      (v_item->>'payment_type')::public.payment_type,
      v_item->>'reference_note',
      (v_item->'split'->>'net_of_vat')::numeric,
      (v_item->'split'->>'vat')::numeric,
      (v_item->'split'->>'ewt')::numeric,
      (v_item->'split'->>'net_cash')::numeric,
      (v_item->'split'->>'retained')::numeric,
      (v_item->>'vat_basis_used')::public.deal_vat_basis,
      (v_item->>'ewt_rate_used')::numeric,
      (v_item->>'vat_rate_used')::numeric
    );
    v_payments_created := v_payments_created + 1;
  end loop;

  -- (8) Planning targets — the GCI Calculator TARGETS table → plan_year_target rows
  -- (M3.2). Trusted bulk insert (mirrors the deals leg; NOT the gated
  -- upsert_plan_year_target RPC), audited 'create'. Blank/0 already mapped to null in
  -- the app (rule 10); a null net_income_target is a staged, not-plannable year (rule
  -- 9). ON CONFLICT DO NOTHING is belt-and-suspenders (the empty-workspace guard means
  -- there are no rows yet; a duplicate year in the sheet would simply be ignored).
  for v_target in select value from jsonb_array_elements(coalesce(p_payload->'targets', '[]'::jsonb)) loop
    insert into public.plan_year_target (
      workspace_id, year, net_income_target, opex_pct, cos_pct,
      yield_override, avg_price_override, created_by, updated_by
    )
    values (
      v_ws,
      (v_target->>'year')::integer,
      case when v_target->>'net_income_target' is null then null else (v_target->>'net_income_target')::numeric end,
      case when v_target->>'opex_pct' is null then null else (v_target->>'opex_pct')::numeric end,
      case when v_target->>'cos_pct' is null then null else (v_target->>'cos_pct')::numeric end,
      case when v_target->>'yield_override' is null then null else (v_target->>'yield_override')::numeric end,
      case when v_target->>'avg_price_override' is null then null else (v_target->>'avg_price_override')::numeric end,
      v_uid, v_uid
    )
    on conflict (workspace_id, year) do nothing
    returning id into v_target_id;

    if v_target_id is not null then
      perform app.write_audit_entry(v_ws, 'plan_year_target', v_target_id, 'create',
        jsonb_build_object(
          'year', jsonb_build_object('old', null, 'new', to_jsonb((v_target->>'year')::integer)),
          'net_income_target', jsonb_build_object('old', null, 'new', v_target->'net_income_target'),
          'opex_pct', jsonb_build_object('old', null, 'new', v_target->'opex_pct'),
          'cos_pct', jsonb_build_object('old', null, 'new', v_target->'cos_pct'),
          'yield_override', jsonb_build_object('old', null, 'new', v_target->'yield_override'),
          'avg_price_override', jsonb_build_object('old', null, 'new', v_target->'avg_price_override')));
      v_targets_created := v_targets_created + 1;
    end if;
  end loop;

  -- Seed the workspace's global funnel-rate row with the workbook defaults (FR-M3-02;
  -- the sheet's editable rate cells hold exactly 25/70/30/20 seller, 30/70/10 buyer —
  -- the DEFAULT_FUNNEL_RATES). Lazy no-op if a row somehow already exists.
  insert into public.funnel_rates (
    workspace_id, year,
    listing_to_sold, listing_appointment_rate, seller_contact_to_appt, seller_lead_to_contact,
    buyer_viewing_to_atp, buyer_contact_to_viewing, buyer_lead_to_contact,
    created_by, updated_by
  )
  values (
    v_ws, null, 0.25, 0.70, 0.30, 0.20, 0.30, 0.70, 0.10, v_uid, v_uid
  )
  on conflict (workspace_id) where year is null do nothing;

  -- (9) Stamp the summary onto the batch.
  v_summary := jsonb_build_object(
    'property_types_created', v_pt_created,
    'developers_created', v_dev_created,
    'lead_sources_created', v_ls_created,
    'deals_created', v_deals_created,
    'overlays_applied', v_overlays_applied,
    'payments_created', v_payments_created,
    'targets_created', v_targets_created,
    'next_deal_code', 'D' || lpad((v_max_suffix + 1)::text, 3, '0'),
    'anchors', coalesce(p_payload->'anchors', '{}'::jsonb)
  );

  update public.import_batch set summary = v_summary where id = v_batch_id;

  return jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'summary', v_summary);
end;
$$;

comment on function public.run_workbook_import is
  'FR-M1-10 + M3.2. Single-transaction workbook import: idempotency + empty-workspace guards, tax settings, lists, deals (codes preserved), receivable auto-create + overlay, payments, and — NEW — the GCI Calculator TARGETS rows as plan_year_target records + seeded global funnel_rates. Engine-computed money is re-checked, never re-derived; any hard failure rolls the whole import back.';
