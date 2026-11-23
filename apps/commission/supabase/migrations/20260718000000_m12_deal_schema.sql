-- M1.2 — the deal entity, its permanent-code sequence, and the deal event log.
--
-- Module: M1 PRD §3 (36-field deal), §4 (business rules), §4.1 (permanent IDs),
--         FR-M1-01/03/04/08; M1_Milestones § M1.2
--
-- This is the system of record for closed deals. The workbook keeps it as a
-- 36-column ARRAYFORMULA-driven sheet with Apps-Script-written D001… codes; here
-- the computed columns are persisted values written by the M1.1 engine (the
-- single source of money truth — FR-M1-05), the codes are a real per-workspace
-- sequence, and the sheet's silent list-deletion fallbacks are replaced by
-- referential integrity.
--
-- TWO FILES: this one is the schema (types, tables, indexes, RLS, guards, read
-- helpers). 20260718000100_m12_deal_write_path.sql is the mutation path
-- (create/update/archive/restore/delete) and turns the M0.3 reference counts on.
-- Split for the same reason M0.3 split its enum change out: nothing here depends
-- on a function that depends on this table, so the schema lands first and clean.
--
-- MONEY DISCIPLINE (Master PRD §4.3): every peso figure is `numeric(14,2)` and
-- every rate `numeric(_,6)`, exact decimal, never float. The engine hands the
-- write path centavo-exact strings; the columns store them verbatim. Reads cast
-- ::text (src/lib/supabase/selects) so a value never becomes a JSON float. The
-- one exception is `rate_pct` — see its column note.

-- ---------------------------------------------------------------------------
-- Enums (M1 PRD §3.1). Underscore tokens ('n_a'), not the engine's slash form
-- ('n/a'): the persistence layer maps between them in one place
-- (src/lib/deals/map.ts). Identifier-shaped labels keep the DB consistent with
-- M0's own tokens (property_vat_rule 'always_vat', developer_comm_base 'net').
-- ---------------------------------------------------------------------------

create type commission.deal_transaction_type as enum ('sale', 'rental');

-- Rental ⇒ 'n_a' (rule 12); the coupling is enforced as a CHECK below.
create type commission.deal_type as enum ('developer', 'resale', 'n_a');

create type commission.deal_representation as enum (
  'double_ended', 'seller', 'buyer', 'lessor', 'lessee', 'referrer'
);

create type commission.deal_mode_of_payment as enum (
  'cash', 'bank', 'pagibig', 'deferred_cash'
);

-- Col Q. The engine's CommissionInput discriminant ('percent' | 'fixed').
create type commission.deal_commission_basis as enum ('percent', 'fixed');

-- Col Y (blank = Yes, stored as NULL — M1 PRD §3.1 field 24).
create type commission.deal_incentive_taxable as enum ('yes', 'no');

-- Col O (computed, Rule A). Non-developer deals are always 'n_a'.
create type commission.deal_property_vat as enum ('vat_able', 'exempt', 'n_a');

-- Col T (computed, Rule C). 'n_a' for any non-developer deal.
create type commission.deal_comm_base_display as enum ('gross', 'net', 'n_a');

-- Col V (computed, Rule D). An INVARIANT, not a user choice: a taxable deal of a
-- VAT-registered workspace is 'inclusive', everything else 'n_a'.
--
-- 'exclusive' is RESERVED-BUT-UNREPRESENTABLE (M1 PRD §11 OQ1, resolved by
-- removal; M1.1 engine VatBasis type). The workbook carried an Inclusive/
-- Exclusive picker as speculative future-proofing; every observed developer
-- bills Inclusive and no Exclusive deal has ever occurred, so the value is left
-- OUT of the enum — it cannot be produced or stored. The column is retained so
-- payment snapshots stay coherent (M5 keys off it) and a future per-developer
-- reintroduction is `alter type ... add value 'exclusive'` — a feature release,
-- not a data migration.
create type commission.deal_vat_basis as enum ('inclusive', 'n_a');

-- Event log discriminant (M1 PRD FR-M1-08). Hard delete emits NO event: it is
-- permitted only with zero financial children, so nothing downstream consumed
-- the created event into durable state (see the write-path migration).
create type commission.deal_event_type as enum (
  'created', 'updated', 'archived', 'restored'
);

-- ---------------------------------------------------------------------------
-- deal (M1 PRD §3.1)
-- ---------------------------------------------------------------------------

create table commission.deal (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- Field 1 (col B) — permanent code. 'D' + zero-padded sequence value, assigned
  -- once at creation from workspace.deal_id_sequence, NEVER renumbered, NEVER
  -- reused, survives deletion (§4 rule 1). The guard trigger below makes the
  -- immutability real; the unique index makes the per-workspace uniqueness real.
  deal_code text not null,

  -- --- Inputs (user-editable) — M1 PRD §3.1 (I) ---------------------------

  booked_date date not null,                                    -- 2 (col C)
  transaction_type commission.deal_transaction_type not null,       -- 3 (col D)
  deal_type commission.deal_type not null,                          -- 4 (col E)
  developer_id uuid references commission.developer (id),           -- 5 (col F)
  client_name text not null,                                    -- 6 (col G)
  representation commission.deal_representation not null,           -- 7 (col H)
  property_type_id uuid not null references commission.property_type (id), -- 8 (col I)
  lead_source_id uuid not null references commission.lead_source (id),     -- 9 (col J)
  property_details text not null,                               -- 10 (col K)
  mode_of_payment commission.deal_mode_of_payment not null,         -- 11 (col L)
  list_price numeric(14, 2) not null,                           -- 12 (col M)
  force_vat boolean not null default false,                     -- 13 (col N)

  commission_basis commission.deal_commission_basis not null,       -- 16 (col Q)

  -- 17 (col R) — the ONLY non-numeric money-adjacent input, deliberately TEXT.
  -- Rentals store the exact fraction 1/12 (§4 rule 17), which no fixed-scale
  -- numeric can hold exactly (0.083333… drifts). The M1.1 engine consumes the
  -- rate as a string and divides base×1÷12 exactly, so the storable form and the
  -- engine form are the same string. A plain decimal ("0.05") is equally valid.
  -- The 0<r≤1 range is a zod check at the boundary (a fraction is not range-
  -- checkable in SQL); the CHECK below fixes the FORMAT and the basis pairing.
  rate_pct text,
  fixed_amount numeric(14, 2),                                  -- 18 (col S)

  -- 20 (col U) — developer deals are always treated Yes (§3.1 field 20); the
  -- write path coerces it so the stored row matches the workbook.
  receipt_issued boolean not null default false,

  incentive_billed numeric(14, 2) not null default 0,           -- 23 (col X)
  incentive_taxable commission.deal_incentive_taxable,              -- 24 (col Y)
  referral_out_pct numeric(10, 6) not null default 0,           -- 26 (col AA)
  referral_out_fixed numeric(14, 2) not null default 0,         -- 27 (col AB)
  referral_paid boolean not null default false,                 -- 30 (col AE)

  -- --- Computed (never user-edited) — the M1.1 engine's DealDerived (C) -----
  -- Persisted by the write path from computeDeal()'s output, verbatim.

  property_vat commission.deal_property_vat not null,               -- 14 (col O)
  net_list_price numeric(14, 2) not null,                       -- 15 (col P)
  comm_base commission.deal_comm_base_display not null,             -- 19 (col T)
  vat_basis commission.deal_vat_basis not null,                     -- 21 (col V)
  -- Rule E intermediate (computed panel §6); persisted for the detail view and
  -- so M5's payment form can show what was billed without re-deriving.
  billed_commission numeric(14, 2) not null,
  gci_net_of_vat numeric(14, 2) not null,                       -- 22 (col W)
  incentive_net numeric(14, 2) not null,                        -- 25 (col Z)
  referral_out numeric(14, 2) not null,                         -- 28 (col AC)
  net_gci numeric(14, 2) not null,                              -- 29 (col AD)
  vat_memo numeric(14, 2) not null,                             -- 31 (col AF)
  ewt_memo numeric(14, 2) not null,                             -- 32 (col AG)
  yield_on_list numeric(12, 6) not null,                        -- 33 (col AH)
  -- Not a workbook column: the engine's `taxable` (EWT-subject) flag, carried so
  -- M4/M5 and the payment split key off it without re-deriving (M1.1 handoff).
  taxable boolean not null,

  -- Trivial non-money derivations the engine leaves to M1.2 (M1.1 handoff):
  booked_year integer not null,                                 -- 34 (col AI)
  display_label text not null,                                  -- 35 (col AJ)

  -- --- Soft delete + optimistic locking + audit (36) ----------------------

  archived_at timestamptz,

  -- Optimistic locking (§8 concurrency): every update carries the version it
  -- read; a stale write is refused with a conflict signal M1.3's UI turns into a
  -- "someone changed this" prompt. Bumped by update_deal only.
  version integer not null default 1,

  -- FK-free, resolved to the owner in v1 (M0 §3.2 preamble; §5 OQ5: carry
  -- created_by now so v2 per-agent attribution is free). Tenant integrity rides
  -- on workspace_id, which IS a foreign key.
  created_by uuid,
  updated_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- --- Constraints: the PRD's HARD rules, mirrored in SQL (§4) --------------

  constraint deal_code_format check (deal_code ~ '^D[0-9]{3,}$'),
  constraint deal_client_name_not_blank check (btrim(client_name) <> ''),
  constraint deal_client_name_max_len check (char_length(client_name) <= 160),
  constraint deal_property_details_not_blank check (btrim(property_details) <> ''),
  constraint deal_property_details_max_len check (char_length(property_details) <= 240),
  constraint deal_list_price_positive check (list_price > 0),
  constraint deal_incentive_billed_non_negative check (incentive_billed >= 0),
  constraint deal_referral_out_fixed_non_negative check (referral_out_fixed >= 0),
  constraint deal_referral_out_pct_range check (referral_out_pct >= 0 and referral_out_pct < 1),
  constraint deal_version_positive check (version >= 1),

  -- Basis pairing (§3.1 fields 16–18): % needs a rate and no fixed amount; Fixed
  -- needs a positive amount and no rate. Neither-nor and both-set are
  -- unrepresentable.
  constraint deal_commission_basis_pairing check (
    case commission_basis
      when 'percent' then rate_pct is not null and fixed_amount is null
      when 'fixed' then fixed_amount is not null and fixed_amount > 0 and rate_pct is null
    end
  ),
  -- Rate format only (range is zod's job — a fraction is not range-checkable
  -- here): a plain decimal or an exact numerator/denominator fraction.
  constraint deal_rate_pct_format check (
    rate_pct is null or rate_pct ~ '^([0-9]+(\.[0-9]+)?|[0-9]+/[0-9]+)$'
  ),

  -- Rule 12 — Developer deals require a developer; Resale/N-A must have none.
  constraint deal_developer_pairing check (
    (deal_type = 'developer') = (developer_id is not null)
  ),
  -- Rule 12 — Rental ⇒ deal_type N/A; Sale ⇒ Developer or Resale.
  constraint deal_transaction_deal_type_coupling check (
    case transaction_type
      when 'rental' then deal_type = 'n_a'
      when 'sale' then deal_type in ('developer', 'resale')
    end
  )
);

comment on table commission.deal is
  'M1 PRD §3.1. The system of record for closed deals; computed columns are the M1.1 engine''s output persisted verbatim. Written only through create_deal/update_deal/set_deal_archived/delete_deal (M0.2 one-function-per-mutation pattern).';
comment on column commission.deal.deal_code is
  'Permanent per-workspace code (§4 rule 1). Assigned once from workspace.deal_id_sequence; the guard trigger rejects any change. Retired on deletion, never reused.';
comment on column commission.deal.rate_pct is
  'Commission rate as an exact string ("0.05" or the fraction "1/12"), consumed as-is by the engine. TEXT, not numeric, so the 1/12 rental rate is exact (§4 rule 17).';
comment on column commission.deal.vat_basis is
  'Rule D invariant. Only ''inclusive''/''n_a'' are representable; ''exclusive'' is reserved for a future per-developer reintroduction (OQ1) and cannot be stored.';
comment on column commission.deal.version is
  'Optimistic-lock counter. update_deal refuses a write whose expected version is stale (§8).';

-- Per-workspace code uniqueness (§4 rule 1). The write path allocates
-- monotonically so a collision is unreachable in the success path; the index is
-- the guarantee under any race.
create unique index deal_code_unique on commission.deal (workspace_id, deal_code);

-- List default sort is booked_date desc (FR-M1-02); the active list excludes
-- archived deals, so the common read is covered by this partial index.
create index deal_list_idx
  on commission.deal (workspace_id, booked_date desc)
  where archived_at is null;

-- Year filter drives every downstream year view (§4 rule 19).
create index deal_booked_year_idx on commission.deal (workspace_id, booked_year);

-- The three FK indexes back commission_private.*_reference_count (turned real in the write-path
-- migration): a delete-protection check must not table-scan the deal log.
create index deal_property_type_idx on commission.deal (property_type_id);
create index deal_developer_idx on commission.deal (developer_id) where developer_id is not null;
create index deal_lead_source_idx on commission.deal (lead_source_id);

-- ---------------------------------------------------------------------------
-- commission_private.deal_payment_count — the delete-protection / edit-friction hook (§4 rule 2)
-- ---------------------------------------------------------------------------
-- Defined BEFORE the RLS policies: the delete policy calls it, and Postgres
-- resolves a policy's functions at CREATE POLICY time (the ordering trap the
-- foundation migrations hit once).
--
-- ZERO, ALWAYS, IN M1.2 — and honestly so, exactly like M0.3's reference counts:
-- there is no payment table until M5, so the true count is zero, not unknown.
-- This is the ONE body M5 replaces to turn on delete protection, the archive
-- cascade, and the edit-after-payments friction gate product-wide:
--
--   select count(*) from commission.payment where deal_id = p_id;
--
-- `stable`, not immutable: the count changes as payments are written.
create or replace function commission_private.deal_payment_count(p_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select 0::bigint $$;

comment on function commission_private.deal_payment_count is
  'M1 §4 rule 2. Returns 0 until M5 has payments — replace the body with a count over payment.deal_id. Called by the deal DELETE policy and delete_deal, so protection tightens automatically.';

alter table commission.deal enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — tenant isolation is the RLS job (M0 rule 1), same shape as M0.3.
-- ---------------------------------------------------------------------------
--
-- INSERT/UPDATE/DELETE policies exist so the SECURITY INVOKER write-path
-- functions can operate under the caller's own rights. As with the M0.3 lists,
-- the app always goes through those functions; a member could in principle PATCH
-- the table directly, and — exactly as for developer.comm_base — the v1 model
-- accepts that (the solo owner owns their data; RLS still confines them to their
-- own workspace, which is the security boundary). The DELETE policy additionally
-- carries the financial-children guard, so a forged direct DELETE of a deal with
-- payments removes nothing once M5 makes the count real.

create policy "deal_select_member"
  on commission.deal for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "deal_insert_member"
  on commission.deal for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "deal_update_member"
  on commission.deal for update
  to authenticated
  using (commission_private.is_workspace_member(workspace_id))
  with check (commission_private.is_workspace_member(workspace_id));

-- Delete protection at the policy, not just the function (§4 rule 2): a deal with
-- payments logged against it can never be hard-deleted, whatever the caller does.
-- commission_private.deal_payment_count is 0 until M5 makes it real (mirrors M0.3's reference
-- counts) — the moment M5 replaces the body, this policy starts refusing.
create policy "deal_delete_childless"
  on commission.deal for delete
  to authenticated
  using (
    commission_private.is_workspace_member(workspace_id)
    and commission_private.deal_payment_count(id) = 0
  );

-- ---------------------------------------------------------------------------
-- Immutability guard (§4 rule 1) + updated_at
-- ---------------------------------------------------------------------------

-- deal_code, workspace_id, created_at and created_by are write-once. The update
-- function never sets them, but the guarantee must not depend on the function
-- being the only writer — a direct PATCH must not be able to renumber a deal.
create or replace function commission_private.reject_deal_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deal_code is distinct from old.deal_code
     or new.workspace_id is distinct from old.workspace_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception
      'deal identity (code/workspace/created_at/created_by) is immutable (§4 rule 1)'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger deal_identity_immutable
  before update on commission.deal
  for each row execute function commission_private.reject_deal_identity_change();

create trigger deal_touch_updated_at
  before update on commission.deal
  for each row execute function commission_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- commission_private.deal_snapshot — the LOCKED event payload shape (FR-M1-08)
-- ---------------------------------------------------------------------------

-- The single definition of what a deal event carries. M4 (receivable upsert),
-- M5 (payment form join) and M2 (segment aggregates) all read these keys, and
-- M2/M4 restatement depends on the OLD snapshot, so this shape is a contract:
-- add keys, never rename or drop one. Money is ::text — exact decimal strings,
-- never JSON floats (Master PRD §4.3), the same discipline as every ::text
-- select. Documented for downstream in the M1.2 handoff.
create or replace function commission_private.deal_snapshot(d commission.deal)
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
    'vat_memo', d.vat_memo::text,
    'ewt_memo', d.ewt_memo::text,
    'yield_on_list', d.yield_on_list::text,
    'taxable', d.taxable,
    'archived_at', to_jsonb(d.archived_at),
    'version', d.version
  )
$$;

comment on function commission_private.deal_snapshot is
  'FR-M1-08. The locked deal-event payload shape (money as ::text). M4/M5/M2 read these keys; the OLD snapshot on an update is what M2/M4 restate against. Add keys, never rename/drop.';

-- ---------------------------------------------------------------------------
-- deal_event — the append-only event log (FR-M1-08)
-- ---------------------------------------------------------------------------

-- WHY A LOG, NOT A SINGLE-CONSUMER QUEUE like settings_change_event: that queue
-- has exactly one consumer (M1's recompute) and a one-way consumed stamp. Deal
-- events have SEVERAL independent consumers — M4 builds receivables, M2 builds
-- segment aggregates, M5 reads join data — and a shared consumed stamp cannot
-- serve them all. So this is an immutable append-only log; each consumer tracks
-- its own cursor (M4.1/M2.2 define theirs). Nothing here is ever updated.
create table commission.deal_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,

  -- FK-free actor, pinned to auth.uid() by RLS — same reasoning as
  -- audit_log_entry.actor_user_id: the trail outlives the account.
  actor_user_id uuid not null,

  -- ON DELETE CASCADE: a hard delete is permitted only with zero financial
  -- children (nothing consumed the created event into durable downstream state),
  -- so its events go with it. A soft-deleted (archived) deal keeps its row and
  -- therefore its events.
  deal_id uuid not null references commission.deal (id) on delete cascade,
  deal_code text not null,

  event_type commission.deal_event_type not null,

  -- created  → old NULL,      new snapshot
  -- updated  → old snapshot,  new snapshot,  field_changes = the money/input diff
  -- archived → old snapshot,  new snapshot (archived_at set)
  -- restored → old snapshot,  new snapshot (archived_at cleared)
  old_values jsonb,
  new_values jsonb,
  field_changes jsonb not null default '{}'::jsonb,

  -- The audit entry written in the same transaction — every event has its
  -- human-readable counterpart (rule 12) and vice versa.
  audit_entry_id uuid not null references commission.audit_log_entry (id) on delete cascade,

  occurred_at timestamptz not null default now(),

  constraint deal_event_changes_is_object check (jsonb_typeof(field_changes) = 'object'),
  -- Shape invariants per type, so a malformed event is unrepresentable.
  constraint deal_event_created_shape check (
    event_type <> 'created' or (old_values is null and new_values is not null)
  ),
  constraint deal_event_transition_shape check (
    event_type = 'created' or (old_values is not null and new_values is not null)
  )
);

comment on table commission.deal_event is
  'FR-M1-08 append-only event log. created/updated/archived/restored carry old+new snapshots (commission_private.deal_snapshot). Consumed by M4/M2/M5 via their own cursors — never mutated.';

create index deal_event_workspace_idx on commission.deal_event (workspace_id, occurred_at);
create index deal_event_deal_idx on commission.deal_event (workspace_id, deal_id, occurred_at);
create index deal_event_type_idx on commission.deal_event (workspace_id, event_type, occurred_at);

alter table commission.deal_event enable row level security;

create policy "deal_event_select_member"
  on commission.deal_event for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "deal_event_insert_member"
  on commission.deal_event for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    and actor_user_id = (select auth.uid())
  );

-- Append-only: no UPDATE/DELETE policy for authenticated, and a trigger binds
-- every role (service_role bypasses policies) — same guarantee as audit_log.
-- DELETE is left to the workspace/deal cascade; the trigger blocks UPDATE only.
create or replace function commission_private.reject_deal_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'deal_event is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger deal_event_is_append_only
  before update on commission.deal_event
  for each row execute function commission_private.reject_deal_event_mutation();
