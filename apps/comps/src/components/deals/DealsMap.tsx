'use client'

import 'leaflet/dist/leaflet.css'

import { useEffect, useRef } from 'react'

import { createZetaMap, DEFAULT_VIEW, type L } from '@/components/map/zetaMap'
import { useData } from '@/lib/store'

/**
 * The Closed deals map box (app PRD §9.2). M4: tiles only, fitted to the saved places, the
 * loading state of §7.1.7. M5 adds the deal markers, colors, legend, labels and the pin card.
 */
export function DealsMap() {
  const box = useRef<HTMLDivElement>(null)
  const locations = useData((s) => s.locations)
  const fitted = useRef(false)
  const st = useRef<{ L: L; map: import('leaflet').Map; destroy: () => void } | null>(null)

  useEffect(() => {
    let dead = false
    void import('leaflet').then((mod) => {
      if (dead || !box.current) return
      const Lf = (mod.default ?? mod) as L
      const made = createZetaMap(Lf, box.current, 'Map of closed deals')
      made.map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom)
      st.current = { L: Lf, map: made.map, destroy: made.destroy }
      fit()
    })
    return () => {
      dead = true
      st.current?.destroy()
      st.current = null
    }
  }, [])

  /** With no markers yet, fit all saved places' centers once they are loaded (§9.1). */
  function fit() {
    const s = st.current
    const locs = useData.getState().locations
    if (!s || fitted.current || !locs.length) return
    fitted.current = true
    s.map.fitBounds(s.L.latLngBounds(locs.map((l) => [l.lat, l.lng] as [number, number])), { padding: [40, 40], maxZoom: 17 })
  }
  useEffect(fit, [locations])

  return <div ref={box} className="mapbox zmap dealmap" id="dealMap" />
}
