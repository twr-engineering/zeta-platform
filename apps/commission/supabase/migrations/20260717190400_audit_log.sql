-- audit_log_entry: immutable, field-level old→new trail.
--
-- Module: M0 §3.7 (cross-cutting; consumed by M1/M4/M5 for financial edits)
--
-- In v1 the actor is always the owner — the value is *what changed when*
-- (self-audit, support, BIR-defensibility). In v2 the same table becomes the
-- multi-user trail for free.

create type commission.audit_action as enum (
  'create',
  'update',
  'archive',
  'restore',
  'delete_blocked'
);

create table commission.audit_log_entry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commission.workspace (id) on delete cascade,
  -- Deliberately NOT a foreign key to auth.users. Every FK action is wrong for
  -- an audit trail:
  --   ON DELETE CASCADE   → deleting a user erases their history
  --   ON DELETE SET NULL  → erases *who* acted, which is the point of the row,
  --                         and is an UPDATE, which the append-only trigger
  --                         below rejects — deadlocking account deletion
  --   ON DELETE NO ACTION → blocks account deletion outright
  -- So the actor is recorded as a bare uuid that outlives the account. RLS
  -- pins it to auth.uid() on insert, so it cannot be forged; tenant integrity
  -- rides on workspace_id, which IS a foreign key.
  actor_user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action commission.audit_action not null,
  -- { "ewt_rate": { "old": "0.1000", "new": "0.0500" } }
  -- Money and rates are recorded as STRINGS: a JSON number is a binary float,
  -- and the audit trail must reproduce the persisted decimal exactly
  -- (Master PRD §4.3).
  field_changes jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint audit_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_field_changes_is_object check (jsonb_typeof(field_changes) = 'object')
);

comment on table commission.audit_log_entry is
  'Append-only (M0 §8). Retained for the life of the workspace.';
comment on column commission.audit_log_entry.actor_user_id is
  'Who acted. Intentionally FK-free so the trail survives account deletion; RLS pins it to auth.uid() on insert. Render an unresolvable id as "(deleted user)".';
comment on column commission.audit_log_entry.field_changes is
  'Field-level old→new diff. Decimals stored as strings to preserve exactness.';

-- The audit viewer filters by entity and date (FR-M0-08).
create index audit_log_workspace_occurred_at_idx
  on commission.audit_log_entry (workspace_id, occurred_at desc);

create index audit_log_entity_idx
  on commission.audit_log_entry (workspace_id, entity_type, entity_id, occurred_at desc);

alter table commission.audit_log_entry enable row level security;

create policy "audit_select_member"
  on commission.audit_log_entry for select
  to authenticated
  using (commission_private.is_workspace_member(workspace_id));

create policy "audit_insert_member"
  on commission.audit_log_entry for insert
  to authenticated
  with check (
    commission_private.is_workspace_member(workspace_id)
    -- An entry may only ever be attributed to the user writing it.
    and actor_user_id = (select auth.uid())
  );

-- Entries are immutable. RLS alone would not achieve that — service_role
-- bypasses policies — so the guarantee lives in a trigger that binds every
-- role, including migrations.
create or replace function commission_private.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'audit_log_entry is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- UPDATE only, deliberately. Extending this to DELETE would also block the
-- ON DELETE CASCADE from workspace, breaking M0.4 account deletion — and that
-- deletion is the intended end of the trail, not a hole in it: the solo agent
-- owns their data outright and erasing the workspace erases its history.
-- Piecemeal deletion stays impossible for `authenticated`, which has no DELETE
-- policy on this table.
create trigger audit_log_entry_is_append_only
  before update on commission.audit_log_entry
  for each row execute function commission_private.reject_audit_mutation();
