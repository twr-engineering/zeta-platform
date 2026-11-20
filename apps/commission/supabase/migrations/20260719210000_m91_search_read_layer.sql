-- =============================================================================
-- M9.1 — Search read layer: normalized text, trigram index, query RPCs
-- =============================================================================
-- ADDITIVE ONLY. M9 (Search Console) is a pure read layer — it owns no entities,
-- computes no money, and emits no writes (M9 PRD §1, Rule 1). This migration adds:
--   1. the `unaccent` + `pg_trgm` extensions (none were installed);
--   2. an IMMUTABLE text normalizer + LIKE-escaper (PRD §3.3);
--   3. a `search_blob` generated column on `deal` and `receivable`, GIN-trigram
--      indexed (PRD §8 — "plain leading-wildcard LIKE scans are not acceptable");
--   4. the composite indexes the year/deal_code/date filters need over the FULL
--      row set (search includes archived rows per OQ1, so the existing partial
--      `... WHERE archived_at IS NULL` indexes cannot serve it);
--   5. three read-only, workspace-scoped, security-invoker query functions —
--      one per source (Deals / Collectibles / Payments) — implementing the exact
--      filter-applicability + sort matrix (PRD §3.2, Rules 3/5/7) with money as
--      exact `::text` (never a JSON float), and a windowed total for pagination.
--
-- Why a generated column is safe here: every deal/receivable write-path fn loads
-- rows via `%ROWTYPE` (absorbs a new column) and builds audit/snapshots via
-- explicit `jsonb_build_object` field lists (verified: app.deal_audit_row /
-- app.deal_snapshot / receivable audit are all explicit), and every INSERT uses an
-- explicit column list. A GENERATED column is never inserted and never appears in
-- those curated projections, so nothing upstream changes shape or behaviour.
-- =============================================================================

-- 1. Extensions (Supabase convention: install into the `extensions` schema) -----
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
-- btree_gin lets one GIN index combine the scalar workspace_id with the trigram
-- search_blob, so the contains filter is workspace-scoped IN THE INDEX — the
-- planner uses it for `workspace_id = X AND search_blob LIKE '%…%'` without ever
-- scanning another tenant's rows (PRD §8 tenant isolation + index guarantee).
create extension if not exists btree_gin with schema extensions;

-- 2. Normalizer + LIKE-escaper -------------------------------------------------
-- The search_blob transform (PRD §3.3): trim, collapse internal whitespace to a
-- single space, strip diacritics, lowercase. Declared IMMUTABLE so it may back a
-- GENERATED column and a GIN index. `extensions.unaccent(regdictionary, text)` is
-- itself only STABLE (it would be volatile if it re-read the dictionary), but the
-- `unaccent` dictionary is effectively frozen for the life of the database, so
-- pinning it by name and wrapping in an IMMUTABLE function is the standard,
-- documented pattern. Caveat: if the unaccent ruleset were ever changed, the
-- trigram indexes would need a REINDEX — an operational note, not a runtime risk.
create or replace function public.zeta_search_normalize(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    extensions.unaccent(
      'extensions.unaccent'::regdictionary,
      btrim(regexp_replace(coalesce(input, ''), '\s+', ' ', 'g'))
    )
  )
$$;

comment on function public.zeta_search_normalize(text) is
  'M9: normalize search text — trim, collapse whitespace, unaccent, lowercase (PRD §3.3). IMMUTABLE so it can back a generated column + GIN trigram index.';

-- Escape the LIKE metacharacters (\, %, _) in an already-normalized needle so a
-- user typing "100%" or "unit_2" searches for those literals, not wildcards
-- (Rule 12). Postgres LIKE treats backslash as the default escape character.
create or replace function public.zeta_search_needle(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(replace(replace(
    public.zeta_search_normalize(input),
    '\', '\\'), '%', '\%'), '_', '\_')
$$;

comment on function public.zeta_search_needle(text) is
  'M9: normalize + escape LIKE metacharacters for the contains filter (Rule 12 — %/_ are literals).';

-- 3. search_blob generated columns + GIN trigram indexes -----------------------
-- Deal carries its own client + property text.
alter table public.deal
  add column if not exists search_blob text
  generated always as (
    public.zeta_search_normalize(client_name || ' ' || property_details)
  ) stored;

comment on column public.deal.search_blob is
  'M9: normalized client_name + property_details for the contains filter (PRD §3.3). GENERATED — never written directly.';

create index if not exists deal_search_blob_trgm
  on public.deal using gin (workspace_id, search_blob extensions.gin_trgm_ops);

-- Receivable already denormalizes the deal's client + property (M4.1), so it can
-- own the same blob and be searched WITHOUT a join to deal.
alter table public.receivable
  add column if not exists search_blob text
  generated always as (
    public.zeta_search_normalize(client_name || ' ' || property_details)
  ) stored;

comment on column public.receivable.search_blob is
  'M9: mirror of the deal search_blob so the Collectibles source searches without a join (PRD §3.3).';

create index if not exists receivable_search_blob_trgm
  on public.receivable using gin (workspace_id, search_blob extensions.gin_trgm_ops);

-- 4. Composite indexes for the non-text filters over the FULL (incl. archived)
--    row set. booked_year is already covered by non-partial deal_booked_year_idx
--    / receivable_booked_year_idx; deal_code by the non-partial deal_code_unique.
--    These fill the gaps: receivable deal_code, and a non-partial payment date
--    index (payment_list_idx / payment_period_idx are partial on archived_at).
create index if not exists receivable_deal_code_idx
  on public.receivable (workspace_id, deal_code);

create index if not exists payment_search_date_idx
  on public.payment (workspace_id, payment_date desc);

-- 5. Query functions (one per source) ------------------------------------------
-- All: security invoker (RLS is the tenant boundary — M0 Rule 1 / AC9), with an
-- explicit `workspace_id = app.current_workspace_id()` predicate so the composite
-- indexes engage; read-only; money returned as exact `::text`; `total_count` is a
-- window count over the full filtered set (page-independent) for the pagination
-- readout — zero matching rows return zero output rows (the empty-state contract,
-- Rule 8). p_text is normalized + escaped inside SQL, so the needle and the blob
-- pass through the identical transform (no client/server normalization drift).

-- Deals (PRD §3.2) — default booked_date DESC; date_oldest ASC; amount = net_gci
-- DESC; tie-break deal_code ASC (Rule 7).
create or replace function public.search_deals(
  p_year integer default null,
  p_deal_code text default null,
  p_text text default null,
  p_sort text default 'default',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  total_count bigint,
  id uuid,
  deal_code text,
  booked_date date,
  transaction_type public.deal_transaction_type,
  deal_type public.deal_type,
  developer_name text,
  client_name text,
  property_details text,
  net_gci text,
  booked_year integer,
  archived boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select d.id, d.deal_code, d.booked_date, d.transaction_type, d.deal_type,
           dev.name as developer_name, d.client_name, d.property_details,
           d.net_gci, d.booked_year, d.archived_at
    from public.deal d
    left join public.developer dev on dev.id = d.developer_id
    where d.workspace_id = app.current_workspace_id()
      and (p_year is null or d.booked_year = p_year)
      and (p_deal_code is null or d.deal_code = p_deal_code)
      and (
        p_text is null
        or public.zeta_search_normalize(p_text) = ''
        or d.search_blob like '%' || public.zeta_search_needle(p_text) || '%' escape '\'
      )
  )
  select
    count(*) over() as total_count,
    id, deal_code, booked_date, transaction_type, deal_type, developer_name,
    client_name, property_details, net_gci::text, booked_year,
    (archived_at is not null) as archived
  from base
  order by
    (case when p_sort = 'amount_desc' then net_gci end) desc nulls last,
    (case when p_sort = 'date_oldest' then booked_date end) asc nulls last,
    (case when p_sort not in ('amount_desc', 'date_oldest') then booked_date end) desc nulls last,
    deal_code asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.search_deals is
  'M9: read-only Deals search projection (PRD §3.2). Year = booked_year (Rule 3). Sort: default booked_date DESC / date_oldest ASC / amount_desc net_gci DESC, tie deal_code ASC (Rule 7).';

-- Collectibles (PRD §3.2) — ALWAYS balance DESC (the sheet ignores the sort
-- selector for this source, Rule 7); the SaaS maps date_oldest → booking_date ASC
-- (OQ5 defined improvement). status + only_with_balance apply here only (Rule 6).
create or replace function public.search_collectibles(
  p_year integer default null,
  p_deal_code text default null,
  p_status public.receivable_status default null,
  p_only_with_balance boolean default false,
  p_text text default null,
  p_sort text default 'default',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  total_count bigint,
  id uuid,
  deal_id uuid,
  deal_code text,
  client_name text,
  property_details text,
  deal_type public.deal_type,
  total_collectible text,
  collected_net text,
  balance text,
  status public.receivable_status,
  booked_year integer,
  archived boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select r.id, r.deal_id, r.deal_code, r.client_name, r.property_details,
           r.deal_type, r.total_collectible, r.collected_net, r.balance,
           r.status, r.booked_year, r.booking_date, r.archived_at
    from public.receivable r
    where r.workspace_id = app.current_workspace_id()
      and (p_year is null or r.booked_year = p_year)
      and (p_deal_code is null or r.deal_code = p_deal_code)
      and (p_status is null or r.status = p_status)
      and (
        not coalesce(p_only_with_balance, false)
        or (r.balance is not null and r.balance > 0)
      )
      and (
        p_text is null
        or public.zeta_search_normalize(p_text) = ''
        or r.search_blob like '%' || public.zeta_search_needle(p_text) || '%' escape '\'
      )
  )
  select
    count(*) over() as total_count,
    id, deal_id, deal_code, client_name, property_details, deal_type,
    total_collectible::text, collected_net::text, balance::text, status,
    booked_year, (archived_at is not null) as archived
  from base
  order by
    (case when p_sort = 'date_oldest' then booking_date end) asc nulls last,
    (case when p_sort = 'date_oldest' then null else balance end) desc nulls last,
    deal_code asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.search_collectibles is
  'M9: read-only Collectibles search projection (PRD §3.2). Year = booked_year (Rule 3). Sort: ALWAYS balance DESC except date_oldest → booking_date ASC (Rule 7/OQ5), tie deal_code ASC. status + only_with_balance apply here only.';

-- Payments (PRD §3.2) — Year = year PAID (Rule 3, "the asymmetry is the feature"):
-- filtered as a payment_date range so the (workspace_id, payment_date) index
-- serves it. Client/property/deal_code come from the referenced deal. Default
-- payment_date DESC; date_oldest ASC; amount = gross DESC; tie deal_code then id.
create or replace function public.search_payments(
  p_year integer default null,
  p_deal_code text default null,
  p_text text default null,
  p_sort text default 'default',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  total_count bigint,
  id uuid,
  deal_id uuid,
  payment_date date,
  deal_code text,
  client_name text,
  property_details text,
  gross text,
  net_of_vat text,
  net_cash text,
  year_paid integer,
  archived boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select p.id, p.deal_id, p.payment_date, d.deal_code, d.client_name,
           d.property_details, p.gross_amount, p.net_of_vat, p.net_cash,
           p.year_paid, (p.archived_at is not null or d.archived_at is not null) as archived
    from public.payment p
    join public.deal d on d.id = p.deal_id
    where p.workspace_id = app.current_workspace_id()
      and (
        p_year is null
        or (p.payment_date >= make_date(p_year, 1, 1)
            and p.payment_date < make_date(p_year + 1, 1, 1))
      )
      and (p_deal_code is null or d.deal_code = p_deal_code)
      and (
        p_text is null
        or public.zeta_search_normalize(p_text) = ''
        or d.search_blob like '%' || public.zeta_search_needle(p_text) || '%' escape '\'
      )
  )
  select
    count(*) over() as total_count,
    id, deal_id, payment_date, deal_code, client_name, property_details,
    gross_amount::text, net_of_vat::text, net_cash::text, year_paid, archived
  from base
  order by
    (case when p_sort = 'amount_desc' then gross_amount end) desc nulls last,
    (case when p_sort = 'date_oldest' then payment_date end) asc nulls last,
    (case when p_sort not in ('amount_desc', 'date_oldest') then payment_date end) desc nulls last,
    deal_code asc,
    id asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.search_payments is
  'M9: read-only Payments search projection (PRD §3.2). Year = year PAID via payment_date range (Rule 3). Sort: default payment_date DESC / date_oldest ASC / amount_desc gross DESC, tie deal_code then id (Rule 7). Client/property/deal_code via the referenced deal.';

grant execute on function public.search_deals(integer, text, text, text, integer, integer) to authenticated;
grant execute on function public.search_collectibles(integer, text, public.receivable_status, boolean, text, text, integer, integer) to authenticated;
grant execute on function public.search_payments(integer, text, text, text, integer, integer) to authenticated;
