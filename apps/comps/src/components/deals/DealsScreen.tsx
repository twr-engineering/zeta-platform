'use client'

import { FilterBar } from '@/components/filters/FilterBar'

import { DealList } from './DealList'
import { DealsMap, MapLegend } from './DealsMap'

/** Closed deals (app PRD §7.1.1): map column (filter bar, map, footer) and the list column. */
export function DealsScreen() {
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
