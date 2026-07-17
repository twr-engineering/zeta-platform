-- Foundation helpers: the `app` schema and updated_at plumbing.
--
-- Module: M0 (Account Foundation & Settings)
--
-- The tenant predicates (app.is_workspace_member, app.current_workspace_id)
-- deliberately live in the next migration, not here: they are SQL-language
-- functions, whose bodies Postgres validates at CREATE time, and they read
-- public.membership — which does not exist yet at this point in the ordering.

create schema if not exists app;

comment on schema app is
  'Internal helpers (RLS predicates, triggers). Not exposed via PostgREST.';

revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every mutable table.';
