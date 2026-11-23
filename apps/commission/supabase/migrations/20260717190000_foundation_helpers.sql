-- Foundation helpers: the `commission_private` schema and updated_at plumbing.
--
-- Module: M0 (Account Foundation & Settings)
--
-- The tenant predicates (commission_private.is_workspace_member, commission_private.current_workspace_id)
-- deliberately live in the next migration, not here: they are SQL-language
-- functions, whose bodies Postgres validates at CREATE time, and they read
-- commission.membership — which does not exist yet at this point in the ordering.

create schema if not exists commission_private;

comment on schema commission_private is
  'Internal helpers (RLS predicates, triggers). Not exposed via PostgREST.';

revoke all on schema commission_private from anon, authenticated;
grant usage on schema commission_private to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function commission_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function commission_private.touch_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every mutable table.';
