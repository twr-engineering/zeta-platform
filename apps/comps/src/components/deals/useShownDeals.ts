'use client'

import { useMemo } from 'react'

import { filtered, searched } from '@/lib/filters'
import { manilaISO } from '@/lib/format'
import { useData } from '@/lib/store'

/** The deals Closed deals shows: the bar and sheet, then the search (§7.1.3). Map and list share it. */
export function useShownDeals() {
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const bar = useData((s) => s.bar)
  const query = useData((s) => s.query)
  return useMemo(() => {
    const inFilters = filtered(deals, bar, types, manilaISO())
    return { inFilters, list: searched(inFilters, query.trim()) }
  }, [deals, types, bar, query])
}
