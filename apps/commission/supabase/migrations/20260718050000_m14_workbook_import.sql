-- M1.4 — the one-time v30.x workbook importer: its idempotency ledger, the
-- receivable overlay, and the single-transaction orchestrator.
--
-- Module: M1 PRD §5 FR-M1-10, §4 rule 1 (permanent codes), Q26 (gaps preserved,
--         sequence continues after max, no reuse); M1_Milestones § M1.4;
--         M4.1 handoff (import_receivable_overlay contract); M5.1 handoff
--         (create_payment IS the bulk path).
--
-- WHAT THE IMPORTER IS. A migration of an existing agent's ZETA workbook into a
-- fresh workspace: its Settings/lists, its 21 closed deals (with the ORIGINAL
-- codes D001–D021 preserved), its 8 payments and its collectible statuses — in
-- ONE database transaction, so any leg's hard failure rolls the whole import
-- back and the workspace is never left half-migrated (M1_Milestones DoD).
--
-- THE ENGINE IS STILL THE APP'S (FR-M1-05). Exactly as create_deal/create_payment
-- do, the app computes every money figure with src/lib/engine (the single source
-- of money truth), reconciles each recomputed figure against the workbook's cached
-- value within ₱0.01, and passes the fully-derived rows in as one jsonb payload.
-- run_workbook_import is the SINGLE WRITER that persists them and re-checks only
-- the pure composition/split ties (Rule G/H, K+L=H) — it never re-derives tax math.
-- The reconciliation itself happens in the app BEFORE this is called for real: a
-- mismatch is REPORTED and the import refused, not written silently (FR-M1-10).
--
-- ONE TRANSACTION, REUSING THE LEG WRITERS. run_workbook_import is one
-- SECURITY INVOKER function, so everything it calls runs in its transaction:
-- it inserts deals (mirroring create_deal, but with the workbook's code instead
-- of a fresh sequence value), drains the receivable projection via
-- consume_deal_events, overlays statuses via import_receivable_overlay, and logs
-- payments via create_payment (the M5.1 un-gated bulk path). No new payment or
-- receivable writer is invented — the importer is trusted bulk over the existing
-- ones (m4_1 / m5_1 handoffs).
--
-- IDEMPOTENCY BY FILE HASH (FR-M1-10). import_batch records the SHA-256 of the
-- uploaded bytes per workspace (unique). A re-upload of the same file is refused
-- as a value ('already_imported'), never a second import. The workspace must also
-- be empty of deals: the importer PRESERVES codes, so it is an onboarding step on
-- a fresh book, not a merge into an existing one.

-- ---------------------------------------------------------------------------
-- import_batch — the idempotency ledger (FR-M1-10)
-- ---------------------------------------------------------------------------

create table commission.import_batch (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- SHA-256 (hex) of the uploaded workbook bytes. Unique per workspace: the same
  -- file cannot be imported twice (idempotent re-run per file hash).
  file_hash text not null,
  file_name text,

  -- The import summary (counts per leg + the reconciled anchors), for the
  -- history/audit and a re-upload's "already imported" message. Money inside is
  -- ::text strings, never JSON floats (Master PRD §4.3).
  summary jsonb not null default '{}'::jsonb,

  created_by uuid,
  created_at timestamptz not null default now(),

  constraint import_batch_file_hash_not_blank check (btrim(file_hash) <> ''),
  constraint import_batch_once_per_file unique (workspace_id, file_hash)
);

comment on table commission.import_batch is
  'M1.4 FR-M1-10. One row per successful workbook import, keyed by the file''s SHA-256 (unique per workspace) so a re-upload of the same file is refused. summary holds the per-leg counts and reconciled anchors (money as ::text).';

create index import_batch_workspace_idx on commission.import_batch (workspace_id, created_at desc);

alter table commission.import_batch enable row level security;

-- Tenant isolation is the RLS job (M0 rule 1). insert/update exist for the
-- SECURITY INVOKER run_workbook_import (it inserts the row up front to claim the
-- hash, then writes the summary at the end). No delete policy: an import record
-- is history.
create policy "import_batch_select_member"
  on commission.import_batch for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "import_batch_insert_member"
  on commission.import_batch for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "import_batch_update_member"
  on commission.import_batch for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- commission.import_receivable_overlay — the trusted, un-gated overlay (FR-M4-14)
-- ---------------------------------------------------------------------------
-- The importer OVERLAYS the workbook's collectible state onto the receivable the
-- deal-event consumer already auto-created (status, and — if the workbook carried
-- one — a Confirmed Collectible override + Next Action note). This is deliberately
-- NOT set_confirmed_collectible: that function's edge-case-17 friction gate
-- REQUIRES a note on every override, and a legacy workbook override may have none.
-- Import is trusted bulk, so it bypasses the gate; a note-less legacy override is
-- FLAGGED (legacy_note_missing) rather than rejected (m4_1 handoff). total_collectible
-- is a generated column, so we only ever set confirmed_collectible, never the total.
create or replace function commission.import_receivable_overlay(
  p_deal_id uuid,
  p_status commission.receivable_status,
  p_confirmed numeric,
  p_note text,
  p_legacy_note_missing boolean default false
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

  -- RLS makes another tenant's receivable invisible → not found. FOR UPDATE so
  -- the overlay serialises against any concurrent restatement.
  select * into v_before from commission.receivable where deal_id = p_deal_id for update;
  if not found then
    raise exception 'receivable not found for deal' using errcode = 'no_data_found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;
  if p_confirmed is not null and p_confirmed <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  update commission.receivable set
    status = p_status,
    confirmed_collectible = p_confirmed,
    -- A supplied note wins; otherwise keep whatever was there (a legacy note-less
    -- override leaves the note null and is flagged in the return, not rejected).
    next_action_note = coalesce(v_note, next_action_note),
    version = v_before.version + 1,
    updated_by = v_uid
  where deal_id = p_deal_id
  returning * into v_after;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', v_after.id, 'update',
    jsonb_build_object(
      'status', jsonb_build_object('old', v_before.status::text, 'new', v_after.status::text),
      'confirmed_collectible', jsonb_build_object(
        'old', case when v_before.confirmed_collectible is null then null
                    else to_jsonb(v_before.confirmed_collectible::text) end,
        'new', case when v_after.confirmed_collectible is null then null
                    else to_jsonb(v_after.confirmed_collectible::text) end),
      'next_action_note', jsonb_build_object(
        'old', to_jsonb(v_before.next_action_note), 'new', to_jsonb(v_after.next_action_note)),
      'legacy_note_missing', jsonb_build_object('old', null, 'new', to_jsonb(coalesce(p_legacy_note_missing, false)))
    )
  );

  return jsonb_build_object(
    'ok', true, 'id', v_after.id, 'deal_id', v_after.deal_id,
    'status', v_after.status::text,
    'confirmed_collectible',
      case when v_after.confirmed_collectible is null then null
           else v_after.confirmed_collectible::text end,
    'total_collectible', v_after.total_collectible::text,
    'legacy_note_missing', coalesce(p_legacy_note_missing, false) and v_note is null,
    'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.import_receivable_overlay is
  'FR-M4-14. Un-gated bulk overlay of the workbook''s collectible state onto an auto-created receivable (status + optional Confirmed Collectible override + Next Action note). Bypasses set_confirmed_collectible''s note gate; a note-less legacy override is flagged, not rejected. Only sets confirmed_collectible (total is generated). Audited.';

revoke all on function commission.import_receivable_overlay(uuid, commission.receivable_status, numeric, text, boolean) from public;
grant execute on function commission.import_receivable_overlay(uuid, commission.receivable_status, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.run_workbook_import — the single-transaction orchestrator (FR-M1-10)
-- ---------------------------------------------------------------------------
-- Takes the fully-parsed, engine-computed, app-reconciled workbook as one jsonb
-- payload and writes every leg in ONE transaction:
--   1. idempotency + empty-workspace guards; claim the file hash (import_batch)
--   2. tax settings (the workbook's global rules)
--   3. lists (property types / developers / lead sources — resolve-or-create,
--      case-insensitive; build the name→id map the deals leg resolves against)
--   4. deals (preserve the workbook code; verify Rule G/H; audit; emit
--      deal.created so the receivable auto-creates; advance the code sequence to
--      max so the next NEW deal is D022 — Q26)
--   5. consume_deal_events → the receivables exist
--   6. overlays (status / confirmed / note) via import_receivable_overlay
--   7. payments via create_payment (the M5.1 bulk path)
--   8. stamp the import_batch summary
-- Money throughout the payload is ::text strings, cast to numeric on the way into
-- the columns; the DB re-checks only the pure ties, trusting the engine's tax math.
create or replace function commission.run_workbook_import(p_payload jsonb)
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
  v_row commission.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_deal_id uuid;
  v_n integer;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := commission_private.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  if v_hash = '' then
    raise exception 'import payload missing file_hash' using errcode = '22023';
  end if;

  -- (1) Idempotency + empty-workspace guards (values, not exceptions, so the app
  -- can render a clear message rather than a 500).
  if exists (select 1 from commission.import_batch where workspace_id = v_ws and file_hash = v_hash) then
    return jsonb_build_object('ok', false, 'reason', 'already_imported');
  end if;
  if exists (select 1 from commission.deal where workspace_id = v_ws) then
    return jsonb_build_object('ok', false, 'reason', 'workspace_not_empty');
  end if;

  insert into commission.import_batch (workspace_id, file_hash, file_name, created_by)
  values (v_ws, v_hash, p_payload->>'file_name', v_uid)
  returning id into v_batch_id;

  -- (2) Tax settings — the workbook's global rules (VAT/EWT/threshold/chase +
  -- VAT-registration). Idempotent; on a fresh workspace these already match the
  -- signup defaults.
  if p_payload ? 'tax' then
    update commission.tax_settings set
      vat_rate = coalesce((p_payload->'tax'->>'vat_rate')::numeric, vat_rate),
      ewt_rate = coalesce((p_payload->'tax'->>'ewt_rate')::numeric, ewt_rate),
      property_vat_threshold = coalesce((p_payload->'tax'->>'property_vat_threshold')::numeric, property_vat_threshold),
      chase_idle_months = coalesce((p_payload->'tax'->>'chase_idle_months')::integer, chase_idle_months),
      vat_registered = coalesce((p_payload->'tax'->>'vat_registered')::boolean, vat_registered)
    where workspace_id = v_ws;
  end if;

  -- (3) Lists — resolve-or-create, case-insensitive (§ M0 rule 7 uniqueness).
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'property_types', '[]'::jsonb)) loop
    select id into v_pt_id from commission.property_type
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_pt_id is null then
      insert into commission.property_type (workspace_id, name, vat_rule, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), (v_item->>'vat_rule')::commission.property_vat_rule, v_uid, v_uid)
      returning id into v_pt_id;
      perform commission_private.write_audit_entry(v_ws, 'property_type', v_pt_id, 'create',
        jsonb_build_object(
          'name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name')),
          'vat_rule', jsonb_build_object('old', null, 'new', v_item->>'vat_rule')));
      v_pt_created := v_pt_created + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'developers', '[]'::jsonb)) loop
    select id into v_dev_id from commission.developer
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_dev_id is null then
      insert into commission.developer (workspace_id, name, comm_base, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), coalesce((v_item->>'comm_base')::commission.developer_comm_base, 'net'), v_uid, v_uid)
      returning id into v_dev_id;
      perform commission_private.write_audit_entry(v_ws, 'developer', v_dev_id, 'create',
        jsonb_build_object(
          'name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name')),
          'comm_base', jsonb_build_object('old', null, 'new', coalesce(v_item->>'comm_base', 'net'))));
      v_dev_created := v_dev_created + 1;
    end if;
  end loop;

  v_next_order := coalesce((select max(sort_order) from commission.lead_source where workspace_id = v_ws), 0);
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'lead_sources', '[]'::jsonb)) loop
    select id into v_ls_id from commission.lead_source
      where workspace_id = v_ws and lower(name) = lower(btrim(v_item->>'name')) limit 1;
    if v_ls_id is null then
      v_next_order := v_next_order + 1;
      insert into commission.lead_source (workspace_id, name, sort_order, created_by, updated_by)
      values (v_ws, btrim(v_item->>'name'), v_next_order, v_uid, v_uid)
      returning id into v_ls_id;
      perform commission_private.write_audit_entry(v_ws, 'lead_source', v_ls_id, 'create',
        jsonb_build_object('name', jsonb_build_object('old', null, 'new', btrim(v_item->>'name'))));
      v_ls_created := v_ls_created + 1;
    end if;
  end loop;

  -- (4) Deals — preserve the workbook code, mirror create_deal's write.
  for v_deal in select value from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) loop
    v_derived := v_deal->'derived';
    v_code := btrim(v_deal->>'deal_code');

    -- Resolve the list FKs by name against what we just ensured exists.
    select id into v_pt_id from commission.property_type
      where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'property_type_name')) limit 1;
    if v_pt_id is null then
      raise exception 'import: property type % not found for %', v_deal->>'property_type_name', v_code
        using errcode = 'foreign_key_violation';
    end if;

    v_dev_id := null;
    if nullif(btrim(coalesce(v_deal->>'developer_name', '')), '') is not null then
      select id into v_dev_id from commission.developer
        where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'developer_name')) limit 1;
      if v_dev_id is null then
        raise exception 'import: developer % not found for %', v_deal->>'developer_name', v_code
          using errcode = 'foreign_key_violation';
      end if;
    end if;

    select id into v_ls_id from commission.lead_source
      where workspace_id = v_ws and lower(name) = lower(btrim(v_deal->>'lead_source_name')) limit 1;
    if v_ls_id is null then
      raise exception 'import: lead source % not found for %', v_deal->>'lead_source_name', v_code
        using errcode = 'foreign_key_violation';
    end if;

    -- The pure composition ties (Rule G/H), same backstop as create_deal.
    perform commission_private.assert_deal_composition(
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
      default_total_collectible, created_by, updated_by
    )
    values (
      v_ws, v_code,
      (v_deal->>'booked_date')::date,
      (v_deal->>'transaction_type')::commission.deal_transaction_type,
      (v_deal->>'deal_type')::commission.deal_type,
      v_dev_id,
      v_deal->>'client_name',
      (v_deal->>'representation')::commission.deal_representation,
      v_pt_id, v_ls_id,
      v_deal->>'property_details',
      (v_deal->>'mode_of_payment')::commission.deal_mode_of_payment,
      (v_deal->>'list_price')::numeric,
      coalesce((v_deal->>'force_vat')::boolean, false),
      (v_deal->>'commission_basis')::commission.deal_commission_basis,
      v_deal->>'rate_pct',
      case when v_deal->>'fixed_amount' is null then null else (v_deal->>'fixed_amount')::numeric end,
      v_receipt,
      coalesce((v_deal->>'incentive_billed')::numeric, 0),
      case when v_deal->>'incentive_taxable' is null then null else (v_deal->>'incentive_taxable')::commission.deal_incentive_taxable end,
      coalesce((v_deal->>'referral_out_pct')::numeric, 0),
      coalesce((v_deal->>'referral_out_fixed')::numeric, 0),
      coalesce((v_deal->>'referral_paid')::boolean, false),
      (v_derived->>'property_vat')::commission.deal_property_vat,
      (v_derived->>'net_list_price')::numeric,
      (v_derived->>'comm_base')::commission.deal_comm_base_display,
      (v_derived->>'vat_basis')::commission.deal_vat_basis,
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

    v_changes := commission_private.deal_created_changes(v_row);
    v_audit_id := commission_private.write_audit_entry(v_ws, 'deal', v_row.id, 'create', v_changes);

    insert into commission.deal_event (
      workspace_id, actor_user_id, deal_id, deal_code, event_type,
      old_values, new_values, field_changes, audit_entry_id
    )
    values (
      v_ws, v_uid, v_row.id, v_row.deal_code, 'created',
      null, commission_private.deal_snapshot(v_row), '{}'::jsonb, v_audit_id
    );

    -- Track the highest numeric suffix so the sequence continues after the max
    -- imported code (Q26): D001–D021 → next NEW deal is D022. Gaps stay gaps
    -- (a skipped code is simply never created and never backfilled).
    v_suffix := nullif(regexp_replace(v_code, '^\D+', ''), '')::integer;
    if v_suffix is not null and v_suffix > v_max_suffix then
      v_max_suffix := v_suffix;
    end if;

    v_deals_created := v_deals_created + 1;
  end loop;

  -- Advance the permanent-code sequence to the max imported suffix (never lower).
  if v_max_suffix > 0 then
    update commission.workspace
    set deal_id_sequence = greatest(deal_id_sequence, v_max_suffix)
    where id = v_ws;
  end if;

  -- (5) Project the deal.created events onto receivables (auto-create).
  loop
    select coalesce((commission.consume_deal_events(500)->>'processed')::integer, 0) into v_n;
    exit when v_n = 0;
  end loop;

  -- (6) Overlays — status / confirmed / note onto the auto-created receivables.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'overlays', '[]'::jsonb)) loop
    select id into v_deal_id from commission.deal
      where workspace_id = v_ws and deal_code = btrim(v_item->>'deal_code');
    if v_deal_id is not null then
      perform commission.import_receivable_overlay(
        v_deal_id,
        (v_item->>'status')::commission.receivable_status,
        case when v_item->>'confirmed' is null then null else (v_item->>'confirmed')::numeric end,
        v_item->>'note',
        coalesce((v_item->>'legacy_note_missing')::boolean, false)
      );
      v_overlays_applied := v_overlays_applied + 1;
    end if;
  end loop;

  -- (7) Payments — the M5.1 un-gated bulk path (create_payment per row). The
  -- split is the engine's, computed and reconciled in the app; create_payment
  -- re-checks the pure ties (K+L=H, N=H−M) and emits payment.created for M4.2.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'payments', '[]'::jsonb)) loop
    select id into v_deal_id from commission.deal
      where workspace_id = v_ws and deal_code = btrim(v_item->>'deal_code');
    if v_deal_id is null then
      raise exception 'import: payment references unknown deal %', v_item->>'deal_code'
        using errcode = 'foreign_key_violation';
    end if;
    perform commission.create_payment(
      v_deal_id,
      (v_item->>'payment_date')::date,
      (v_item->>'gross_amount')::numeric,
      (v_item->>'payment_type')::commission.payment_type,
      v_item->>'reference_note',
      (v_item->'split'->>'net_of_vat')::numeric,
      (v_item->'split'->>'vat')::numeric,
      (v_item->'split'->>'ewt')::numeric,
      (v_item->'split'->>'net_cash')::numeric,
      (v_item->'split'->>'retained')::numeric,
      (v_item->>'vat_basis_used')::commission.deal_vat_basis,
      (v_item->>'ewt_rate_used')::numeric,
      (v_item->>'vat_rate_used')::numeric
    );
    v_payments_created := v_payments_created + 1;
  end loop;

  -- (8) Stamp the summary onto the batch. The app passes its reconciled anchors
  -- through so the record carries the ₱ figures that were verified.
  v_summary := jsonb_build_object(
    'property_types_created', v_pt_created,
    'developers_created', v_dev_created,
    'lead_sources_created', v_ls_created,
    'deals_created', v_deals_created,
    'overlays_applied', v_overlays_applied,
    'payments_created', v_payments_created,
    'next_deal_code', 'D' || lpad((v_max_suffix + 1)::text, 3, '0'),
    'anchors', coalesce(p_payload->'anchors', '{}'::jsonb)
  );

  update commission.import_batch set summary = v_summary where id = v_batch_id;

  return jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'summary', v_summary);
end;
$$;

comment on function commission.run_workbook_import is
  'FR-M1-10. Single-transaction workbook import: idempotency (file hash) + empty-workspace guards, tax settings, lists (resolve-or-create), deals (codes preserved, sequence advanced to max — Q26), receivable auto-create + overlay, payments via create_payment. Engine-computed money is passed in and re-checked (Rule G/H, K+L=H), never re-derived. Any hard failure rolls the whole import back.';

revoke all on function commission.run_workbook_import(jsonb) from public;
grant execute on function commission.run_workbook_import(jsonb) to authenticated;
