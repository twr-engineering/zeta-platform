-- M4.2 — Collections math: payments aggregation, balance, dates, idle/aging.
--
-- Module: M4 PRD §3.2 Rules L/M/P/Q, §4 rules 8/9/11/12/15; M4_Milestones § M4.2
--
-- The receivable now REACTS to M5 payment events. Rule L (collected = Σ payment
-- net_of_vat, commission AND incentive), Rule M (balance = total_collectible −
-- collected; pct = collected ÷ total_collectible, null at zero-collectible),
-- payment dates (first/last), and days_to_first_release (first − booking, negative
-- allowed — §4 rule 12 / D021 = −1) become live, centavo-exact, synchronous.
--
-- RE-AGGREGATION, NOT DELTAS (the idempotency choice). The m5_1 handoff sketched a
-- delta consumer (created +K, updated −old+new, deleted −old). We instead RE-
-- AGGREGATE each affected deal from its current payment rows on every event. This
-- is the same shape M4.1's consume_deal_events uses (absolute upsert from a
-- snapshot, never a delta) and it is idempotent + replay-safe BY CONSTRUCTION:
--   · re-running with the cursor at head → no new events → no-op;
--   · replaying from cursor 0 on a populated workspace → every deal re-aggregated
--     from its CURRENT payment rows → the identical state, never doubled;
--   · deleting the max-dated payment → MAX() re-finds the new last_payment_date
--     (a running delta cannot do this without re-reading the table anyway).
-- payment_event carries deal_id directly (m5_1 handoff), so no join through a
-- soft-deleted payment is needed.
--
-- TIMEZONE-SAFE "TODAY" LIVES IN THE APP, NOT IN SQL. months_idle and age_months
-- are the ONLY payment-derived fields that depend on "today", and no event fires as
-- the clock advances — so storing them would guarantee staleness the moment a day
-- passes. They are therefore computed AT READ TIME in the app (src/lib/receivables/
-- idle.ts, against Asia/Manila via the manila helper, clock-injectable for tests),
-- never in SQL. Every field THIS migration stores is today-INDEPENDENT, so the
-- consumer needs no "today" parameter and the injectable-clock rule is honoured by
-- construction (no now()/current_date anywhere in the math).
--
-- BALANCE IS SET FOR EVERY RECEIVABLE, NOT JUST PAID ONES. balance/pct/chase are
-- functions of total_collectible (from the deal) AND collected (from payments), so
-- BOTH consumers must recompute them: consume_deal_events (extended below) sets
-- balance = total_collectible − 0 for a brand-new / no-payment receivable and
-- restates it when a deal edit moves total_collectible; consume_payment_events sets
-- it when cash is logged. One shared routine keeps the two in lock-step.

-- ---------------------------------------------------------------------------
-- commission_private.recompute_receivable_payment_fields(deal_id) — the shared re-aggregation
-- ---------------------------------------------------------------------------
-- Re-aggregates the deal's non-archived payments and writes the today-INDEPENDENT
-- payment-derived columns (Rule L/M + dates + days_to_first_release + chase key).
-- Keyed by deal_id because both consumers know the deal, not the receivable id.
-- Absolute (never a delta), so calling it twice is a no-op — the idempotency
-- guarantee both cursors rely on. months_idle/age_months are deliberately NOT
-- touched here (today-dependent, computed at read — see the header).
create or replace function commission_private.recompute_receivable_payment_fields(p_deal_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rec commission.receivable;
  v_collected numeric(14, 2);
  v_last date;
  v_first date;
  v_balance numeric(14, 2);
  v_pct numeric(9, 6);
  v_days integer;
begin
  -- Lock the receivable so a concurrent recompute (two events, same deal) serialises.
  select * into v_rec from commission.receivable where deal_id = p_deal_id for update;
  if not found then
    -- No receivable yet (the deal consumer upserts it before calling us). Nothing
    -- to project onto — the next drain will pick it up.
    return;
  end if;

  -- Rule L — Collected (Net of VAT) = Σ payment.net_of_vat over the deal's
  -- non-archived payments, Commission AND Incentive alike (§4 rule 11). Each
  -- net_of_vat is a stored 2-dp figure, so the sum is exact 2-dp — no drift, and
  -- the PRD's "collected = Σ of stored payment values" precision policy holds.
  select coalesce(sum(net_of_vat), 0), max(payment_date), min(payment_date)
    into v_collected, v_last, v_first
  from commission.payment
  where deal_id = p_deal_id and archived_at is null;

  -- Rule M — balance = total_collectible − collected (may be negative and is stored
  -- signed: §4 rules 8/9, no clamp). pct = collected ÷ total_collectible, NULL when
  -- total_collectible = 0 (§4 rule 15 zero-collectible guard).
  v_balance := v_rec.total_collectible - v_collected;
  if v_rec.total_collectible = 0 then
    v_pct := null;
  else
    v_pct := round(v_collected / v_rec.total_collectible, 6);
  end if;

  -- days_to_first_release = first_payment_date − booking_date, in days. Negative
  -- when a release predates the booking (§4 rule 12 / D021 = −1); NULL if unpaid.
  if v_first is not null then
    v_days := v_first - v_rec.booking_date;
  else
    v_days := null;
  end if;

  update commission.receivable set
    collected_net = v_collected,
    last_payment_date = v_last,
    first_payment_date = v_first,
    balance = v_balance,
    pct_collected = v_pct,
    days_to_first_release = v_days,
    -- Rule Q primary key: largest balance first. The full ORDER BY
    -- (balance DESC, months_idle DESC NULLS LAST, deal_code) is the documented
    -- read-layer contract — months_idle is today-dependent, so the fine tiebreaker
    -- is applied live; this stored key backs the coarse DB-side sort / index.
    chase_priority = v_balance,
    updated_by = coalesce((select auth.uid()), updated_by)
  where deal_id = p_deal_id;
  -- version is intentionally NOT bumped: this is a system projection, not a user
  -- edit (same discipline as consume_deal_events' mirror restate). Bumping it would
  -- spuriously invalidate an in-flight override/note form's optimistic lock.
end;
$$;

comment on function commission_private.recompute_receivable_payment_fields is
  'M4.2 Rule L/M. Re-aggregates a deal''s non-archived payments and writes the today-independent payment-derived receivable columns (collected_net, balance, pct_collected, first/last payment date, days_to_first_release, chase_priority). Absolute (idempotent). months_idle/age_months are computed at read time. Called by consume_payment_events and consume_deal_events.';

-- Called by the two SECURITY INVOKER consumers, so the invoking authenticated user
-- needs EXECUTE (same convention as commission_private.assert_payment_split / commission_private.resolve_payment_deal).
grant execute on function commission_private.recompute_receivable_payment_fields(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chase projection index (Rule Q, the "indexed projection" deliverable)
-- ---------------------------------------------------------------------------
-- The chase list is open receivables, largest balance first (§ WORKBOOK 6.8).
-- chase_priority = balance, so this partial index serves the coarse ORDER BY the
-- M6 chase list and the aging views read; the read layer refines with the live
-- months_idle tiebreaker.
create index receivable_chase_idx
  on commission.receivable (workspace_id, chase_priority desc)
  where status = 'open' and archived_at is null;

-- ---------------------------------------------------------------------------
-- receivable_payment_cursor — M4's OWN cursor over the payment event log
-- ---------------------------------------------------------------------------
-- One row per workspace; distinct from receivable_event_cursor (which tracks
-- deal_event). (last_occurred_at, last_event_id) is the high-water mark over
-- commission.payment_event, ordered (occurred_at, id). '-infinity' start replays the
-- whole log; reset it and re-drain to re-project every deal identically (the
-- consumer is idempotent). Each consumer of payment_event keeps its own cursor
-- (m1_2 / m5_1 handoff) — no shared consumed stamp.
create table commission.receivable_payment_cursor (
  workspace_id uuid primary key references commission.workspace (id) on delete cascade,
  last_occurred_at timestamptz not null default '-infinity',
  last_event_id uuid,
  updated_at timestamptz not null default now()
);

comment on table commission.receivable_payment_cursor is
  'M4.2. The receivable consumer''s high-water mark over commission.payment_event, per workspace. Ordered by (occurred_at, id). Reset to defaults to replay; consume_payment_events is idempotent (re-aggregation) so a replay re-projects to the same state.';

alter table commission.receivable_payment_cursor enable row level security;

create policy "receivable_payment_cursor_select_member"
  on commission.receivable_payment_cursor for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "receivable_payment_cursor_insert_member"
  on commission.receivable_payment_cursor for insert
  to authenticated
  with check (commission_private.is_workspace_member(workspace_id));

create policy "receivable_payment_cursor_update_member"
  on commission.receivable_payment_cursor for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- commission.consume_payment_events — drain M4's payment cursor, restate receivables
-- ---------------------------------------------------------------------------
-- FR-M4-04. Reads payment events after the cursor in (occurred_at, id) order and
-- re-aggregates each referenced deal's receivable (Rule L/M + dates). Idempotent
-- (re-aggregation) + resumable (the cursor). Mirrors consume_deal_events exactly,
-- over payment_event instead of deal_event. Call in a loop until processed = 0.
create or replace function commission.consume_payment_events(p_limit integer default 500)
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
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := commission_private.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Load (or initialise) the cursor, locked so concurrent drains serialise on it.
  select last_occurred_at, last_event_id into v_last_at, v_last_id
  from commission.receivable_payment_cursor
  where workspace_id = v_ws
  for update;

  if not found then
    insert into commission.receivable_payment_cursor (workspace_id)
    values (v_ws)
    on conflict (workspace_id) do nothing;

    select last_occurred_at, last_event_id into v_last_at, v_last_id
    from commission.receivable_payment_cursor
    where workspace_id = v_ws
    for update;
  end if;

  for r in
    select e.id, e.occurred_at, e.deal_id
    from commission.payment_event e
    where e.workspace_id = v_ws
      and (
        e.occurred_at > v_last_at
        or (e.occurred_at = v_last_at and v_last_id is not null and e.id > v_last_id)
      )
    order by e.occurred_at, e.id
    limit greatest(p_limit, 1)
  loop
    -- created/updated/deleted all restate the same way: re-aggregate the deal's
    -- current payment rows. (deleted rows are archived, so they drop out of the
    -- sum; updated rows are already at their new values.)
    perform commission_private.recompute_receivable_payment_fields(r.deal_id);

    v_last_at := r.occurred_at;
    v_last_id := r.id;
    v_processed := v_processed + 1;
  end loop;

  if v_processed > 0 then
    update commission.receivable_payment_cursor
    set last_occurred_at = v_last_at,
        last_event_id = v_last_id,
        updated_at = now()
    where workspace_id = v_ws;
  end if;

  return jsonb_build_object('ok', true, 'processed', v_processed);
end;
$$;

comment on function commission.consume_payment_events is
  'FR-M4-04. Drains M4''s cursor over commission.payment_event, re-aggregating each referenced deal''s receivable (Rule L collected, Rule M balance/pct, payment dates, days_to_first_release). Idempotent (re-aggregation) and resumable (cursor). Call in a loop until processed = 0.';

revoke all on function commission.consume_payment_events(integer) from public;
grant execute on function commission.consume_payment_events(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- consume_deal_events — EXTENDED to recompute balance for every projection
-- ---------------------------------------------------------------------------
-- M4.1's consumer mirrored identity + Rule K anchors but left balance/pct at their
-- defaults (M4.2's job). We now recompute the payment-derived money after each
-- upsert, so:
--   · a brand-new / no-payment receivable gets balance = total_collectible − 0 and
--     chase_priority set (the 13 open-with-no-payment workbook rows need this — the
--     payment consumer never touches them, they have no payment events);
--   · a deal edit that moves total_collectible (referral/rate/price change, or a
--     bulk recompute) restates balance/pct/chase in the SAME drain (§4 rule 7).
-- The body is M4.1's verbatim plus the single `perform` — same signature, so this
-- CREATE OR REPLACE is additive and every caller (deal actions, recompute runner,
-- run_workbook_import) picks it up. Still idempotent + resumable (both the upsert
-- and the recompute are absolute).
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

    -- M4.2: restate balance/pct/chase/dates from the deal's current payments now
    -- that total_collectible is current (no-op re-aggregation if unpaid → collected
    -- 0, balance = total_collectible).
    perform commission_private.recompute_receivable_payment_fields(r.deal_id);

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
  'FR-M4-01/02/03 (+ M4.2). Drains M4''s cursor over commission.deal_event, upserting each deal''s receivable from the event snapshot (mirrors + Rule K anchors + archive; user inputs preserved) and recomputing the payment-derived money (balance/pct/chase/dates) so every receivable — paid or not — carries a live balance. Idempotent + resumable.';

revoke all on function commission.consume_deal_events(integer) from public;
grant execute on function commission.consume_deal_events(integer) to authenticated;
