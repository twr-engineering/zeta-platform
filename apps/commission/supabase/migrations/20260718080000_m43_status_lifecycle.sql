-- M4.3 — Status lifecycle, Confirmed Collectible override, variance & write-off.
--
-- Module: M4 PRD §3.2 Rules N/O, §3.3 Corrections doctrine, §4 rules 6/7/8/10;
--         FR-M4-05/06; M4_Milestones § M4.3
--
-- The full business layer on top of M4.1's entity and M4.2's collections math:
--   · status transitions Open→Closed, Open→Cancelled, and reopen both ways —
--     each FRICTION-GATED at the action layer (an explicit confirmation token,
--     M0 §3.2) and AUDIT-logged old→new (FR-M4-05, §4 rule 6);
--   · variance frozen-for-display on Close (Rule N: collected − total_collectible)
--     and written_off on Cancel (Rule O: total_collectible − collected);
--   · the required free-text cancel reason (Q20 default) captured on the audit;
--   · the restated-override review flag (§4 rule 7): a deal edit that restates a
--     receivable carrying a Confirmed Collectible flags it "review" until the
--     agent re-confirms, clears, or explicitly reviews it.
--
-- WHERE THE MATH LIVES. Variance and written_off are pure differences of two
-- STORED values (collected_net and total_collectible) — never tax math. They are
-- computed in ONE place, commission_private.recompute_receivable_payment_fields (extended below),
-- keyed off status, so:
--   · closing then posting a late payment updates variance (AC5 / edge case 8) —
--     variance is "frozen for DISPLAY" (it replaces balance as the residual shown),
--     not frozen in value; FR-M4-04 explicitly recomputes "variance (if Closed)";
--   · a deal edit that moves total_collectible restates variance too (§4 rule 7);
--   · reopening clears both (status back to open → both null) with balance resuming.
-- The transition functions set status, then delegate the residual math to that one
-- routine — no duplicated Rule N/O arithmetic.
--
-- FRICTION GATE IS THE ACTION LAYER'S JOB (like the deal edit gate). These DB
-- functions are the single writer + audit; the explicit-confirmation contract
-- (checkConfirmation, M0 §3.2) is enforced in src/lib/receivables/actions.ts before
-- the RPC — a request without it never reaches here (AC7). Tenant isolation is RLS
-- (a cross-workspace id finds no row). Every transition is optimistic-locked on
-- p_expected_version, mirroring update_deal / update_payment.

-- ---------------------------------------------------------------------------
-- override_review_flag column (§4 rule 7 / §6 restated-override banner)
-- ---------------------------------------------------------------------------
-- Null = no review pending. Set to the deal edit's occurred_at when a restatement
-- moves the booked/default figures WHILE a confirmed_collectible is set (the
-- override may now predate the deal's economics). Cleared by an explicit audited
-- review action (clear_override_review_flag) or by re-confirming/clearing the
-- override (set_confirmed_collectible). Carries the edit date so the banner can
-- read "The deal was edited on {date}; your confirmed ₱… predates it — review."
alter table commission.receivable
  add column override_review_flagged_at timestamptz;

comment on column commission.receivable.override_review_flagged_at is
  'M4.3 / §4 rule 7. When a deal edit restated this receivable while a confirmed_collectible was set, the edit timestamp — surfaces the "deal restated since override — review" flag. Null once reviewed/re-confirmed/cleared.';

-- ---------------------------------------------------------------------------
-- commission_private.recompute_receivable_payment_fields — EXTENDED with Rule N/O by status
-- ---------------------------------------------------------------------------
-- M4.2's body verbatim (Rule L/M + dates + days_to_first_release + chase key) PLUS
-- the status-driven residual: variance when Closed (Rule N), written_off when
-- Cancelled (Rule O), both null otherwise. Same signature, so both consumers
-- (consume_payment_events, consume_deal_events) and the three transition functions
-- pick it up. Still absolute (idempotent) and today-INDEPENDENT (months_idle/
-- age_months remain read-time). version is deliberately NOT bumped — a system
-- projection, not a user edit.
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
  v_variance numeric(14, 2);
  v_written_off numeric(14, 2);
begin
  select * into v_rec from commission.receivable where deal_id = p_deal_id for update;
  if not found then
    return;
  end if;

  -- Rule L — Collected (Net of VAT) over the deal's non-archived payments,
  -- Commission AND Incentive alike (§4 rule 11). Stored 2-dp values → exact sum.
  select coalesce(sum(net_of_vat), 0), max(payment_date), min(payment_date)
    into v_collected, v_last, v_first
  from commission.payment
  where deal_id = p_deal_id and archived_at is null;

  -- Rule M — balance = total_collectible − collected (signed, no clamp; §4 rules
  -- 8/9). pct null at zero-collectible (§4 rule 15).
  v_balance := v_rec.total_collectible - v_collected;
  if v_rec.total_collectible = 0 then
    v_pct := null;
  else
    v_pct := round(v_collected / v_rec.total_collectible, 6);
  end if;

  if v_first is not null then
    v_days := v_first - v_rec.booking_date;
  else
    v_days := null;
  end if;

  -- Rule N (Closed) / Rule O (Cancelled) — the status-driven residual. Pure
  -- differences of stored values; both null on an Open receivable (balance is the
  -- live figure then). Recomputed on every event so a late payment to a Closed row
  -- moves variance (AC5) and a deal edit restates it (§4 rule 7).
  if v_rec.status = 'closed' then
    v_variance := v_collected - v_rec.total_collectible;   -- negative = short, positive = over
    v_written_off := null;
  elsif v_rec.status = 'cancelled' then
    v_written_off := v_rec.total_collectible - v_collected; -- uncollected remainder; cash kept
    v_variance := null;
  else
    v_variance := null;
    v_written_off := null;
  end if;

  update commission.receivable set
    collected_net = v_collected,
    last_payment_date = v_last,
    first_payment_date = v_first,
    balance = v_balance,
    pct_collected = v_pct,
    days_to_first_release = v_days,
    variance = v_variance,
    written_off = v_written_off,
    chase_priority = v_balance,
    updated_by = coalesce((select auth.uid()), updated_by)
  where deal_id = p_deal_id;
end;
$$;

comment on function commission_private.recompute_receivable_payment_fields is
  'M4.2 Rule L/M + M4.3 Rule N/O. Re-aggregates a deal''s non-archived payments and writes the today-independent payment-derived columns (collected/balance/pct/dates/days/chase) plus the status-driven residual: variance when Closed (collected − total_collectible), written_off when Cancelled (total_collectible − collected), both null when Open. Absolute (idempotent); months_idle/age_months are read-time. Called by both consumers and the status transitions.';

grant execute on function commission_private.recompute_receivable_payment_fields(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- commission_private.transition_receivable — shared guard for the three status mutations
-- ---------------------------------------------------------------------------
-- Locks the receivable, checks existence + optimistic version, and returns the
-- pre-image. NULL out means the caller already returned a jsonb error to the RPC
-- boundary (raised via the out params). Kept inline in each function instead —
-- see below; this comment documents the shared shape the three functions follow:
--   1) auth guard; 2) select ... for update (not found → exception);
--   3) version check (mismatch → {ok:false, reason:'stale_version'});
--   4) status precondition; 5) update status (+ version bump);
--   6) perform recompute (Rule N/O); 7) audit old→new; 8) return the residual.

-- ---------------------------------------------------------------------------
-- commission.close_receivable — Open → Closed (FR-M4-05; Rule N)
-- ---------------------------------------------------------------------------
-- Closing freezes the balance into variance for display (Rule N). NOT blocked on a
-- non-zero balance — closing short is legitimate (Corrections doctrine case 3): the
-- shortfall becomes visible Variance instead of a hidden gap (§3.3, §6 close
-- dialog). The friction gate (explicit confirm) is the action layer's; here we do
-- the single-writer mutation + audit.
create or replace function commission.close_receivable(
  p_receivable_id uuid,
  p_expected_version integer
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
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  if v_before.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'stale_version');
  end if;

  if v_before.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  -- Closed/Cancelled leave the aging/chase views and null their idle counters
  -- (§4 Rule P; the read layer already guards, this makes the stored state honest).
  update commission.receivable
  set status = 'closed',
      months_idle = null,
      age_months = null,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id;

  -- Rule N: variance = collected − total_collectible, frozen for display.
  perform commission_private.recompute_receivable_payment_fields(v_before.deal_id);

  select * into v_after from commission.receivable where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'status', jsonb_build_object('old', v_before.status::text, 'new', 'closed'),
      'variance', jsonb_build_object(
        'old', case when v_before.variance is null then null else v_before.variance::text end,
        'new', case when v_after.variance is null then null else v_after.variance::text end)
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', p_receivable_id, 'status', 'closed',
    'variance', case when v_after.variance is null then null else v_after.variance::text end,
    'version', v_after.version, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.close_receivable is
  'FR-M4-05 / Rule N. Open→Closed: freezes variance (collected − total_collectible) for display, nulls idle counters, audits status + variance old→new. Optimistic-locked on p_expected_version (stale_version). NOT blocked on a non-zero balance — closing short is the Corrections doctrine''s Variance path. The friction-gate confirmation is enforced at the action layer.';

revoke all on function commission.close_receivable(uuid, integer) from public;
grant execute on function commission.close_receivable(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.cancel_receivable — Open → Cancelled (FR-M4-05; Rule O; Q20)
-- ---------------------------------------------------------------------------
-- The deal died; the uncollected remainder is written off, cash already collected
-- is KEPT (§4 rule 10). A free-text reason is REQUIRED (Q20 default) — captured on
-- the audit trail (no reason-code taxonomy in v1, out of scope §10). The reason is
-- the cancel's audit note, the sibling of the override's required note.
create or replace function commission.cancel_receivable(
  p_receivable_id uuid,
  p_expected_version integer,
  p_reason text
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
  v_reason text;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;
  if char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  if v_before.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'stale_version');
  end if;

  if v_before.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update commission.receivable
  set status = 'cancelled',
      months_idle = null,
      age_months = null,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id;

  -- Rule O: written_off = total_collectible − collected at cancellation.
  perform commission_private.recompute_receivable_payment_fields(v_before.deal_id);

  select * into v_after from commission.receivable where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'status', jsonb_build_object('old', v_before.status::text, 'new', 'cancelled'),
      'written_off', jsonb_build_object(
        'old', case when v_before.written_off is null then null else v_before.written_off::text end,
        'new', case when v_after.written_off is null then null else v_after.written_off::text end),
      'cancel_reason', jsonb_build_object('old', null, 'new', v_reason)
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', p_receivable_id, 'status', 'cancelled',
    'written_off', case when v_after.written_off is null then null else v_after.written_off::text end,
    'version', v_after.version, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.cancel_receivable is
  'FR-M4-05 / Rule O / Q20. Open→Cancelled: written_off = total_collectible − collected; collected cash is kept. Requires a free-text reason (captured on the audit). Optimistic-locked (stale_version). Friction gate at the action layer.';

revoke all on function commission.cancel_receivable(uuid, integer, text) from public;
grant execute on function commission.cancel_receivable(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.reopen_receivable — Closed/Cancelled → Open (FR-M4-05; §4 rule 6, OQ4)
-- ---------------------------------------------------------------------------
-- Reopening is ALLOWED and UNLIMITED (OQ4 default), audit-logged; it restores the
-- Open balance/aging math — recompute clears variance/written_off (status back to
-- open) and re-derives balance from the current payments. Closed↔Cancelled direct
-- transitions are not offered (go through Open); this rejects a receivable that is
-- already Open.
create or replace function commission.reopen_receivable(
  p_receivable_id uuid,
  p_expected_version integer
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
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  if v_before.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'stale_version');
  end if;

  if v_before.status not in ('closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'not_reopenable');
  end if;

  update commission.receivable
  set status = 'open',
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id;

  -- Back to Open: variance/written_off → null, balance resumes (recompute reads the
  -- new status). months_idle/age_months are read-time (idle.ts) — no stored value.
  perform commission_private.recompute_receivable_payment_fields(v_before.deal_id);

  select * into v_after from commission.receivable where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'status', jsonb_build_object('old', v_before.status::text, 'new', 'open')
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', p_receivable_id, 'status', 'open',
    'balance', case when v_after.balance is null then null else v_after.balance::text end,
    'version', v_after.version, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.reopen_receivable is
  'FR-M4-05 / §4 rule 6 / OQ4. Closed or Cancelled → Open (unlimited, audited): clears variance/written_off and resumes balance/aging math. Optimistic-locked (stale_version). Friction gate at the action layer.';

revoke all on function commission.reopen_receivable(uuid, integer) from public;
grant execute on function commission.reopen_receivable(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.clear_override_review_flag — the explicit "reviewed" action (§4 rule 7)
-- ---------------------------------------------------------------------------
-- Clears the restated-override review flag without changing the override value —
-- the agent looked and the confirmed figure still stands. Audited. (Re-confirming
-- or clearing the override via set_confirmed_collectible clears it too.)
create or replace function commission.clear_override_review_flag(
  p_receivable_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before commission.receivable;
  v_audit_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  if v_before.override_review_flagged_at is null then
    return jsonb_build_object('ok', true, 'changed', false, 'id', p_receivable_id);
  end if;

  update commission.receivable
  set override_review_flagged_at = null,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'override_review', jsonb_build_object(
        'old', v_before.override_review_flagged_at::text, 'new', null)
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', p_receivable_id, 'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.clear_override_review_flag is
  'M4.3 / §4 rule 7. Clears the restated-override review flag (the confirmed figure still stands) without changing the override; audited. set_confirmed_collectible also clears it on re-confirm/clear.';

revoke all on function commission.clear_override_review_flag(uuid) from public;
grant execute on function commission.clear_override_review_flag(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.set_confirmed_collectible — EXTENDED to clear the review flag on review
-- ---------------------------------------------------------------------------
-- M4.1's body verbatim (edge case 17 note gate, override precedence, audit) PLUS:
-- setting/changing/clearing the override IS a review of it, so it clears
-- override_review_flagged_at in the same write. Same signature — additive.
create or replace function commission.set_confirmed_collectible(
  p_receivable_id uuid,
  p_value numeric,
  p_note text
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

  select * into v_before from commission.receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  if p_value is not null then
    if p_value <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    if v_note is null then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
  end if;

  update commission.receivable
  set confirmed_collectible = p_value,
      next_action_note = coalesce(v_note, next_action_note),
      -- Setting/changing/clearing the override reviews it → clear the flag.
      override_review_flagged_at = null,
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_receivable_id
  returning * into v_after;

  -- total_collectible is generated; balance/variance follow it — restate the
  -- payment-derived money so a changed override moves balance in the same call.
  perform commission_private.recompute_receivable_payment_fields(v_before.deal_id);
  select * into v_after from commission.receivable where id = p_receivable_id;

  v_audit_id := commission_private.write_audit_entry(
    v_before.workspace_id, 'receivable', p_receivable_id, 'update',
    jsonb_build_object(
      'confirmed_collectible', jsonb_build_object(
        'old', case when v_before.confirmed_collectible is null then null
                    else to_jsonb(v_before.confirmed_collectible::text) end,
        'new', case when v_after.confirmed_collectible is null then null
                    else to_jsonb(v_after.confirmed_collectible::text) end),
      'next_action_note', jsonb_build_object(
        'old', to_jsonb(v_before.next_action_note),
        'new', to_jsonb(v_after.next_action_note))
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'confirmed_collectible',
      case when v_after.confirmed_collectible is null then null
           else v_after.confirmed_collectible::text end,
    'total_collectible', v_after.total_collectible::text,
    'default_total_collectible', v_after.default_total_collectible::text,
    'audit_entry_id', v_audit_id
  );
end;
$$;

comment on function commission.set_confirmed_collectible is
  'FR-M4-06 / edge case 17 (+ M4.3). Sets/changes/clears the Confirmed Collectible override; setting REQUIRES a positive value and a non-empty note. Clearing reverts total_collectible to the Rule K.2 default. Reviews (clears) the restated-override flag and restates the payment-derived money. Audited old→new with the note.';

revoke all on function commission.set_confirmed_collectible(uuid, numeric, text) from public;
grant execute on function commission.set_confirmed_collectible(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- commission.consume_deal_events — EXTENDED to raise the restated-override flag
-- ---------------------------------------------------------------------------
-- M4.2's body verbatim (upsert mirrors + Rule K anchors + archive; recompute the
-- payment-derived money) PLUS §4 rule 7: after restating, if the receivable
-- carried a Confirmed Collectible and the deal's booked/default money MOVED, raise
-- the review flag to the edit's timestamp. Captured from the pre-image so it never
-- trips on the initial create (no prior override) — only on a genuine restatement.
-- Same signature — additive; every caller (deal actions, recompute runner,
-- run_workbook_import) picks it up. Still idempotent + resumable.
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
  v_prev_confirmed numeric(14, 2);
  v_prev_default numeric(14, 2);
  v_prev_booked numeric(14, 2);
  v_new_default numeric(14, 2);
  v_new_booked numeric(14, 2);
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

    -- Pre-image: what this receivable carried BEFORE this restatement (null on a
    -- first create). Drives the §4 rule 7 flag decision below.
    select confirmed_collectible, default_total_collectible, booked_net_gci
      into v_prev_confirmed, v_prev_default, v_prev_booked
    from commission.receivable where deal_id = r.deal_id;

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

    perform commission_private.recompute_receivable_payment_fields(r.deal_id);

    -- §4 rule 7 — restated-override review flag. An override was set AND the deal's
    -- money moved (default or booked) → the confirmed figure may predate this edit.
    if v_prev_confirmed is not null then
      v_new_default := (v_snap->>'default_total_collectible')::numeric;
      v_new_booked := (v_snap->>'net_gci')::numeric;
      if v_prev_default is distinct from v_new_default
         or v_prev_booked is distinct from v_new_booked then
        update commission.receivable
        set override_review_flagged_at = r.occurred_at
        where deal_id = r.deal_id;
      end if;
    end if;

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
  'FR-M4-01/02/03 (+ M4.2/M4.3). Drains M4''s cursor over commission.deal_event: upserts each deal''s receivable from the snapshot (mirrors + Rule K anchors + archive; user inputs preserved), recomputes the payment-derived money (balance/variance/written_off/chase), and raises the §4 rule 7 restated-override review flag when a restatement moves the booked/default of an overridden receivable. Idempotent + resumable.';

revoke all on function commission.consume_deal_events(integer) from public;
grant execute on function commission.consume_deal_events(integer) to authenticated;
