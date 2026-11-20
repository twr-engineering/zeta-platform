-- M2.2 — Materialized yield aggregates & event-driven restatement.
--
-- Module: M2 PRD §3.5 (yield_aggregate shape), §3.4 (basis_version), §4 rules
--         6/9/10/13, §8 (≤2 s restatement, zero-drift reconciliation);
--         M2_Milestones § M2.2
--
-- M2 is a PURE READ MODEL over M1 deals. This migration is the persistence
-- substrate the PlanningBasis API (M2.3) and the Yield Summary screen (M2.4) read:
--   · yield_aggregate — one materialized row per (workspace, segment, booked_year)
--     with {deal_count, volume_sum, gci_sum, incentive_net_sum, referral_out_sum}
--     (PRD §3.5). Report reads become O(segments × years) instead of 1,000-row scans.
--   · yield_event_cursor — M2's OWN high-water mark over public.deal_event (M2 keeps
--     its own cursor, exactly like M4's receivable_event_cursor; there is no shared
--     consumed stamp — m1_2 handoff).
--   · yield_basis_version — the per-workspace monotonic counter M3 caches against,
--     bumped whenever a SALES-segment (Resale/Developer) cell actually changes (§3.4).
--   · consume_yield_events — the drain: for each deal event, recompute the affected
--     (segment, year) cells from the CURRENT deal rows.
--   · reconcile_yield_aggregate — the on-demand drift check (FR-M2-10): recompute
--     every cell from raw deals and report any divergence from the materialized rows.
--
-- RE-AGGREGATION PER AFFECTED CELL, NOT −old/+new DELTAS (the idempotency choice).
-- PRD §3.5 describes the maintenance as "−old, +new". M4.2 faced the identical
-- decision for collected/balance and chose ABSOLUTE re-aggregation over deltas for
-- idempotency; we make the same call here, deliberately, for the same reason:
--   · A deal edit can change segment, year AND amounts at once. We read the OLD
--     (segment, year) from the event's old_values snapshot and the NEW from
--     new_values, then RECOMPUTE each affected cell from scratch over the live deal
--     table (archived excluded). A move Resale→Developer, or 2026→2027, cleans the
--     old cell and fills the new one — no partial-delta bookkeeping.
--   · It is idempotent + replay-safe BY CONSTRUCTION: re-draining with the cursor at
--     head is a no-op (no new events); replaying from cursor 0 recomputes every cell
--     from its CURRENT deals → the identical state, never doubled. A running −old/+new
--     delta double-applies on any replay unless the table is first zeroed — the exact
--     trap M4.2 documented. Every deal that ever existed emitted a `created` event, so
--     every cell that ever held a deal is revisited on a full replay and converges
--     (empty cells are deleted), matching M4.2's guarantee.
--   · The cell recompute sums the STORED 2-dp deal columns (list_price, net_gci,
--     incentive_net, referral_out) — M2 sums what M1 persisted, never re-derives
--     (PRD Rule 8). SQL sum(numeric(14,2)) is exact, so the materialized cell ties to
--     the pure buildYieldReport over the same rows to the centavo (the reconciliation
--     asserts this).
--
-- The classifier is duplicated ONCE into SQL (app.deal_segment), mirroring the pure
-- classifySegment (§3.2) token-for-token. reconcile_yield_aggregate is precisely the
-- guard against the two drifting: it recomputes through this SQL predicate and the
-- pure functions recompute through the TS one, and the verification asserts equality.

-- ---------------------------------------------------------------------------
-- app.deal_segment — the SQL mirror of classifySegment (PRD §3.2)
-- ---------------------------------------------------------------------------
-- The ONE SQL home of segment membership. Order encodes the predicates' precedence
-- exactly as src/lib/yield/segments.ts classifySegment:
--   1. representation = Referrer ⇒ Referral (ANY transaction type — Rule 2);
--   2. else Rental = transaction_type Rental;
--   3. else a Sale splits by deal_type into Resale / Developer.
-- Returns NULL for a deal matching no segment (Sale + n_a + non-Referrer — only
-- reachable via imported/legacy data breaking M1's type coupling, Rule 9); such a
-- deal contributes to NO cell and is surfaced by reconcile_yield_aggregate, never
-- silently folded in. IMMUTABLE so it can be used in the aggregate predicate.
create or replace function app.deal_segment(
  p_transaction_type public.deal_transaction_type,
  p_deal_type public.deal_type,
  p_representation public.deal_representation
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_representation = 'referrer' then 'referral'
    when p_transaction_type = 'rental' then 'rental'
    when p_transaction_type = 'sale' and p_deal_type = 'resale' then 'resale'
    when p_transaction_type = 'sale' and p_deal_type = 'developer' then 'developer'
    else null
  end
$$;

comment on function app.deal_segment is
  'M2 PRD §3.2. The SQL mirror of src/lib/yield/segments.ts classifySegment — the single SQL home of segment membership. referrer→referral first (any txn type), then rental, then sale by deal_type into resale/developer; NULL = unclassified (Rule 9). reconcile_yield_aggregate guards it against the pure classifier.';

-- ---------------------------------------------------------------------------
-- yield_aggregate — the materialized read model (PRD §3.5)
-- ---------------------------------------------------------------------------
-- One row per (workspace, segment, booked_year); sparse (a cell with zero deals is
-- deleted, not stored at zero). All report fields (§3.3) and the planning basis
-- (§3.4) are O(segments × years) reads over this table. Money mirrors the stored
-- deal columns numeric(14,2) — the sums are exact 2-dp (Rule 8). Only the four real
-- segments live here; SALES SUBTOTAL is Resale+Developer, derived on read (§3.2),
-- never a stored cell.
create table public.yield_aggregate (
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  segment text not null,
  booked_year integer not null,
  deal_count integer not null default 0,
  volume_sum numeric(14, 2) not null default 0,          -- Σ list_price (col M)
  gci_sum numeric(14, 2) not null default 0,             -- Σ net_gci (col AD)
  incentive_net_sum numeric(14, 2) not null default 0,   -- Σ incentive_net (memo +)
  referral_out_sum numeric(14, 2) not null default 0,    -- Σ referral_out (memo −)
  updated_at timestamptz not null default now(),
  primary key (workspace_id, segment, booked_year),
  constraint yield_aggregate_segment_valid
    check (segment in ('resale', 'developer', 'rental', 'referral')),
  constraint yield_aggregate_count_positive check (deal_count > 0)
);

comment on table public.yield_aggregate is
  'M2 PRD §3.5. Materialized yield read model: one row per (workspace, segment, booked_year) with deal_count + volume/gci/incentive/referral sums (stored 2-dp deal values, Rule 8). Maintained by consume_yield_events (absolute per-cell re-aggregation on deal events); sparse (zero-deal cells deleted). SALES SUBTOTAL is derived (Resale+Developer), never stored.';

-- The primary key already indexes (workspace_id, segment, booked_year). Report reads
-- scan a workspace's cells (a year filter, or All across years); this partial-free
-- index on (workspace_id, booked_year) backs the per-year segment scan.
create index yield_aggregate_year_idx
  on public.yield_aggregate (workspace_id, booked_year);

alter table public.yield_aggregate enable row level security;

-- Tenant isolation is the RLS job (M0 rule 1). This is a read-only surface to the
-- user (M2 has no mutation endpoints — FR-M2-11); INSERT/UPDATE/DELETE policies
-- exist only for the SECURITY INVOKER consumer, which deletes emptied cells.
create policy "yield_aggregate_select_member"
  on public.yield_aggregate for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "yield_aggregate_insert_member"
  on public.yield_aggregate for insert
  to authenticated
  with check (app.is_workspace_member(workspace_id));

create policy "yield_aggregate_update_member"
  on public.yield_aggregate for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create policy "yield_aggregate_delete_member"
  on public.yield_aggregate for delete
  to authenticated
  using (app.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- yield_basis_version — the per-workspace monotonic counter (PRD §3.4)
-- ---------------------------------------------------------------------------
-- basis_version is the cache-coherence token M3 reads with the PlanningBasis (§3.4):
-- it increments whenever the all-time sales basis COULD have moved, i.e. whenever a
-- Sales-segment (Resale/Developer) cell's stored values actually change. A monotonic
-- counter, never reset; computed_at stamps the last bump. One row per workspace.
create table public.yield_basis_version (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  basis_version bigint not null default 0,
  computed_at timestamptz not null default now()
);

comment on table public.yield_basis_version is
  'M2 PRD §3.4. Per-workspace monotonic basis_version, bumped by consume_yield_events whenever a Sales-segment (Resale/Developer) cell changes value. M3 caches the PlanningBasis against this token; M2.3 reads it into the API contract.';

alter table public.yield_basis_version enable row level security;

create policy "yield_basis_version_select_member"
  on public.yield_basis_version for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "yield_basis_version_insert_member"
  on public.yield_basis_version for insert
  to authenticated
  with check (app.is_workspace_member(workspace_id));

create policy "yield_basis_version_update_member"
  on public.yield_basis_version for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- yield_event_cursor — M2's OWN cursor over the deal event log
-- ---------------------------------------------------------------------------
-- One row per workspace; distinct from receivable_event_cursor (M4's) — each
-- consumer of deal_event keeps its own high-water mark (m1_2 handoff). Ordered by
-- (occurred_at, id). '-infinity' start replays the whole log the first time; reset
-- it and re-drain to re-project every cell identically (the consumer is idempotent).
create table public.yield_event_cursor (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  last_occurred_at timestamptz not null default '-infinity',
  last_event_id uuid,
  updated_at timestamptz not null default now()
);

comment on table public.yield_event_cursor is
  'M2.2. The yield consumer''s high-water mark over public.deal_event, per workspace (distinct from M4''s cursor). Ordered by (occurred_at, id). Reset to defaults to replay; consume_yield_events is idempotent (per-cell re-aggregation) so a replay re-projects to the same state.';

alter table public.yield_event_cursor enable row level security;

create policy "yield_event_cursor_select_member"
  on public.yield_event_cursor for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "yield_event_cursor_insert_member"
  on public.yield_event_cursor for insert
  to authenticated
  with check (app.is_workspace_member(workspace_id));

create policy "yield_event_cursor_update_member"
  on public.yield_event_cursor for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- app.recompute_yield_cell(workspace, segment, year) — the absolute per-cell rebuild
-- ---------------------------------------------------------------------------
-- Re-aggregates ONE (segment, year) cell from the workspace's CURRENT non-archived
-- deals and upserts it (or deletes it when the cell empties). Absolute, so calling
-- it twice is a no-op — the idempotency guarantee the consumer relies on. Returns
-- true iff a SALES-segment (resale/developer) cell's stored values actually changed,
-- so the caller knows whether to bump basis_version (§3.4). Archived deals are
-- excluded (Rule 10); the segment predicate is app.deal_segment (Rule 9 nulls never
-- match a cell).
create or replace function app.recompute_yield_cell(
  p_workspace_id uuid,
  p_segment text,
  p_year integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_volume numeric(14, 2);
  v_gci numeric(14, 2);
  v_incentive numeric(14, 2);
  v_referral numeric(14, 2);
  v_old public.yield_aggregate;
  v_found boolean;
  v_changed boolean := false;
begin
  -- Truth for this cell, straight from the live deal table (Rule 8 stored sums).
  select
    count(*),
    coalesce(sum(list_price), 0),
    coalesce(sum(net_gci), 0),
    coalesce(sum(incentive_net), 0),
    coalesce(sum(referral_out), 0)
  into v_count, v_volume, v_gci, v_incentive, v_referral
  from public.deal
  where workspace_id = p_workspace_id
    and archived_at is null
    and booked_year = p_year
    and app.deal_segment(transaction_type, deal_type, representation) = p_segment;

  -- Lock the existing cell so concurrent recomputes (two events, same cell) serialise.
  select * into v_old
  from public.yield_aggregate
  where workspace_id = p_workspace_id and segment = p_segment and booked_year = p_year
  for update;
  v_found := found;

  if v_count = 0 then
    -- Cell emptied — delete it (keep the table sparse). A change iff it existed.
    if v_found then
      delete from public.yield_aggregate
      where workspace_id = p_workspace_id and segment = p_segment and booked_year = p_year;
      v_changed := true;
    end if;
  elsif not v_found then
    insert into public.yield_aggregate (
      workspace_id, segment, booked_year,
      deal_count, volume_sum, gci_sum, incentive_net_sum, referral_out_sum
    )
    values (
      p_workspace_id, p_segment, p_year,
      v_count, v_volume, v_gci, v_incentive, v_referral
    );
    v_changed := true;
  elsif v_old.deal_count <> v_count
     or v_old.volume_sum <> v_volume
     or v_old.gci_sum <> v_gci
     or v_old.incentive_net_sum <> v_incentive
     or v_old.referral_out_sum <> v_referral then
    update public.yield_aggregate set
      deal_count = v_count,
      volume_sum = v_volume,
      gci_sum = v_gci,
      incentive_net_sum = v_incentive,
      referral_out_sum = v_referral,
      updated_at = now()
    where workspace_id = p_workspace_id and segment = p_segment and booked_year = p_year;
    v_changed := true;
  end if;

  -- basis_version tracks the SALES blend only (§3.4): Resale/Developer feed M3.
  return v_changed and p_segment in ('resale', 'developer');
end;
$$;

comment on function app.recompute_yield_cell is
  'M2.2. Absolute re-aggregation of one (workspace, segment, booked_year) yield_aggregate cell from the current non-archived deals (upsert, or delete when emptied). Idempotent. Returns true iff a Sales-segment (resale/developer) cell''s values changed, signalling a basis_version bump. Called by consume_yield_events and reconcile_yield_aggregate.';

grant execute on function app.recompute_yield_cell(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- public.consume_yield_events — drain M2's cursor, restate yield_aggregate (FR-M2-04)
-- ---------------------------------------------------------------------------
-- Reads deal events after the cursor in (occurred_at, id) order. Each event names
-- the cells it can affect: the NEW (segment, year) from new_values (always present),
-- and — on updated/archived/restored — the OLD (segment, year) from old_values when
-- it differs (a move). Each affected cell is recomputed absolutely from live deals.
-- Idempotent (re-aggregation) + resumable (the cursor). SECURITY INVOKER, RLS-scoped.
-- Bumps basis_version once per drain if any Sales cell changed (§3.4). Mirrors
-- consume_deal_events / consume_payment_events structurally. Call in a loop until
-- processed = 0.
create or replace function public.consume_yield_events(p_limit integer default 500)
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
  v_sales_changed boolean := false;
  r record;
  v_new_seg text;
  v_new_year integer;
  v_old_seg text;
  v_old_year integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  -- Load (or initialise) the cursor, locked so concurrent drains serialise on it.
  select last_occurred_at, last_event_id into v_last_at, v_last_id
  from public.yield_event_cursor
  where workspace_id = v_ws
  for update;

  if not found then
    insert into public.yield_event_cursor (workspace_id)
    values (v_ws)
    on conflict (workspace_id) do nothing;

    select last_occurred_at, last_event_id into v_last_at, v_last_id
    from public.yield_event_cursor
    where workspace_id = v_ws
    for update;
  end if;

  for r in
    select e.id, e.occurred_at, e.old_values, e.new_values
    from public.deal_event e
    where e.workspace_id = v_ws
      and (
        e.occurred_at > v_last_at
        or (e.occurred_at = v_last_at and v_last_id is not null and e.id > v_last_id)
      )
    order by e.occurred_at, e.id
    limit greatest(p_limit, 1)
  loop
    -- NEW cell (new_values is present on every event type). A null segment
    -- (unclassified, Rule 9) belongs to no cell — skip it; reconcile surfaces it.
    v_new_seg := app.deal_segment(
      (r.new_values->>'transaction_type')::public.deal_transaction_type,
      (r.new_values->>'deal_type')::public.deal_type,
      (r.new_values->>'representation')::public.deal_representation
    );
    v_new_year := (r.new_values->>'booked_year')::integer;
    if v_new_seg is not null then
      if app.recompute_yield_cell(v_ws, v_new_seg, v_new_year) then
        v_sales_changed := true;
      end if;
    end if;

    -- OLD cell (present on updated/archived/restored). Recompute it only when the
    -- deal MOVED (different segment or year) — otherwise the NEW recompute already
    -- covered it. Handles Resale→Developer, 2026→2027, and classified→unclassified.
    if r.old_values is not null then
      v_old_seg := app.deal_segment(
        (r.old_values->>'transaction_type')::public.deal_transaction_type,
        (r.old_values->>'deal_type')::public.deal_type,
        (r.old_values->>'representation')::public.deal_representation
      );
      v_old_year := (r.old_values->>'booked_year')::integer;
      if v_old_seg is not null
         and (v_old_seg is distinct from v_new_seg or v_old_year is distinct from v_new_year)
      then
        if app.recompute_yield_cell(v_ws, v_old_seg, v_old_year) then
          v_sales_changed := true;
        end if;
      end if;
    end if;

    v_last_at := r.occurred_at;
    v_last_id := r.id;
    v_processed := v_processed + 1;
  end loop;

  if v_processed > 0 then
    update public.yield_event_cursor
    set last_occurred_at = v_last_at,
        last_event_id = v_last_id,
        updated_at = now()
    where workspace_id = v_ws;
  end if;

  -- §3.4 — one monotonic bump per drain that moved the sales blend. A pure re-drain
  -- (processed = 0) never bumps; a replay from cursor 0 re-fills cells and bumps once
  -- (basis_version is a cache-coherence token, expected to advance — the VALUES it
  -- guards reconstruct identically).
  if v_sales_changed then
    insert into public.yield_basis_version (workspace_id, basis_version, computed_at)
    values (v_ws, 1, now())
    on conflict (workspace_id) do update set
      basis_version = public.yield_basis_version.basis_version + 1,
      computed_at = now();
  end if;

  return jsonb_build_object(
    'ok', true, 'processed', v_processed, 'sales_changed', v_sales_changed
  );
end;
$$;

comment on function public.consume_yield_events is
  'FR-M2-04. Drains M2''s cursor over public.deal_event, recomputing the affected (segment, year) yield_aggregate cells (old + new, handling segment/year moves) from the current deals. Idempotent (re-aggregation) + resumable (cursor). Bumps basis_version when a Sales cell changes. Call in a loop until processed = 0.';

revoke all on function public.consume_yield_events(integer) from public;
grant execute on function public.consume_yield_events(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- public.reconcile_yield_aggregate — the on-demand drift check (FR-M2-10)
-- ---------------------------------------------------------------------------
-- Recomputes every cell from raw deals (the same GROUP BY the pure functions sum
-- over) and full-outer-joins it to the materialized yield_aggregate. Any divergence —
-- a wrong sum, a stale cell that should be gone, a missing cell — is a drift row.
-- Zero-drift is the invariant (§8 consistency); drift ≠ 0 is the alarm the on-demand
-- job / nightly runner surfaces LOUDLY. Also returns the Rule 9 unclassified deal
-- codes (a data-quality signal the aggregate deliberately excludes). READ-ONLY — it
-- reports, it does not repair; a replay (reset the cursor + re-drain) is the repair.
create or replace function public.reconcile_yield_aggregate()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_drifts jsonb;
  v_drift_count integer;
  v_unclassified jsonb;
  v_basis bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_ws := app.current_workspace_id();
  if v_ws is null then
    raise exception 'workspace not found' using errcode = 'no_data_found';
  end if;

  with truth as (
    select
      app.deal_segment(transaction_type, deal_type, representation) as segment,
      booked_year,
      count(*)::integer as deal_count,
      coalesce(sum(list_price), 0)::numeric(14, 2) as volume_sum,
      coalesce(sum(net_gci), 0)::numeric(14, 2) as gci_sum,
      coalesce(sum(incentive_net), 0)::numeric(14, 2) as incentive_net_sum,
      coalesce(sum(referral_out), 0)::numeric(14, 2) as referral_out_sum
    from public.deal
    where workspace_id = v_ws
      and archived_at is null
      and app.deal_segment(transaction_type, deal_type, representation) is not null
    group by 1, 2
  ),
  agg as (
    select segment, booked_year, deal_count, volume_sum, gci_sum,
           incentive_net_sum, referral_out_sum
    from public.yield_aggregate
    where workspace_id = v_ws
  ),
  drift as (
    -- Money projected ::text so the alarm payload never carries a JSON float
    -- (Master PRD §4.3) — the numeric distinct checks below run on the CTE numerics.
    select
      coalesce(t.segment, a.segment) as segment,
      coalesce(t.booked_year, a.booked_year) as booked_year,
      t.deal_count as expected_count,
      a.deal_count as actual_count,
      t.volume_sum::text as expected_volume,
      a.volume_sum::text as actual_volume,
      t.gci_sum::text as expected_gci,
      a.gci_sum::text as actual_gci,
      t.incentive_net_sum::text as expected_incentive,
      a.incentive_net_sum::text as actual_incentive,
      t.referral_out_sum::text as expected_referral,
      a.referral_out_sum::text as actual_referral
    from truth t
    full outer join agg a
      on a.segment = t.segment and a.booked_year = t.booked_year
    where t.segment is null                                   -- stale materialized cell
       or a.segment is null                                   -- missing materialized cell
       or t.deal_count is distinct from a.deal_count
       or t.volume_sum is distinct from a.volume_sum
       or t.gci_sum is distinct from a.gci_sum
       or t.incentive_net_sum is distinct from a.incentive_net_sum
       or t.referral_out_sum is distinct from a.referral_out_sum
  )
  select coalesce(jsonb_agg(to_jsonb(drift) order by drift.segment, drift.booked_year), '[]'::jsonb),
         count(*)::integer
  into v_drifts, v_drift_count
  from drift;

  -- Rule 9 — non-archived deals matching no segment (surfaced, never folded in).
  select coalesce(jsonb_agg(deal_code order by deal_code), '[]'::jsonb)
  into v_unclassified
  from public.deal
  where workspace_id = v_ws
    and archived_at is null
    and app.deal_segment(transaction_type, deal_type, representation) is null;

  select basis_version into v_basis
  from public.yield_basis_version where workspace_id = v_ws;

  return jsonb_build_object(
    'ok', v_drift_count = 0,
    'drift_count', v_drift_count,
    'drifts', v_drifts,
    'unclassified', v_unclassified,
    'basis_version', coalesce(v_basis, 0)
  );
end;
$$;

comment on function public.reconcile_yield_aggregate is
  'FR-M2-10. On-demand reconciliation: recomputes every yield_aggregate cell from raw deals and reports any drift (wrong sum / stale cell / missing cell) vs the materialized rows. ok=true iff zero drift (§8). Also returns Rule 9 unclassified deal codes + current basis_version. Read-only — a cursor reset + re-drain is the repair.';

revoke all on function public.reconcile_yield_aggregate() from public;
grant execute on function public.reconcile_yield_aggregate() to authenticated;
