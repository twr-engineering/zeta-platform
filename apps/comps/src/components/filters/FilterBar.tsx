'use client'

import { useMemo, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import { refKey } from '@/lib/deals'
import { DEFAULT_PERIOD, PERIODS, badgeCount, filtersOn } from '@/lib/filters'
import { CATEGORIES } from '@/lib/settings'
import { useData } from '@/lib/store'

import { FiltersSheet } from './FiltersSheet'

/**
 * The one filter bar for Closed deals and Market rates (app PRD §6.3): location, type and
 * period selects, the Filters button with its count, and "Clear filters". Values are refKeys,
 * so names not in Settings filter too (R10).
 */
export function FilterBar({ countSearch }: { countSearch: boolean }) {
  const bar = useData((s) => s.bar)
  const locations = useData((s) => s.locations)
  const types = useData((s) => s.types)
  const deals = useData((s) => s.deals)
  const setBarField = useData((s) => s.setBarField)
  const clearFilters = useData((s) => s.clearFilters)
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)

  const oddLocs = useMemo(() => [...new Set(deals.filter((d) => d.location.id === null).map((d) => d.location.name))].sort(), [deals])
  const oddTypes = useMemo(() => [...new Set(deals.filter((d) => d.type.id === null).map((d) => d.type.name))].sort(), [deals])
  const n = badgeCount(bar, types)
  const on = filtersOn(bar, types)

  return (
    <div className="pillbar" id="filterbar" role="group" aria-label="Filters">
      <label>
        <span className="srl">Subdivision or area</span>
        <select id="fLoc" className={bar.fLoc ? 'on' : undefined} value={bar.fLoc} onChange={(e) => setBarField('fLoc', e.target.value)}>
          <option value="">Any location</option>
          {(['Subdivision', 'Zone'] as const).map((k) => {
            const ls = locations.filter((l) => l.kind === k)
            return ls.length ? (
              <optgroup key={k} label={k === 'Subdivision' ? 'Subdivisions and projects' : 'Areas outside subdivisions'}>
                {ls.map((l) => (
                  <option key={l.id} value={refKey(l)}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
          {oddLocs.length > 0 && (
            <optgroup label="Not in Settings">
              {oddLocs.map((name) => (
                <option key={name} value={refKey({ id: null, name })}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        <span className="srl">Property type</span>
        <select id="fType" className={bar.fType ? 'on' : undefined} value={bar.fType} onChange={(e) => setBarField('fType', e.target.value)}>
          <option value="">Any type</option>
          {CATEGORIES.map((c) => {
            const ts = types.filter((t) => t.category === c)
            return ts.length ? (
              <optgroup key={c} label={c}>
                {ts.map((t) => (
                  <option key={t.id} value={refKey(t)}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
          {oddTypes.length > 0 && (
            <optgroup label="Not in Settings">
              {oddTypes.map((name) => (
                <option key={name} value={refKey({ id: null, name })}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        <span className="srl">Sold within</span>
        <select id="fPeriod" className={bar.fPeriod !== DEFAULT_PERIOD ? 'on' : undefined} value={bar.fPeriod} onChange={(e) => setBarField('fPeriod', e.target.value)}>
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <button
        ref={btn}
        className={'filterbtn' + (n ? ' on' : '')}
        id="fMore"
        type="button"
        aria-haspopup="dialog"
        aria-label={n ? `Filters, ${n} on` : 'Filters'}
        onClick={() => setOpen(true)}
      >
        <Icon name="filters" />
        <span>Filters</span>
        {n > 0 && (
          <span className="badge" id="fMoreN">
            {n}
          </span>
        )}
      </button>
      {on > 0 && (
        <button className="textbtn" id="fClear" type="button" onClick={clearFilters}>
          Clear filters
        </button>
      )}
      <FiltersSheet
        open={open}
        countSearch={countSearch}
        onClose={() => {
          setOpen(false)
          btn.current?.focus()
        }}
      />
    </div>
  )
}
