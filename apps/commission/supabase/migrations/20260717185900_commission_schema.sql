-- The commission app's schema in the shared platform database (ADR-23).
--
-- The platform database holds one schema per app: Lead Magnet keeps `public`, Payload and Comps
-- use `cms`, and this app uses `commission` (tables, views, RPCs: exposed through PostgREST) plus
-- `commission_private` (RLS predicates and triggers: never exposed). Every later migration
-- touches only these two schemas, plus its own trigger on auth.users.
--
-- Supabase grants anon, authenticated and service_role their default privileges in `public`
-- only. A new schema needs the same grants, or PostgREST answers "permission denied for schema".
-- These mirror Supabase's `public` defaults exactly; table access is still decided by RLS, and
-- later migrations revoke where they need to, as they did in `public`.

create schema if not exists commission;

comment on schema commission is
  'Commission app (ZETA GCI + Collections). Exposed via PostgREST; access by RLS.';

grant usage on schema commission to anon, authenticated, service_role;

grant all on all tables in schema commission to anon, authenticated, service_role;
grant all on all routines in schema commission to anon, authenticated, service_role;
grant all on all sequences in schema commission to anon, authenticated, service_role;

alter default privileges in schema commission grant all on tables to anon, authenticated, service_role;
alter default privileges in schema commission grant all on routines to anon, authenticated, service_role;
alter default privileges in schema commission grant all on sequences to anon, authenticated, service_role;
