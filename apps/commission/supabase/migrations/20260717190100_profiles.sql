-- profiles: the app-visible mirror of auth.users.
--
-- Module: M0 §3.2 (User)

create table commission.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table commission.profiles is
  'One row per auth user, created by the signup bootstrap trigger.';

alter table commission.profiles enable row level security;

-- A user sees and edits only themselves. No workspace predicate here: the
-- profile *is* the user, and in v1 nobody else shares their workspace.
create policy "profiles_select_own"
  on commission.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on commission.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy: profiles are created only by the signup trigger
-- (SECURITY DEFINER). No DELETE policy: account deletion (M0.4) cascades from
-- auth.users instead.

create trigger profiles_touch_updated_at
  before update on commission.profiles
  for each row execute function commission_private.touch_updated_at();
