'use client'

import { filtered, searched } from '@/lib/filters'
import { manilaISO } from '@/lib/format'
import type { DealJSON } from '@/lib/data'
import { useData } from '@/lib/store'

type Shown = { inFilters: DealJSON[]; list: DealJSON[] }

/**
 * The deals Closed deals shows: the bar and sheet, then the search (§7.1.3). One cached result for
 * every component that needs it (list, map, legend, sheet), recomputed only when the deals, types,
 * filters, search or day change (NFR-002: with 20,000 deals this is the costly part).
 */
let cache: { deals: unknown; types: unknown; bar: unknown; query: string; today: string; out: Shown } | null = null

export function shownDeals(deals: DealJSON[], types: Parameters<typeof filtered>[2], bar: Parameters<typeof filtered>[1], query: string): Shown {
  const today = manilaISO()
  const q = query.trim()
  if (cache && cache.deals === deals && cache.types === types && cache.bar === bar && cache.query === q && cache.today === today) return cache.out
  const inFilters = filtered(deals, bar, types, today)
  const out = { inFilters, list: searched(inFilters, q) }
  cache = { deals, types, bar, query: q, today, out }
  return out
}

export function useShownDeals(): Shown {
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const bar = useData((s) => s.bar)
  const query = useData((s) => s.query)
  return shownDeals(deals, types, bar, query)
}
