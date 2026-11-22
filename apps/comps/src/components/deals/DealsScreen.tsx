'use client'

import { useEffect } from 'react'

import { FilterBar } from '@/components/filters/FilterBar'
import { warmSearch } from '@/lib/filters'
import { useData } from '@/lib/store'

import { DealList } from './DealList'
import { DealsMap, MapLegend } from './DealsMap'

/** Closed deals (app PRD §7.1.1): map column (filter bar, map, footer) and the list column. */
export function DealsScreen() {
  const deals = useData((s) => s.deals)
  // Build the search text of every deal while the browser is idle, so the first keystroke does
  // not pay for 20,000 of them (NFR-002).
  useEffect(() => {
    const idle = typeof requestIdleCallback === 'function'
    const id = idle ? requestIdleCallback(() => warmSearch(deals)) : setTimeout(() => warmSearch(deals), 200)
    return () => (idle ? cancelIdleCallback(id as number) : clearTimeout(id as ReturnType<typeof setTimeout>))
  }, [deals])
  return (
    <div className="split">
      <div className="mapcol" id="mapcol">
        <FilterBar countSearch />
        <DealsMap />
        <div className="mapfoot">
          <MapLegend />
          <span className="hint" id="mapHint">
            Click an empty spot on the map to add a deal there.
          </span>
        </div>
      </div>
      <div className="listcol">
        <DealList />
      </div>
    </div>
  )
}
