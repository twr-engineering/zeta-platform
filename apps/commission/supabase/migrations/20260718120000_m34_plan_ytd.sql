-- M3.4 — Rule P12 YTD actual-sales aggregate for the GCI Calculator pace card.
--
-- Module: M3 PRD Rule P12 (§3.3, §3.7 pace) + §8 (< 300 ms P95 at ≥ 1,000 deals);
--         M3_Milestones § M3.4. The engine (computePlan) does only the P13
--         subtraction (total_sales_required − ytd); THIS is where the booked volume
--         is summed, live from the M1 deal table (FR-M3-13 — logging a deal in M1
--         moves ytd on the next plan read).
--
-- RULE P12 — ytd_actual_sales for a plan year:
--   Σ list_price (transaction = Sale,   representation ≠ Referrer, booked_year = year)
-- + Σ list_price (transaction = Rental, representation ≠ Referrer, booked_year = year)
-- A rental's list_price IS its annual rent (M1), and the WORKBOOK INCLUDES that volume
-- in YTD actual — so rentals are counted by DEFAULT. This is the single point where
-- OQ-1 is decided: p_include_rentals defaults TRUE (sheet behaviour). Flip it to FALSE
-- and the 2026 workbook YTD drops ₱2,400,000 (four rentals) from ₱161,680,945.00 to
-- ₱159,280,945.00 — the one-line change OQ-1 resolves either way. The flag is NOT
-- user-visible; it exists so the product-owner decision lands as an argument, not a
-- rewrite. Referrer deals are always excluded (referral fees carry no sales volume of
-- the agent's own — Rule 12, mirroring M2's segment rules). Archived deals are excluded
-- (the live ledger only). "YTD" is shorthand for "booked in the plan year": a future
-- plan year sums to ₱0 whatever today's date.
--
-- Money as ::text (Master PRD §4.3): the sum is numeric(14,2); returning it ::text keeps
-- the caller on exact-decimal arithmetic, never a JSON float. Empty year → '0'.
--
-- TENANT ISOLATION (M0 rule 1 / AC9): SECURITY INVOKER runs under the caller's rights so
-- deal_select_member RLS confines the scan to their workspace; the explicit
-- workspace_id = commission_private.current_workspace_id() predicate is what lets the read ride the
-- (workspace_id, booked_year) index rather than an RLS-only seq scan.

create or replace function commission.plan_ytd_actual_sales(
  p_year integer,
  p_include_rentals boolean default true
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(d.list_price), 0)::text
  from commission.deal d
  where d.workspace_id = commission_private.current_workspace_id()
    and d.archived_at is null
    and d.booked_year = p_year
    and d.representation <> 'referrer'
    and (p_include_rentals or d.transaction_type = 'sale');
$$;

comment on function commission.plan_ytd_actual_sales is
  'M3 Rule P12. Σ list_price of non-Referrer, non-archived deals booked in p_year — Sale always, Rental iff p_include_rentals (default true = the workbook''s sheet behaviour; OQ-1''s isolation point). Returns numeric(14,2) ::text; empty year → 0. Feeds the pace card''s YTD actual + balance-to-target (P13).';

revoke all on function commission.plan_ytd_actual_sales(integer, boolean) from public;
grant execute on function commission.plan_ytd_actual_sales(integer, boolean) to authenticated;
