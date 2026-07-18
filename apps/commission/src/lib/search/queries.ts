import "server-only";

/**
 * M9 — the server-side search read layer (PRD §3.2, §8; Rules 3/5/6/7/8).
 *
 * Each source dispatches to its SQL query function (migration
 * 20260719210000_m91_search_read_layer), which does the filtering, the sort
 * matrix, pagination, and the windowed total in one indexed, workspace-scoped,
 * read-only pass. RLS is the tenant boundary (M0 rule 1 / AC9) — there is no
 * `workspace_id` argument to tamper with; the function resolves it from the JWT.
 * Money arrives as exact `::text` strings; M9 never re-derives it.
 */
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAGE_SIZE,
  EMPTY_STATE_MESSAGE,
  type CollectibleSearchRow,
  type DealSearchRow,
  type PaymentSearchRow,
  type SearchQuery,
  type SearchResult,
} from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** RPC args shared by all three functions — nulls become SQL defaults (no filter). */
function commonArgs(query: SearchQuery) {
  return {
    p_year: query.year ?? undefined,
    p_deal_code: query.dealCode ?? undefined,
    p_text: query.text.length > 0 ? query.text : undefined,
    p_sort: query.sort,
    p_limit: query.pageSize,
    p_offset: (query.page - 1) * query.pageSize,
  };
}

/** The window count rides on every returned row; absent when zero rows match. */
function totalOf(rows: ReadonlyArray<{ total_count: number }>): number {
  return rows.length > 0 ? Number(rows[0].total_count) : 0;
}

export async function getDealSearch(
  query: SearchQuery,
  client?: SupabaseClient
): Promise<SearchResult<DealSearchRow>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("search_deals", commonArgs(query));
  if (error) throw new Error(`Could not search deals: ${error.message}`);
  const raw = data ?? [];
  return {
    source: "deals",
    total: totalOf(raw),
    page: query.page,
    pageSize: query.pageSize,
    emptyMessage: EMPTY_STATE_MESSAGE,
    rows: raw.map((r) => ({
      id: r.id,
      dealCode: r.deal_code,
      bookedDate: r.booked_date,
      transactionType: r.transaction_type,
      dealType: r.deal_type,
      developerName: r.developer_name ?? null,
      clientName: r.client_name,
      propertyDetails: r.property_details,
      netGci: r.net_gci,
      bookedYear: r.booked_year,
      archived: r.archived,
    })),
  };
}

export async function getCollectibleSearch(
  query: SearchQuery,
  client?: SupabaseClient
): Promise<SearchResult<CollectibleSearchRow>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("search_collectibles", {
    ...commonArgs(query),
    p_status: query.status ?? undefined,
    p_only_with_balance: query.onlyWithBalance,
  });
  if (error) throw new Error(`Could not search collectibles: ${error.message}`);
  const raw = data ?? [];
  return {
    source: "collectibles",
    total: totalOf(raw),
    page: query.page,
    pageSize: query.pageSize,
    emptyMessage: EMPTY_STATE_MESSAGE,
    rows: raw.map((r) => ({
      id: r.id,
      dealId: r.deal_id,
      dealCode: r.deal_code,
      clientName: r.client_name,
      propertyDetails: r.property_details,
      dealType: r.deal_type,
      totalCollectible: r.total_collectible,
      collectedNet: r.collected_net,
      balance: r.balance,
      status: r.status,
      bookedYear: r.booked_year,
      archived: r.archived,
    })),
  };
}

export async function getPaymentSearch(
  query: SearchQuery,
  client?: SupabaseClient
): Promise<SearchResult<PaymentSearchRow>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("search_payments", commonArgs(query));
  if (error) throw new Error(`Could not search payments: ${error.message}`);
  const raw = data ?? [];
  return {
    source: "payments",
    total: totalOf(raw),
    page: query.page,
    pageSize: query.pageSize,
    emptyMessage: EMPTY_STATE_MESSAGE,
    rows: raw.map((r) => ({
      id: r.id,
      dealId: r.deal_id,
      paymentDate: r.payment_date,
      dealCode: r.deal_code,
      clientName: r.client_name,
      propertyDetails: r.property_details,
      gross: r.gross,
      netOfVat: r.net_of_vat,
      netCash: r.net_cash,
      yearPaid: r.year_paid,
      archived: r.archived,
    })),
  };
}

/**
 * One entry point that runs the correct source query (Rule 2 — one source at a
 * time). The applicable-filter matrix is already resolved in `parseSearchQuery`;
 * here we only route.
 */
export async function runSearch(
  query: SearchQuery,
  client?: SupabaseClient
): Promise<SearchResult> {
  switch (query.source) {
    case "collectibles":
      return getCollectibleSearch(query, client);
    case "payments":
      return getPaymentSearch(query, client);
    case "deals":
    default:
      return getDealSearch(query, client);
  }
}

export { DEFAULT_PAGE_SIZE };
