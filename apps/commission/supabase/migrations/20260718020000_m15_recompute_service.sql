-- M1.5 — the recompute service.
--
-- Module: M1 PRD §4 rule 3 (recompute-on-settings-change), FR-M1-07 (bulk
--         recompute with progress + audit), §8 (perf); M1_Milestones § M1.5
--
-- WHAT THIS TURNS ON. M0.2 shipped settings_change_event as a durable, single-
-- consumption queue and left one function, countAffectedDeals(), returning 0
-- because no deals existed. M1.2 built the deals. This migration is the consumer
-- M0.2 promised: given a confirmed settings/developer/property-type change, it
-- re-runs the M1.1 engine over exactly the deals that change and persists the
-- new figures through the SAME single-writer discipline as every other mutation
-- — one database function per write, the change + its field-level audit entry +
-- its deal.updated event all in one transaction.
--
-- THE ENGINE STILL RUNS IN THE APP (FR-M1-05). Reproducing Rules A–J in SQL
-- would be a second, divergent source of money truth. So the app reads the
-- affected deals (next_recompute_deals), calls computeDeal() per deal, and hands
-- the derived figures back to apply_recompute_batch, which is the single writer.
-- Rules G/H composition is re-checked here exactly as create_deal/update_deal do.
--
-- RESUMABLE + RETRY-SAFE by construction: a recompute_job row carries progress
-- and a cursor (last_deal_id); a batch either commits (cursor advances) or rolls
-- back (it does not). Re-running drains from the last committed cursor; a deal
-- whose figures already match diffs to nothing and is a no-op (no second event).
-- Completion stamps settings_change_event.consumed_at ONCE — the M0.2 trigger
-- makes a second stamp impossible, so a double-drain cannot double-restate.

-- ---------------------------------------------------------------------------
-- Source links — every restated deal points back to the settings change (rule 12)
-- ---------------------------------------------------------------------------

-- Bare uuid, FK-free, for the same reason deal_event.actor_user_id and
-- audit_log_entry.actor_user_id are: these tables are append-only history, and
-- an FK with ON DELETE CASCADE would let deleting the settings change erase the
-- deal history it caused, while SET NULL is an UPDATE the append-only triggers
-- reject. The pointer is enough to answer "why did this figure move?".
alter table commission.deal_event
  add column if not exists settings_change_event_id uuid;
comment on column commission.deal_event.settings_change_event_id is
  'M1.5: set on a deal.updated event produced by a bulk recompute — the settings_change_event that caused the restatement. NULL for ordinary edits. FK-free (append-only history, same as actor_user_id).';

alter table commission.audit_log_entry
  add column if not exists settings_change_event_id uuid;
comment on column commission.audit_log_entry.settings_change_event_id is
  'M1.5: set on a per-deal audit entry written by a bulk recompute — links the field-level restatement to the settings change that caused it. NULL for ordinary edits.';

-- The sourced audit writer. Sibling of commission_private.write_audit_entry (which stays the
-- 5-arg writer every existing mutation uses); this one carries the source link
-- so a restatement's trail says what caused it. Actor pinned to auth.uid() the
-- same way — never a parameter.
create or replace function commission_private.write_sourced_audit_entry(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action commission.audit_action,
  p_field_changes jsonb,
  p_settings_change_event_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into commission.audit_log_entry (
    workspace_id, actor_user_id, entity_type, entity_id, action,
    field_changes, settings_change_event_id
  )
  values (
    p_workspace_id, (select auth.uid()), p_entity_type, p_entity_id, p_action,
    coalesce(p_field_changes, '{}'::jsonb), p_settings_change_event_id
  )
  returning id;
$$;

comment on function commission_private.write_sourced_audit_entry is
  'M1.5. Like commission_private.write_audit_entry but records settings_change_event_id — the cause of a restatement. Actor pinned to auth.uid(). Called from inside apply_recompute_batch.';

-- ---------------------------------------------------------------------------
-- commission_private.affected_deals — the restatement matrix, in one place (rule 3)
-- ---------------------------------------------------------------------------

-- WHICH deals a settings change restates. The single source of this predicate:
-- count_affected_deals (the honest confirmation count) and next_recompute_deals
-- (the job's work list) both read it, so the number the agent is shown and the
-- set actually recomputed can never drift.
--
--   tax_settings, {vat_rate|ewt_rate|vat_registered}  → every taxable deal
--       (engine: taxable = developer OR receipted; these fields move GCI / VAT /
--        EWT on exactly those deals — an untaxed resale never has a memo to move)
--   tax_settings, {property_vat_threshold}            → developer deals whose
--       property type uses the threshold rule and are not force-VAT'd (only they
--       can flip VAT-able ⇄ exempt when the boundary moves)
--   developer  (comm_base)                            → that developer's deals
--   property_type (vat_rule)                          → that type's deals
--
-- SECURITY INVOKER: reads commission.deal under the caller's RLS, so it is workspace-
-- scoped without a workspace_id parameter (M0 rule 1). Archived deals are
-- INCLUDED: an archived deal still references the setting and its stored figures
-- would otherwise go stale (and the list "used by N deals" count, which the
-- confirmation reuses, counts them too) — this keeps the shown count and the
-- recomputed set identical. A deal in the set whose figures do not actually move
-- (e.g. a resale deal under a re-VAT-ruled type) diffs to nothing downstream and
-- costs one no-op.
create or replace function commission_private.affected_deals(
  p_entity_type text,
  p_entity_id uuid,
  p_fields text[]
)
returns setof commission.deal
language sql
stable
security invoker
set search_path = ''
as $$
  select d.*
  from commission.deal d
  left join commission.property_type pt on pt.id = d.property_type_id
  where case p_entity_type
    when 'developer' then d.developer_id = p_entity_id
    when 'property_type' then d.property_type_id = p_entity_id
    when 'tax_settings' then (
      ((p_fields && array['vat_rate', 'ewt_rate', 'vat_registered']) and d.taxable)
      or (
        'property_vat_threshold' = any(p_fields)
        and d.deal_type = 'developer'
        and not d.force_vat
        and pt.vat_rule = 'threshold'
      )
    )
    else false
  end
$$;

comment on function commission_private.affected_deals is
  'M1.5 rule 3 restatement matrix. The deals a settings change restates, workspace-scoped by RLS. Read by count_affected_deals (confirmation copy) and next_recompute_deals (the job); one predicate, so shown count == recomputed set.';

-- ---------------------------------------------------------------------------
-- commission.count_affected_deals — the honest confirmation count (M0.2's stub, real)
-- ---------------------------------------------------------------------------

-- The one function M0.2 named: how many deals a settings change restates. Now
-- real. The app calls it to render the consequence line ("This will recompute N
-- deals…") and again to stamp the count onto the emitted event, so the trail
-- records what the agent was actually told.
create or replace function commission.count_affected_deals(
  p_entity_type text,
  p_entity_id uuid,
  p_fields text[]
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from commission_private.affected_deals(p_entity_type, p_entity_id, p_fields)
$$;

comment on function commission.count_affected_deals is
  'M1.5. Deals a settings change restates (commission_private.affected_deals count), RLS-scoped. Feeds the recompute confirmation copy and the emitted settings_change_event.affected_deal_count.';

revoke all on function commission.count_affected_deals(text, uuid, text[]) from public;
grant execute on function commission.count_affected_deals(text, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- recompute_job — progress + resumable cursor (FR-M1-07)
-- ---------------------------------------------------------------------------

-- One job per settings_change_event (the unique constraint enforces it), so
-- starting a recompute is idempotent and the queue's single-consumption is
-- mirrored here. The job is the durable record of a bulk restatement in flight:
-- total (for the progress bar), processed/restated counters, and last_deal_id
-- (the resume cursor). Monolith-first (Master PRD §6): no external queue — the
-- app drives batches and this row is the state between them.
create table commission.recompute_job (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,
  settings_change_event_id uuid not null
    references commission.settings_change_event (id) on delete cascade,

  -- Copied from the event at start so a batch never has to re-read (and re-parse)
  -- the event's field_changes to know its work list.
  entity_type text not null,
  entity_id uuid,
  fields text[] not null default '{}',

  status text not null default 'pending',

  total_deals integer not null default 0,
  processed_deals integer not null default 0,
  restated_deals integer not null default 0,
  last_deal_id uuid,               -- resume cursor; null = start from the beginning
  error text,

  started_by uuid,                 -- FK-free actor (v2-ready), like the trail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recompute_job_status check (status in ('pending', 'running', 'completed', 'failed')),
  constraint recompute_job_counts_non_negative
    check (total_deals >= 0 and processed_deals >= 0 and restated_deals >= 0),
  constraint recompute_job_one_per_event unique (settings_change_event_id)
);

comment on table commission.recompute_job is
  'FR-M1-07. A bulk recompute in flight: progress counters + a resume cursor (last_deal_id). One per settings_change_event. Written only through start/apply/complete/fail_recompute_job.';

-- The pending/running work queue (resume finds these); completed jobs are history.
create index recompute_job_active_idx
  on commission.recompute_job (workspace_id, created_at)
  where status in ('pending', 'running');

alter table commission.recompute_job enable row level security;

-- Reads for the progress UI; writes go through SECURITY INVOKER functions, so
-- RLS still governs but the shapes stay controlled.
create policy "recompute_job_select_member"
  on commission.recompute_job for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "recompute_job_insert_member"
  on commission.recompute_job for insert
  to authenticated
  with check (commission_private.is_workspace_member(workspace_id));

create policy "recompute_job_update_member"
  on commission.recompute_job for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- keep updated_at honest
create or replace function commission_private.touch_recompute_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recompute_job_touch
  before update on commission.recompute_job
  for each row execute function commission_private.touch_recompute_job();

-- ---------------------------------------------------------------------------
-- commission.start_recompute_job — create (or find) the job for an event
-- ---------------------------------------------------------------------------

-- Idempotent: an already-consumed event returns done; an event that already has
-- a job returns that job (resume). Otherwise it sizes the work (count over the
-- affected set) and inserts a pending job. Never runs a batch itself — the app
-- drives those, so the action that changed the settings returns promptly.
create or replace function commission.start_recompute_job(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_event commission.settings_change_event;
  v_job commission.recompute_job;
  v_fields text[];
  v_total integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- RLS scopes this to the caller's workspace; a cross-tenant id is simply not
  -- found.
  select * into v_event from commission.settings_change_event where id = p_event_id;
  if not found then
    raise exception 'settings change event not found' using errcode = 'no_data_found';
  end if;

  if v_event.consumed_at is not null then
    return jsonb_build_object('ok', true, 'status', 'already_consumed', 'event_id', v_event.id);
  end if;

  select * into v_job from commission.recompute_job
  where settings_change_event_id = p_event_id;
  if found then
    return jsonb_build_object(
      'ok', true, 'status', v_job.status, 'job_id', v_job.id,
      'total', v_job.total_deals, 'processed', v_job.processed_deals,
      'restated', v_job.restated_deals
    );
  end if;

  v_fields := array(select jsonb_object_keys(v_event.field_changes));
  v_total := commission.count_affected_deals(v_event.entity_type, v_event.entity_id, v_fields);

  insert into commission.recompute_job (
    workspace_id, settings_change_event_id, entity_type, entity_id, fields,
    status, total_deals, started_by
  )
  values (
    v_event.workspace_id, v_event.id, v_event.entity_type, v_event.entity_id, v_fields,
    'pending', v_total, v_uid
  )
  returning * into v_job;

  return jsonb_build_object(
    'ok', true, 'status', v_job.status, 'job_id', v_job.id,
    'total', v_job.total_deals, 'processed', 0, 'restated', 0
  );
end;
$$;

comment on function commission.start_recompute_job is
  'FR-M1-07. Creates (or returns) the recompute job for a settings_change_event. Idempotent: a consumed event is done, an existing job is returned for resume. Sizes the work; does not run batches.';

revoke all on function commission.start_recompute_job(uuid) from public;
grant execute on function commission.start_recompute_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.next_recompute_deals — the next batch's work, money as ::text
-- ---------------------------------------------------------------------------

-- The job's affected deals after the cursor, ordered by id, limited. Returns the
-- engine INPUT columns (not the snapshot — that omits rate_pct/incentive/
-- referral) plus the resolved refs (property vat_rule, developer comm_base) and
-- the current version, as a jsonb array. Money is ::text so the app parses exact
-- decimals, never JSON floats (Master PRD §4.3). The app computes each deal with
-- computeDeal() and hands the results to apply_recompute_batch.
create or replace function commission.next_recompute_deals(
  p_job_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job commission.recompute_job;
  v_result jsonb;
begin
  select * into v_job from commission.recompute_job where id = p_job_id;
  if not found then
    raise exception 'recompute job not found' using errcode = 'no_data_found';
  end if;

  select coalesce(jsonb_agg(row order by row_id), '[]'::jsonb)
  into v_result
  from (
    select
      d.id as row_id,
      jsonb_build_object(
        'id', d.id,
        'version', d.version,
        'deal_type', d.deal_type::text,
        'transaction_type', d.transaction_type::text,
        'representation', d.representation::text,
        'force_vat', d.force_vat,
        'receipt_issued', d.receipt_issued,
        'commission_basis', d.commission_basis::text,
        'list_price', d.list_price::text,
        'rate_pct', d.rate_pct,
        'fixed_amount', case when d.fixed_amount is null then null else d.fixed_amount::text end,
        'incentive_billed', d.incentive_billed::text,
        'incentive_taxable', d.incentive_taxable::text,
        'referral_out_pct', d.referral_out_pct::text,
        'referral_out_fixed', d.referral_out_fixed::text,
        'property_vat_rule', pt.vat_rule::text,
        'developer_comm_base', dev.comm_base::text
      ) as row
    from commission_private.affected_deals(v_job.entity_type, v_job.entity_id, v_job.fields) d
    join commission.property_type pt on pt.id = d.property_type_id
    left join commission.developer dev on dev.id = d.developer_id
    where v_job.last_deal_id is null or d.id > v_job.last_deal_id
    order by d.id
    limit greatest(p_limit, 1)
  ) batch;

  return v_result;
end;
$$;

comment on function commission.next_recompute_deals is
  'FR-M1-07. The job''s next affected deals after the cursor (id order), as a jsonb array of engine inputs + resolved refs, money ::text. The app runs computeDeal() over these.';

revoke all on function commission.next_recompute_deals(uuid, integer) from public;
grant execute on function commission.next_recompute_deals(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.apply_recompute_batch — the single writer for a batch (FR-M1-07)
-- ---------------------------------------------------------------------------

-- Persists a batch of engine results: for each deal, lock it, re-check Rule G/H,
-- diff the would-be row against the current one, and — only if something moved —
-- bump the version, update the derived columns, write a sourced audit entry, and
-- emit a deal.updated event with old+new snapshots. A deal whose version moved
-- under us is SKIPPED (an intervening edit already recomputed it with the new
-- settings); a deal that did not move is a silent no-op. The job's progress and
-- resume cursor advance atomically with the writes.
--
-- p_results: [ { id, expected_version, property_vat, net_list_price, comm_base,
--   vat_basis, billed_commission, gci_net_of_vat, incentive_net, referral_out,
--   net_gci, vat_memo, ewt_memo, yield_on_list, taxable }, … ] — money as strings.
create or replace function commission.apply_recompute_batch(
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
  v_job commission.recompute_job;
  v_event_id uuid;
  r jsonb;
  v_before commission.deal;
  v_after commission.deal;
  v_changes jsonb;
  v_audit_id uuid;
  v_processed integer := 0;
  v_restated integer := 0;
  v_max_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_job from commission.recompute_job where id = p_job_id for update;
  if not found then
    raise exception 'recompute job not found' using errcode = 'no_data_found';
  end if;
  v_event_id := v_job.settings_change_event_id;

  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    v_processed := v_processed + 1;
    v_max_id := (r->>'id')::uuid;

    select * into v_before from commission.deal where id = (r->>'id')::uuid for update;
    -- Gone or moved since we read it: skip. An intervening edit used the new
    -- settings, so the deal is already correct; forcing our stale figures would
    -- be the bug. The cursor still advances past it (id order).
    if not found or v_before.version <> (r->>'expected_version')::integer then
      continue;
    end if;

    -- Same invariant the app-facing writers enforce (Rules G/H are addition).
    perform commission_private.assert_deal_composition(
      v_before.billed_commission,
      (r->>'gci_net_of_vat')::numeric,
      (r->>'incentive_net')::numeric,
      (r->>'referral_out')::numeric,
      v_before.referral_out_pct,
      v_before.referral_out_fixed,
      (r->>'net_gci')::numeric
    );

    -- Only the engine's derived fields move in a recompute; inputs are untouched.
    v_after := v_before;
    v_after.property_vat := (r->>'property_vat')::commission.deal_property_vat;
    v_after.net_list_price := (r->>'net_list_price')::numeric;
    v_after.comm_base := (r->>'comm_base')::commission.deal_comm_base_display;
    v_after.vat_basis := (r->>'vat_basis')::commission.deal_vat_basis;
    v_after.billed_commission := (r->>'billed_commission')::numeric;
    v_after.gci_net_of_vat := (r->>'gci_net_of_vat')::numeric;
    v_after.incentive_net := (r->>'incentive_net')::numeric;
    v_after.referral_out := (r->>'referral_out')::numeric;
    v_after.net_gci := (r->>'net_gci')::numeric;
    v_after.vat_memo := (r->>'vat_memo')::numeric;
    v_after.ewt_memo := (r->>'ewt_memo')::numeric;
    v_after.yield_on_list := (r->>'yield_on_list')::numeric;
    v_after.taxable := (r->>'taxable')::boolean;

    v_changes := commission_private.jsonb_diff(commission_private.deal_audit_row(v_before), commission_private.deal_audit_row(v_after));

    -- Nothing moved: no write, no version bump, no audit, no event. This is what
    -- makes a re-run idempotent and what keeps a deal that happens to be in the
    -- candidate set but unaffected (a resale under a re-VAT-ruled type) untouched.
    if v_changes = '{}'::jsonb then
      continue;
    end if;

    v_after.version := v_before.version + 1;

    update commission.deal set
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
      version = v_after.version,
      updated_by = v_uid
    where id = v_before.id
    returning * into v_after;

    v_audit_id := commission_private.write_sourced_audit_entry(
      v_before.workspace_id, 'deal', v_after.id, 'update', v_changes, v_event_id
    );

    -- FR-M1-08: a deal.updated event with BOTH snapshots + the diff, tagged with
    -- the settings change that caused it. M4 restates the receivable's booked
    -- figures against the OLD snapshot; M2 moves segment aggregates.
    insert into commission.deal_event (
      workspace_id, actor_user_id, deal_id, deal_code, event_type,
      old_values, new_values, field_changes, audit_entry_id, settings_change_event_id
    )
    values (
      v_before.workspace_id, v_uid, v_after.id, v_after.deal_code, 'updated',
      commission_private.deal_snapshot(v_before), commission_private.deal_snapshot(v_after), v_changes, v_audit_id, v_event_id
    );

    v_restated := v_restated + 1;
  end loop;

  update commission.recompute_job set
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

comment on function commission.apply_recompute_batch is
  'FR-M1-07. Single writer for a recompute batch: per deal, re-check Rule G/H, diff, and on change persist derived figures + a sourced audit entry + a deal.updated event. Skips version-moved deals; no-ops unchanged ones. Advances the job cursor atomically.';

revoke all on function commission.apply_recompute_batch(uuid, jsonb) from public;
grant execute on function commission.apply_recompute_batch(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.complete_recompute_job — finish + consume the event ONCE
-- ---------------------------------------------------------------------------

-- Marks the job completed and stamps the event consumed (single-consumption).
-- The `where consumed_at is null` guard means a re-run is a no-op rather than
-- tripping the M0.2 trigger that forbids re-consuming.
create or replace function commission.complete_recompute_job(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job commission.recompute_job;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_job from commission.recompute_job where id = p_job_id for update;
  if not found then
    raise exception 'recompute job not found' using errcode = 'no_data_found';
  end if;

  if v_job.status <> 'completed' then
    update commission.recompute_job set status = 'completed', error = null
    where id = p_job_id
    returning * into v_job;
  end if;

  -- One-way consumption. Guarded so completing an already-consumed event's job
  -- (a resume after the stamp landed) does not trip the append-only trigger.
  update commission.settings_change_event
  set consumed_at = now(), consumed_by = v_uid::text
  where id = v_job.settings_change_event_id and consumed_at is null;

  return jsonb_build_object(
    'ok', true, 'status', 'completed', 'job_id', v_job.id,
    'total', v_job.total_deals, 'processed', v_job.processed_deals,
    'restated', v_job.restated_deals
  );
end;
$$;

comment on function commission.complete_recompute_job is
  'FR-M1-07. Completes the job and stamps settings_change_event.consumed_at once (guarded, so a re-run is a no-op). After this the event leaves the pending queue.';

revoke all on function commission.complete_recompute_job(uuid) from public;
grant execute on function commission.complete_recompute_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.fail_recompute_job — record an unrecoverable error (still resumable)
-- ---------------------------------------------------------------------------

-- A recompute that hit an error the app cannot retry marks the job failed with a
-- message. The event is NOT consumed, so it stays in the pending queue and a
-- later resume (start_recompute_job returns this same job) can finish it.
create or replace function commission.fail_recompute_job(p_job_id uuid, p_error text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job commission.recompute_job;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update commission.recompute_job
  set status = 'failed', error = left(coalesce(p_error, 'unknown error'), 500)
  where id = p_job_id
  returning * into v_job;

  if not found then
    raise exception 'recompute job not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('ok', true, 'status', 'failed', 'job_id', v_job.id);
end;
$$;

comment on function commission.fail_recompute_job is
  'FR-M1-07. Marks a job failed with a message. The event stays unconsumed (pending), so a resume can still finish it.';

revoke all on function commission.fail_recompute_job(uuid, text) from public;
grant execute on function commission.fail_recompute_job(uuid, text) to authenticated;
