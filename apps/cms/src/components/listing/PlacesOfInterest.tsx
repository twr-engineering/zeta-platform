'use client'

import { useState } from 'react'

/** BPM-020 row 39: the template's ten place filters, in its order. */
const CATEGORIES = ['Airport', 'Hospital', 'Bank', 'Shopping Mall', 'Local Government Office', 'Police', 'Fire Station', 'Primary School', 'Secondary School', 'University'] as const

export type Place = { label: string; name: string }

/**
 * Places of Interest: the ten filter buttons and the map are always shown; places come from the
 * CRM's nearest_location[] (empty in every recorded listing), filtered by the chosen category.
 */
export function PlacesOfInterest({ places, lat, lng, title }: { places: Place[]; lat: number | null; lng: number | null; title: string }) {
  const [active, setActive] = useState<string | null>(null)
  const shown = active ? places.filter((p) => p.label.toLowerCase().includes(active.toLowerCase())) : places
  return (
    <div className="lp-poi">
      <div className="lp-poi-filters" role="group" aria-label="Filter places">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={active === c} className={active === c ? 'is-on' : ''} onClick={() => setActive(active === c ? null : c)}>
            {c}
          </button>
        ))}
      </div>
      {lat !== null && lng !== null ? (
        <iframe
          className="lp-map"
          title={`Places near ${title}`}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.03},${lat - 0.018},${lng + 0.03},${lat + 0.018}&layer=mapnik&marker=${lat},${lng}`}
        />
      ) : (
        <div className="lp-map lp-map-empty" aria-hidden="true" />
      )}
      {shown.length > 0 && (
        <ul className="lp-places">
          {shown.map((p, i) => <li key={i}><strong>{p.label}</strong> {p.name}</li>)}
        </ul>
      )}
    </div>
  )
}
