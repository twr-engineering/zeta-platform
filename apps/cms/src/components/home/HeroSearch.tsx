'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * FR-H02: the hero's Buy/Rent tabs and "All Locations" picker. Submits to /search_results/ with
 * property_for and the location's area[] value (municipality_{id} / city_{id}), the URL contract
 * the search page parses (BPM-004).
 */
export function HeroSearch({ locations }: { locations: { label: string; value: string }[] }) {
  const router = useRouter()
  const [propertyFor, setPropertyFor] = useState<'1' | '2'>('1')
  const [area, setArea] = useState('')
  const go = (nextArea = area) => {
    const sp = new URLSearchParams({ property_for: propertyFor })
    if (nextArea) sp.append('area[]', nextArea)
    router.push(`/search_results/?${sp.toString()}`)
  }
  return (
    <form
      className="hero-search"
      action="/search_results/"
      onSubmit={(e) => {
        e.preventDefault()
        go()
      }}
    >
      <div className="hero-tabs" role="tablist" aria-label="Buy or rent">
        {(
          [
            ['1', 'BUY'],
            ['2', 'RENT'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={propertyFor === v} className={propertyFor === v ? 'is-on' : ''} onClick={() => setPropertyFor(v)}>
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="property_for" value={propertyFor} />
      <label className="hero-field">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <span className="visually-hidden">Location</span>
        <select
          name="area[]"
          value={area}
          onChange={(e) => {
            setArea(e.target.value)
            go(e.target.value)
          }}
        >
          <option value="">All Locations</option>
          {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <noscript><button type="submit" className="btn btn-dark">Search</button></noscript>
    </form>
  )
}
