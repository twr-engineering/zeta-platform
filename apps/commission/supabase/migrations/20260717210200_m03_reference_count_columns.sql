-- M0.3 — reference_count as a PostgREST computed column.
--
-- Module: M0 §6 ("reference count column: 'used by 12 deals'"), rule 5
--
-- The list screens show, per row, how many deals depend on it — that number is
-- what turns "Delete" into "you can't, but here's Archive" (AC4) and what makes
-- the refusal explainable rather than dogmatic.
--
-- WHY A COMPUTED COLUMN RATHER THAN A SECOND ROUND TRIP OR A LIST RPC:
-- PostgREST exposes a function taking a single table row as `select=…,
-- reference_count`, so the count arrives with the row on an ordinary,
-- RLS-scoped select. The alternatives were worse:
--
--   - a separate counts RPC → two queries that can disagree, and a join to
--     write in TypeScript for no gain;
--   - a list_property_types() RPC returning rows+counts → a bespoke read shape
--     per entity, and every later filter has to be re-implemented as a
--     parameter instead of just being PostgREST.
--
-- The cost to know about: this runs per row, so it belongs on the settings
-- screens (tens of rows) and NOT on the dropdown read, which is why
-- @/lib/settings/list-queries keeps those two reads separate. Once M1 makes
-- these counts real, that separation is what keeps the M1 deal form fast.
--
-- Overloaded on the row type, so all three read `reference_count` — the same
-- word for the same idea on every list.

create or replace function public.reference_count(public.property_type)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select app.property_type_reference_count($1.id) $$;

create or replace function public.reference_count(public.developer)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select app.developer_reference_count($1.id) $$;

create or replace function public.reference_count(public.lead_source)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$ select app.lead_source_reference_count($1.id) $$;

comment on function public.reference_count(public.property_type) is
  'PostgREST computed column: select=*,reference_count. Delegates to app.property_type_reference_count — the single place M1 turns real counts on.';

grant execute on function public.reference_count(public.property_type) to authenticated;
grant execute on function public.reference_count(public.developer) to authenticated;
grant execute on function public.reference_count(public.lead_source) to authenticated;
