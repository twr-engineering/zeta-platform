-- workspace: the tenant — one agent's book of business.
-- membership: team-ready join table carrying exactly one owner row in v1.
-- The tenant-isolation predicates every later policy depends on.
--
-- Module: M0 §3.1, §3.2
--
-- Ordering inside this file is load-bearing: tables first, then the predicates
-- (SQL-language function bodies are validated at CREATE time, so the tables they
-- read must already exist), then the policies that call them.

-- ---------------------------------------------------------------------------
-- workspace
-- ---------------------------------------------------------------------------

create table public.workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Fixed PHP in v1; the column exists so v2 currencies are a feature, not a
  -- migration (M0 §3.1).
  currency text not null default 'PHP',
  -- Workspace-local "today" for pace/idle math; timestamps still store UTC
  -- (Master PRD §6).
  timezone text not null default 'Asia/Manila',
  -- Backs permanent deal IDs (D001…). Increments only, never reused, never
  -- renumbered (M1 §4.1 / Master PRD §4.9).
  deal_id_sequence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_name_not_blank check (btrim(name) <> ''),
  constraint workspace_name_max_len check (char_length(name) <= 120),
  constraint workspace_currency_php_only check (currency = 'PHP'),
  constraint workspace_deal_sequence_non_negative check (deal_id_sequence >= 0)
);

comment on table public.workspace is
  'The tenant. v1: one workspace per agent, created by the signup bootstrap.';
comment on column public.workspace.deal_id_sequence is
  'Monotonic counter behind permanent deal codes (D001…). Never decremented, never reused — M1 owns allocation.';

create trigger workspace_touch_updated_at
  before update on public.workspace
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- membership
-- ---------------------------------------------------------------------------

-- Reserved for v2. v1 writes only 'owner'; the enum exists so the team edition
-- is a feature release rather than a migration (M0 §3.2).
create type public.membership_role as enum ('owner', 'admin', 'agent', 'readonly');

create table public.membership (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint membership_workspace_user_unique unique (workspace_id, user_id)
);

comment on table public.membership is
  'Team-ready by design, single-row in v1: exactly one owner per workspace. See membership_single_owner_v1.';

-- The v1 invariant, enforced rather than assumed: one membership per workspace.
-- DROP THIS INDEX in the v2 team migration — it is the only thing standing
-- between this schema and multi-member workspaces.
create unique index membership_single_owner_v1
  on public.membership (workspace_id);

-- v1 has no workspace switcher; one membership per user is the other half of
-- the invariant (M0 rule 1: a second workspace is blocked with a friendly message).
create unique index membership_single_workspace_per_user_v1
  on public.membership (user_id);

create trigger membership_touch_updated_at
  before update on public.membership
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Reap workspaces that lose their last member
-- ---------------------------------------------------------------------------

-- Nothing references auth.users from `workspace`, so deleting an account
-- cascades away the profile and membership but strands the workspace — and with
-- it tax_settings, the audit trail, and (from M1 on) every deal and payment.
-- Such a workspace is invisible to everyone (no membership ⇒ RLS matches
-- nobody) yet still holds the agent's financial data, which is precisely what
-- M0.4's "it's my data" guarantee promises it will not do.
--
-- Deleting on last-member-out keeps account deletion honest, and stays correct
-- for v2: it fires only when zero memberships remain.
create or replace function app.reap_orphaned_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m where m.workspace_id = old.workspace_id
  ) then
    delete from public.workspace w where w.id = old.workspace_id;
  end if;
  return old;
end;
$$;

comment on function app.reap_orphaned_workspace() is
  'Deletes a workspace once its last membership goes, so account deletion cannot strand tenant data (M0.4).';

create trigger membership_reap_orphaned_workspace
  after delete on public.membership
  for each row execute function app.reap_orphaned_workspace();

-- ---------------------------------------------------------------------------
-- Tenant isolation predicates (M0 rule 1: isolation is absolute)
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the lookup bypasses RLS on `membership` itself —
-- otherwise every policy calling this would recurse through the membership
-- policy. This body is the only thing trusted to read membership unfiltered.
create or replace function app.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function app.is_workspace_member(uuid) is
  'True when the current user holds a membership in the workspace. The single tenant gate for every RLS policy.';

create or replace function app.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.membership m
  where m.user_id = (select auth.uid())
  limit 1;
$$;

comment on function app.current_workspace_id() is
  'The caller''s workspace. v1 guarantees one membership per user; v2 (teams) will need an explicit workspace selector instead.';

grant execute on function app.is_workspace_member(uuid) to authenticated;
grant execute on function app.current_workspace_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.workspace enable row level security;

create policy "workspace_select_member"
  on public.workspace for select
  to authenticated
  using (app.is_workspace_member(id));

create policy "workspace_update_member"
  on public.workspace for update
  to authenticated
  using (app.is_workspace_member(id))
  with check (app.is_workspace_member(id));

-- No INSERT policy: workspaces are created only by the signup bootstrap, which
-- enforces the one-workspace-per-user invariant (M0 rule 1).
-- No DELETE policy: M0.4 account deletion is a service-role flow behind a typed
-- confirmation, preceded by the export offer.

alter table public.membership enable row level security;

-- Reads its own rows directly (never via app.is_workspace_member) — routing the
-- membership policy through a predicate that reads membership would recurse.
create policy "membership_select_own"
  on public.membership for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No INSERT/UPDATE/DELETE policies: membership is written only by the signup
-- bootstrap in v1. Invitations and role changes arrive with v2.
