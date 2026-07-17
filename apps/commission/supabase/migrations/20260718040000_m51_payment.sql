-- M5.1 — the payment entity, its save-time split snapshot, and the payment event
-- log; the moment M1.2's dormant deal-payment guards turn real.
--
-- Module: M5 PRD §3.1 (15-field payment), §3.2 (split contract), §3.3 (snapshot
--         policy), §3.4 (event payloads), §4 (business rules); M5_Milestones § M5.1
--
-- M5 is the daily-use surface: each release logs one payment row — date, deal,
-- gross — and the system splits that gross into Net-of-VAT / Output VAT / EWT /
-- Net Cash / Retained. The split math is NOT authored here: computePaymentSplit
-- lives in M1's engine (the single source of money truth, FR-M1-05). The app runs
-- it against the referenced deal's *then-current* vat_basis + workspace rates and
-- passes the resulting centavo-exact strings in; this migration's functions are the
-- SINGLE WRITER that persists the snapshot and re-checks only the pure tying
-- invariants (K+L=H, N=H−M, retained=H−L−M — WORKBOOK §4), exactly as the deal
-- write path trusts the engine's tax math but enforces Rule G/H composition.
--
-- ⚠ DELIBERATE DIVERGENCE FROM THE SHEET (§3.3). The workbook recomputes every
-- payment's split live, forever: change a deal's VAT Basis or the workspace EWT
-- rate and all historical rows silently rewrite. The SaaS instead SNAPSHOTS the
-- split at save time onto the row — payment rows are statements of what was
-- actually withheld when the money moved, historical facts, not live formulas.
-- A payment EDIT re-snapshots (an edit asserts "this is what the payment really
-- was"); a deal edit or a rate change NEVER silently rewrites a stored split.
--
-- EVENTS, NOT A CONSUMER (m4_1 handoff). payment.created/updated/deleted are
-- emitted transactionally with each mutation into an append-only payment_event log
-- (mirroring deal_event). M4.2 consumes them with its OWN cursor to restate the
-- receivable's collected/balance/idle/aging; M6/M8 aggregate; M9 indexes. M5.1's
-- job is to EMIT well-shaped events with old+new snapshots — not to build the
-- receivable-side consumer (that is M4.2).
--
-- MONEY DISCIPLINE (Master PRD §4.3): every peso figure is numeric(14,2), every
-- rate numeric(6,4), exact decimal, never float. The engine hands centavo-exact
-- strings; the columns store them verbatim; reads cast ::text (PAYMENT_SELECT).

-- ---------------------------------------------------------------------------
-- Enums (M5 §3.1)
-- ---------------------------------------------------------------------------

-- Col I. Blank is documented as Commission; live rows also store explicit
-- "Commission" (WORKBOOK §4 / register item 9). The importer maps blank ≡
-- commission; the SaaS always stores an explicit value.
create type public.payment_type as enum ('commission', 'incentive');

-- Event log discriminant (§3.4). Soft-delete emits 'deleted' with the full final
-- field set (for M4's reversal math) — the row is retained, so unlike a deal hard
-- delete this DOES emit an event.
create type public.payment_event_type as enum ('created', 'updated', 'deleted');

-- ---------------------------------------------------------------------------
-- payment (M5 PRD §3.1)
-- ---------------------------------------------------------------------------

create table public.payment (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,

  -- Field 2 (col C) — HARD FK to an existing deal (edge case 10). A payment can
  -- never reference a nonexistent deal; RESTRICT (the default) makes it
  -- un-orphanable from this side — a deal that has ANY payment row cannot be hard
  -- deleted (app.deal_payment_count, turned real below, blocks it), only archived.
  -- Same-workspace + non-archived are enforced in create_payment/update_payment
  -- (an archived-deal or cross-workspace ref is refused there); the FK guarantees
  -- existence, the functions guarantee the rest.
  deal_id uuid not null references public.deal (id),

  -- --- Inputs (user-editable) — M5 §3.1 (I) ------------------------------------
  payment_date date not null,                                  -- 1 (col B)
  gross_amount numeric(14, 2) not null,                        -- 3 (col H)
  payment_type public.payment_type not null,                   -- 4 (col I)
  reference_note text,                                         -- 5 (col O)

  -- --- Split snapshot (computed by M1's engine, stored here) — §3.1 (C) --------
  -- Written once at save time from the engine's computePaymentSplit; immutable
  -- outside the audited edit / recompute flows (rule 17). Never a live formula.
  net_of_vat numeric(14, 2) not null,                          -- 6 (col K)
  vat_amount numeric(14, 2) not null,                          -- 7 (col L)
  ewt_amount numeric(14, 2) not null,                          -- 8 (col M)
  net_cash numeric(14, 2) not null,                            -- 9 (col N) = gross − ewt
  retained_cash numeric(14, 2) not null,                       -- 10 = gross − vat − ewt

  -- --- Split audit anchors (the *_used snapshots) — §3.1 (C) -------------------
  -- The deal's vat_basis at save time. Reuses public.deal_vat_basis, whose only
  -- representable values are 'inclusive'/'n_a' — the enum itself IS the assertion
  -- that no split can carry an 'exclusive' basis (rule 5 / OQ1 resolved by
  -- removal). vat_basis_used and the deal's CURRENT vat_basis (joined) may
  -- legitimately differ after a deal correction — that is the stale-basis flag.
  vat_basis_used public.deal_vat_basis not null,               -- 11 (col J)
  ewt_rate_used numeric(6, 4) not null,                        -- 12 (workspace ewt_rate @ save)
  vat_rate_used numeric(6, 4) not null,                        -- 13 (workspace vat_rate @ save)

  -- --- Derived periods (§3.1, rule 19/20) -------------------------------------
  -- GENERATED from the DATE column, so they can NEVER drift and no timezone can
  -- shift a payment across a month/year bucket (payment_date is date-only; the
  -- "today" default is computed in Asia/Manila by the form, never from UTC).
  year_paid integer generated always as (extract(year from payment_date)::integer) stored,   -- 14 (col P)
  month_paid integer generated always as (extract(month from payment_date)::integer) stored, -- 15 (col Q)

  -- --- Soft delete + optimistic lock + audit ----------------------------------
  -- Soft delete (rule 10/11): deleting restates the receivable via payment.deleted;
  -- the row is retained for the audit trail. No hard delete path in v1.
  archived_at timestamptz,
  version integer not null default 1,
  -- FK-free actor columns, same reasoning as the deal/audit tables: the trail
  -- outlives the account. created_by is carried now so v2 per-agent attribution
  -- works retroactively (§5 OQ3).
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The PRD's HARD rules, mirrored in SQL (§4).
  -- Rule 4 / AC10: gross must be positive (zero and negative rejected; refunds/
  -- clawbacks are OQ2, not representable in v1).
  constraint payment_gross_positive check (gross_amount > 0),
  constraint payment_reference_note_len check (reference_note is null or char_length(reference_note) <= 240),
  constraint payment_version_positive check (version >= 1),
  -- Snapshot money is non-negative (a split never yields a negative component).
  constraint payment_split_non_negative check (
    net_of_vat >= 0 and vat_amount >= 0 and ewt_amount >= 0
    and net_cash >= 0 and retained_cash >= 0
  ),
  constraint payment_rate_used_range check (
    ewt_rate_used >= 0 and ewt_rate_used < 1 and vat_rate_used >= 0 and vat_rate_used < 1
  )
);

comment on table public.payment is
  'M5 PRD §3.1. One row per commission/incentive release. The split (net_of_vat/vat/ewt/net_cash/retained) is captured at SAVE time from the deal''s then-current vat_basis + workspace rates and STORED — a historical fact, not a live formula (§3.3). Written only through create_payment/update_payment/delete_payment.';
comment on column public.payment.deal_id is
  'Hard FK (edge case 10). A payment cannot reference a nonexistent deal; same-workspace + non-archived are enforced in the write functions. RESTRICT makes payments un-orphanable — a deal with any payment row cannot be hard-deleted, only archived.';
comment on column public.payment.vat_basis_used is
  'Snapshot of the deal''s vat_basis at save time. Reuses deal_vat_basis {inclusive, n_a}: ''exclusive'' is unrepresentable (rule 5 / OQ1). Differs from the deal''s current vat_basis ⇒ stale-basis (FR-M5-12).';
comment on column public.payment.net_cash is
  'Snapshot col N = gross − ewt (what lands in the bank). Immutable outside the audited edit/recompute flows (rule 17).';
comment on column public.payment.year_paid is
  'GENERATED year(payment_date). Calendar-exact, no timezone shift (rule 20). Feeds M6 monthly cash-in and M8 cash-per-year / tax-per-month.';

-- Default sort is payment_date newest first (§6.2, rule 18), ties by created_at;
-- the active list excludes soft-deleted rows, so the common read is this partial.
create index payment_list_idx
  on public.payment (workspace_id, payment_date desc, created_at desc)
  where archived_at is null;

-- Per-deal payments panel + the delete-protection / edit-friction count. Not
-- partial: app.deal_payment_count (below) counts ALL payment rows for the deal.
create index payment_deal_idx on public.payment (deal_id);

-- Period filters feed M6/M8 (year_paid × month_paid). Active rows only.
create index payment_period_idx
  on public.payment (workspace_id, year_paid, month_paid)
  where archived_at is null;

alter table public.payment enable row level security;

-- Tenant isolation is the RLS job (M0 rule 1), same shape as deal/receivable.
-- INSERT/UPDATE exist for the SECURITY INVOKER write functions. There is NO
-- delete policy for authenticated: a payment is never hard-deleted (rule 10 —
-- soft delete only); it leaves only when its deal is hard-deleted, and the deal
-- can only be hard-deleted at payment count 0, so that path is unreachable while
-- any payment exists.
create policy "payment_select_member"
  on public.payment for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "payment_insert_member"
  on public.payment for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "payment_update_member"
  on public.payment for update
  to authenticated
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create trigger payment_touch_updated_at
  before update on public.payment
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- app.deal_payment_count TURNS REAL (M1.2 handoff — the one edit that turns it on)
-- ---------------------------------------------------------------------------
-- M1.2 shipped this returning 0 with a note: "replace the body with a count over
-- payment.deal_id". This is that replacement. With no other change, the deal
-- DELETE policy + delete_deal (delete-protection, rule 2), the edit-after-payments
-- friction gate (edge case 13) and the archive-cascade confirmation all start
-- carrying real counts — every dormant guard M1.2 wired goes live automatically.
--
-- Counts ALL payment rows for the deal, archived included: a soft-deleted payment
-- still has an event + a receivable restatement in history, so the deal remains
-- un-hard-deletable (archive it instead). `stable`, not immutable — the count
-- moves as payments are written.
create or replace function app.deal_payment_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select count(*) from public.payment where deal_id = p_id $$;

comment on function app.deal_payment_count is
  'M1 §4 rule 2 — now REAL (M5.1). Count of payment rows for the deal (archived included). Called by the deal DELETE policy, delete_deal, and the app''s edit/archive friction gates, so protection is live product-wide.';

-- ---------------------------------------------------------------------------
-- app.payment_snapshot — the LOCKED event payload shape (§3.4)
-- ---------------------------------------------------------------------------
-- The single definition of what a payment event carries. M4.2 (receivable
-- restatement), M6/M8 (aggregates) and M9 (index) read these keys, and M4.2
-- restates against the OLD snapshot on updates/deletes, so this shape is a
-- contract: ADD keys, never rename or drop one. Money is ::text — exact decimal
-- strings, never JSON floats (Master PRD §4.3).
create or replace function app.payment_snapshot(p public.payment)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'deal_id', p.deal_id,
    'payment_date', p.payment_date,
    'payment_type', p.payment_type::text,
    'reference_note', to_jsonb(p.reference_note),
    -- Money / rate — exact strings.
    'gross_amount', p.gross_amount::text,
    'net_of_vat', p.net_of_vat::text,
    'vat_amount', p.vat_amount::text,
    'ewt_amount', p.ewt_amount::text,
    'net_cash', p.net_cash::text,
    'retained_cash', p.retained_cash::text,
    'vat_basis_used', p.vat_basis_used::text,
    'ewt_rate_used', p.ewt_rate_used::text,
    'vat_rate_used', p.vat_rate_used::text,
    'year_paid', p.year_paid,
    'month_paid', p.month_paid,
    'archived_at', to_jsonb(p.archived_at),
    'version', p.version
  )
$$;

comment on function app.payment_snapshot is
  '§3.4. The locked payment-event payload shape (money as ::text). M4.2/M6/M8/M9 read these keys; the OLD snapshot on update/delete is what M4.2 restates against. Add keys, never rename/drop.';

-- The audit view of a payment (field-level old→new). Distinct from the event
-- payload: this is what the audit diff compares, values normalised through the
-- column types (numeric(14,2) renders "50000.00" on both sides, so a re-save of
-- the same figure is a non-change). deal_id changes are audited (a payment can be
-- re-pointed on edit, §3.3.2). Generated year/month are omitted — they are pure
-- functions of payment_date, already in the diff.
create or replace function app.payment_audit_row(p public.payment)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'deal_id', to_jsonb(p.deal_id),
    'payment_date', to_jsonb(p.payment_date),
    'gross_amount', p.gross_amount::text,
    'payment_type', p.payment_type::text,
    'reference_note', to_jsonb(p.reference_note),
    'net_of_vat', p.net_of_vat::text,
    'vat_amount', p.vat_amount::text,
    'ewt_amount', p.ewt_amount::text,
    'net_cash', p.net_cash::text,
    'retained_cash', p.retained_cash::text,
    'vat_basis_used', p.vat_basis_used::text,
    'ewt_rate_used', p.ewt_rate_used::text,
    'vat_rate_used', p.vat_rate_used::text
  )
$$;

-- The full row as create-time changes: every field old=null → new=value.
create or replace function app.payment_created_changes(p public.payment)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(e.key, jsonb_build_object('old', null, 'new', e.value)),
    '{}'::jsonb
  )
  from jsonb_each(app.payment_audit_row(p)) e
$$;

-- ---------------------------------------------------------------------------
-- app.assert_payment_split — the invariants the DB enforces on the engine
-- ---------------------------------------------------------------------------
-- The engine (computePaymentSplit) is trusted for the TAX decision (which rule
-- applies); the DB re-checks the pure ties that must hold for EVERY rule, so a
-- forged call that bypasses the engine cannot land an internally-inconsistent
-- split. These are addition, not tax math (WORKBOOK §4):
--   K + L = H     (net_of_vat + vat = gross)
--   N     = H − M (net_cash = gross − ewt)
--   Ret   = H − L − M (retained = gross − vat − ewt)
-- ₱0.01 tolerance because the engine rounds each stored field to centavos
-- independently (edge case 15; never float equality).
create or replace function app.assert_payment_split(
  p_gross numeric,
  p_net_of_vat numeric,
  p_vat numeric,
  p_ewt numeric,
  p_net_cash numeric,
  p_retained numeric
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if abs((p_net_of_vat + p_vat) - p_gross) > 0.01 then
    raise exception 'payment split violates K+L=H (net_of_vat + vat = gross)'
      using errcode = 'check_violation';
  end if;
  if abs(p_net_cash - (p_gross - p_ewt)) > 0.01 then
    raise exception 'payment split violates N=H−M (net_cash = gross − ewt)'
      using errcode = 'check_violation';
  end if;
  if abs(p_retained - (p_gross - p_vat - p_ewt)) > 0.01 then
    raise exception 'payment split violates retained = H−L−M'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- payment_event — the append-only event log (§3.4)
-- ---------------------------------------------------------------------------
-- Mirrors deal_event exactly: an immutable append-only log with several
-- independent consumers (M4.2 receivable restatement, M6/M8 aggregates, M9
-- index), each tracking its OWN cursor (m1_2 handoff). Nothing here is ever
-- updated. Delivery is transactional with the payment mutation (§8): a payment
-- row and its event commit together or not at all.
create table public.payment_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,

  -- FK-free actor, pinned to auth.uid() by RLS — same reasoning as deal_event.
  actor_user_id uuid not null,

  -- ON DELETE CASCADE: a payment is soft-deleted, not removed, so this cascade is
  -- reached only if the deal (and thus the payment) is hard-deleted — which is
  -- unreachable while any payment exists. Kept for referential integrity.
  payment_id uuid not null references public.payment (id) on delete cascade,
  -- The deal the payment is against, carried so a consumer can restate the
  -- receivable without joining through the (possibly soft-deleted) payment.
  deal_id uuid not null,

  event_type public.payment_event_type not null,

  -- created  → old NULL,      new snapshot
  -- updated  → old snapshot,  new snapshot,  field_changes = the diff
  -- deleted  → old snapshot,  new snapshot (archived_at set) — full final field
  --            set for M4.2's reversal math
  old_values jsonb,
  new_values jsonb not null,
  field_changes jsonb not null default '{}'::jsonb,

  -- The audit entry written in the same transaction — every event has its
  -- human-readable counterpart (rule 11) and vice versa.
  audit_entry_id uuid not null references public.audit_log_entry (id) on delete cascade,

  occurred_at timestamptz not null default now(),

  constraint payment_event_changes_is_object check (jsonb_typeof(field_changes) = 'object'),
  constraint payment_event_created_shape check (
    event_type <> 'created' or old_values is null
  ),
  constraint payment_event_transition_shape check (
    event_type = 'created' or old_values is not null
  )
);

comment on table public.payment_event is
  '§3.4 append-only event log. created/updated/deleted carry old+new snapshots (app.payment_snapshot). Consumed by M4.2 (receivable restatement), M6/M8, M9 via their own cursors — never mutated.';

create index payment_event_workspace_idx on public.payment_event (workspace_id, occurred_at);
create index payment_event_payment_idx on public.payment_event (workspace_id, payment_id, occurred_at);
create index payment_event_deal_idx on public.payment_event (workspace_id, deal_id, occurred_at);
create index payment_event_type_idx on public.payment_event (workspace_id, event_type, occurred_at);

alter table public.payment_event enable row level security;

create policy "payment_event_select_member"
  on public.payment_event for select
  to authenticated
  using (app.is_workspace_member(workspace_id));

create policy "payment_event_insert_member"
  on public.payment_event for insert
  to authenticated
  with check (
    app.is_workspace_member(workspace_id)
    and actor_user_id = (select auth.uid())
  );

-- Append-only: no UPDATE/DELETE policy, and a trigger binds every role
-- (service_role bypasses policies) — same guarantee as deal_event / audit_log.
create trigger payment_event_is_append_only
  before update on public.payment_event
  for each row execute function app.reject_deal_event_mutation();

-- ---------------------------------------------------------------------------
-- app.resolve_payment_deal — the shared hard-FK / same-workspace / not-archived
-- ---------------------------------------------------------------------------
-- The referential-integrity gate (edge case 10) shared by create + update: the
-- deal must exist, be in the caller's workspace (RLS makes another tenant's deal
-- invisible → not found), and be non-archived. Returns the locked deal row.
-- Raises a typed error the app maps to a clear message; NOTHING is stored on a
-- bad reference.
create or replace function app.resolve_payment_deal(p_deal_id uuid)
returns public.deal
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_deal public.deal;
begin
  select * into v_deal from public.deal where id = p_deal_id;
  if not found then
    -- Unknown, or another tenant's (RLS-invisible) — same answer either way.
    raise exception 'deal reference is invalid (edge case 10)'
      using errcode = 'foreign_key_violation', detail = 'deal_not_found';
  end if;
  if v_deal.archived_at is not null then
    raise exception 'deal is archived (edge case 10)'
      using errcode = 'foreign_key_violation', detail = 'deal_archived';
  end if;
  return v_deal;
end;
$$;

-- ---------------------------------------------------------------------------
-- public.create_payment — FR-M5-01 (also the importer's bulk path, FR-M5-13)
-- ---------------------------------------------------------------------------
-- One transaction: validate the deal reference, verify the split ties, insert,
-- audit, emit payment.created. The split is computed by the APP via M1's
-- computePaymentSplit and passed in (the five ₱ fields + the three *_used
-- snapshots); this function is the single WRITER that persists it.
--
-- NOT friction-gated: logging a release is an ordinary create. The warning
-- contract (future/pre-booking date, duplicate, Closed/Cancelled receivable) is
-- computed in the app and is non-blocking (§4, FR-M5-04). This same function is
-- the importer's un-gated trusted bulk path (FR-M5-13): the importer calls it per
-- row with the engine-computed split and ignores the warnings (historical fact,
-- accepted silently, OQ5) — no separate overlay function is needed because create
-- has no gate to bypass.
create or replace function public.create_payment(
  p_deal_id uuid,
  p_payment_date date,
  p_gross_amount numeric,
  p_payment_type public.payment_type,
  p_reference_note text,
  -- engine-computed split snapshot (the five ₱ fields)
  p_net_of_vat numeric,
  p_vat_amount numeric,
  p_ewt_amount numeric,
  p_net_cash numeric,
  p_retained_cash numeric,
  -- the *_used audit anchors
  p_vat_basis_used public.deal_vat_basis,
  p_ewt_rate_used numeric,
  p_vat_rate_used numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_workspace_id uuid;
  v_deal public.deal;
  v_note text;
  v_row public.payment;
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

  -- Hard FK + same-workspace + non-archived (edge case 10). A bad reference
  -- raises here — nothing is stored.
  v_deal := app.resolve_payment_deal(p_deal_id);

  -- The pure ties the engine's split must satisfy (K+L=H, N=H−M, retained).
  perform app.assert_payment_split(
    p_gross_amount, p_net_of_vat, p_vat_amount, p_ewt_amount, p_net_cash, p_retained_cash
  );

  v_note := nullif(btrim(coalesce(p_reference_note, '')), '');

  insert into public.payment (
    workspace_id, deal_id, payment_date, gross_amount, payment_type, reference_note,
    net_of_vat, vat_amount, ewt_amount, net_cash, retained_cash,
    vat_basis_used, ewt_rate_used, vat_rate_used,
    created_by, updated_by
  )
  values (
    -- workspace_id is the DEAL's workspace (which RLS just confirmed is the
    -- caller's), so a payment can never straddle workspaces.
    v_deal.workspace_id, p_deal_id, p_payment_date, p_gross_amount, p_payment_type, v_note,
    p_net_of_vat, p_vat_amount, p_ewt_amount, p_net_cash, p_retained_cash,
    p_vat_basis_used, p_ewt_rate_used, p_vat_rate_used,
    v_uid, v_uid
  )
  returning * into v_row;

  v_changes := app.payment_created_changes(v_row);

  v_audit_id := app.write_audit_entry(
    v_deal.workspace_id, 'payment', v_row.id, 'create', v_changes
  );

  -- §3.4: created → old NULL, new = the full snapshot. M4.2 adds net_of_vat to
  -- Collected and restates balance/dates/idle from this.
  insert into public.payment_event (
    workspace_id, actor_user_id, payment_id, deal_id, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_deal.workspace_id, v_uid, v_row.id, v_row.deal_id, 'created',
    null, app.payment_snapshot(v_row), '{}'::jsonb, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'deal_id', v_row.deal_id,
    'gross_amount', v_row.gross_amount::text,
    'net_of_vat', v_row.net_of_vat::text,
    'vat_amount', v_row.vat_amount::text,
    'ewt_amount', v_row.ewt_amount::text,
    'net_cash', v_row.net_cash::text,
    'retained_cash', v_row.retained_cash::text,
    'vat_basis_used', v_row.vat_basis_used::text,
    'ewt_rate_used', v_row.ewt_rate_used::text,
    'vat_rate_used', v_row.vat_rate_used::text,
    'year_paid', v_row.year_paid,
    'month_paid', v_row.month_paid,
    'version', v_row.version,
    'audit_entry_id', v_audit_id,
    'event_id', v_event_id
  );
end;
$$;

comment on function public.create_payment is
  'FR-M5-01. Validates the hard deal FK (same-workspace, non-archived; edge case 10), verifies the split ties (K+L=H, N=H−M), persists the engine-computed snapshot, audits, emits payment.created — one transaction. Also the importer''s un-gated bulk path (FR-M5-13). Send money as JSON strings.';

-- ---------------------------------------------------------------------------
-- public.update_payment — FR-M5-07 (re-snapshot §3.3.2 + optimistic locking §8)
-- ---------------------------------------------------------------------------
-- A payment edit RE-SNAPSHOTS: an edit asserts "this is what the payment really
-- was," so the app recomputes the split with the deal/settings as they are NOW
-- and passes the fresh snapshot; this persists it, field-level audits the old→new
-- diff, and emits payment.updated with BOTH snapshots (M4.2 restates deltas —
-- including the old AND new year/month periods). Optimistic locking: a stale
-- version is refused as a value, not an error, so M5.2 can render a conflict
-- prompt. The friction gate (rule 11) is enforced in the app action.
create or replace function public.update_payment(
  p_id uuid,
  p_expected_version integer,
  p_deal_id uuid,
  p_payment_date date,
  p_gross_amount numeric,
  p_payment_type public.payment_type,
  p_reference_note text,
  p_net_of_vat numeric,
  p_vat_amount numeric,
  p_ewt_amount numeric,
  p_net_cash numeric,
  p_retained_cash numeric,
  p_vat_basis_used public.deal_vat_basis,
  p_ewt_rate_used numeric,
  p_vat_rate_used numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before public.payment;
  v_after public.payment;
  v_deal public.deal;
  v_note text;
  v_changes jsonb;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- RLS makes another tenant's row invisible → not found (AC9). FOR UPDATE locks
  -- it so the diff cannot race a concurrent save.
  select * into v_before from public.payment where id = p_id for update;
  if not found then
    raise exception 'payment not found' using errcode = 'no_data_found';
  end if;

  -- Optimistic lock (§8): a value, not an exception, so M5.2 can offer "reload".
  if v_before.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'reason', 'stale_version',
      'id', v_before.id, 'current_version', v_before.version
    );
  end if;

  -- Re-validate the (possibly changed) deal reference — a payment can be
  -- re-pointed on edit (§3.3.2). Refuses a cross-workspace/archived/unknown deal.
  v_deal := app.resolve_payment_deal(p_deal_id);

  perform app.assert_payment_split(
    p_gross_amount, p_net_of_vat, p_vat_amount, p_ewt_amount, p_net_cash, p_retained_cash
  );

  v_note := nullif(btrim(coalesce(p_reference_note, '')), '');

  v_after := v_before;
  v_after.deal_id := p_deal_id;
  v_after.payment_date := p_payment_date;
  v_after.gross_amount := p_gross_amount;
  v_after.payment_type := p_payment_type;
  v_after.reference_note := v_note;
  v_after.net_of_vat := p_net_of_vat;
  v_after.vat_amount := p_vat_amount;
  v_after.ewt_amount := p_ewt_amount;
  v_after.net_cash := p_net_cash;
  v_after.retained_cash := p_retained_cash;
  v_after.vat_basis_used := p_vat_basis_used;
  v_after.ewt_rate_used := p_ewt_rate_used;
  v_after.vat_rate_used := p_vat_rate_used;

  v_changes := app.jsonb_diff(app.payment_audit_row(v_before), app.payment_audit_row(v_after));

  -- Nothing moved: no write, no version bump, no audit, no event.
  if v_changes = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'id', v_before.id, 'version', v_before.version
    );
  end if;

  update public.payment set
    deal_id = v_after.deal_id,
    -- workspace_id follows the (re-resolved) deal, so a re-point stays coherent.
    workspace_id = v_deal.workspace_id,
    payment_date = v_after.payment_date,
    gross_amount = v_after.gross_amount,
    payment_type = v_after.payment_type,
    reference_note = v_after.reference_note,
    net_of_vat = v_after.net_of_vat,
    vat_amount = v_after.vat_amount,
    ewt_amount = v_after.ewt_amount,
    net_cash = v_after.net_cash,
    retained_cash = v_after.retained_cash,
    vat_basis_used = v_after.vat_basis_used,
    ewt_rate_used = v_after.ewt_rate_used,
    vat_rate_used = v_after.vat_rate_used,
    version = v_before.version + 1,
    updated_by = v_uid
  where id = p_id
  returning * into v_after;

  v_audit_id := app.write_audit_entry(
    v_after.workspace_id, 'payment', v_after.id, 'update', v_changes
  );

  -- §3.4: updated → BOTH snapshots + the diff. M4.2 restates deltas against the
  -- OLD one (and re-aggregates the old AND new year/month periods).
  insert into public.payment_event (
    workspace_id, actor_user_id, payment_id, deal_id, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_after.workspace_id, v_uid, v_after.id, v_after.deal_id, 'updated',
    app.payment_snapshot(v_before), app.payment_snapshot(v_after), v_changes, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'gross_amount', v_after.gross_amount::text,
    'net_of_vat', v_after.net_of_vat::text,
    'net_cash', v_after.net_cash::text,
    'version', v_after.version, 'field_changes', v_changes,
    'audit_entry_id', v_audit_id, 'event_id', v_event_id
  );
end;
$$;

comment on function public.update_payment is
  'FR-M5-07 / §3.3.2. Re-snapshots the split (the app recomputes at current deal/settings), field-level audit, emits payment.updated with old+new snapshots; refuses a stale version (§8). The friction gate is enforced in the app action.';

-- ---------------------------------------------------------------------------
-- public.delete_payment — FR-M5-08 (soft delete, rule 10/11)
-- ---------------------------------------------------------------------------
-- Soft delete: sets archived_at, keeps the row for the audit trail, and emits
-- payment.deleted with the FULL final field set (M4.2 subtracts net_of_vat from
-- Collected and restates balance/dates/idle). Optimistic-lock guarded; the
-- friction gate (rule 11 — the confirmation states the receivable restatement) is
-- enforced in the app action.
create or replace function public.delete_payment(
  p_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before public.payment;
  v_after public.payment;
  v_audit_id uuid;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_before from public.payment where id = p_id for update;
  if not found then
    raise exception 'payment not found' using errcode = 'no_data_found';
  end if;

  if v_before.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'reason', 'stale_version',
      'id', v_before.id, 'current_version', v_before.version
    );
  end if;

  -- Already deleted: idempotent no-op (no second event/audit).
  if v_before.archived_at is not null then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'id', v_before.id, 'version', v_before.version
    );
  end if;

  update public.payment
  set archived_at = now(),
      version = v_before.version + 1,
      updated_by = v_uid
  where id = p_id
  returning * into v_after;

  v_audit_id := app.write_audit_entry(
    v_before.workspace_id, 'payment', v_after.id, 'delete',
    jsonb_build_object(
      'archived_at', jsonb_build_object(
        'old', to_jsonb(v_before.archived_at), 'new', to_jsonb(v_after.archived_at)),
      -- Carry the money being reversed so the trail explains the restatement.
      'net_of_vat', jsonb_build_object('old', v_before.net_of_vat::text, 'new', null),
      'gross_amount', jsonb_build_object('old', v_before.gross_amount::text, 'new', null)
    )
  );

  -- §3.4: deleted → old (pre) + new (post, archived_at set). new_values is the
  -- full final field set for M4.2's reversal math.
  insert into public.payment_event (
    workspace_id, actor_user_id, payment_id, deal_id, event_type,
    old_values, new_values, field_changes, audit_entry_id
  )
  values (
    v_before.workspace_id, v_uid, v_after.id, v_after.deal_id, 'deleted',
    app.payment_snapshot(v_before), app.payment_snapshot(v_after), '{}'::jsonb, v_audit_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'id', v_after.id,
    'deal_id', v_after.deal_id,
    'net_of_vat', v_after.net_of_vat::text,
    'version', v_after.version,
    'audit_entry_id', v_audit_id, 'event_id', v_event_id
  );
end;
$$;

comment on function public.delete_payment is
  'FR-M5-08 rule 10/11. Soft delete (sets archived_at, retains the row); emits payment.deleted with the full final field set for M4.2''s reversal math. Optimistic-lock guarded; the friction gate is enforced in the app action.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.create_payment(
  uuid, date, numeric, public.payment_type, text,
  numeric, numeric, numeric, numeric, numeric,
  public.deal_vat_basis, numeric, numeric
) from public;
grant execute on function public.create_payment(
  uuid, date, numeric, public.payment_type, text,
  numeric, numeric, numeric, numeric, numeric,
  public.deal_vat_basis, numeric, numeric
) to authenticated;

revoke all on function public.update_payment(
  uuid, integer, uuid, date, numeric, public.payment_type, text,
  numeric, numeric, numeric, numeric, numeric,
  public.deal_vat_basis, numeric, numeric
) from public;
grant execute on function public.update_payment(
  uuid, integer, uuid, date, numeric, public.payment_type, text,
  numeric, numeric, numeric, numeric, numeric,
  public.deal_vat_basis, numeric, numeric
) to authenticated;

revoke all on function public.delete_payment(uuid, integer) from public;
grant execute on function public.delete_payment(uuid, integer) to authenticated;
