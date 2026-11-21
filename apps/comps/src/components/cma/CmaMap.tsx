'use client'

import 'leaflet/dist/leaflet.css'

import type * as Leaflet from 'leaflet'
import { useEffect, useRef, useState } from 'react'

import { createZetaMap, cssVar, type L } from '@/components/map/zetaMap'
import type { Near } from '@/lib/cma'
import { distanceLabel, peso } from '@/lib/format'

type LatLng = { lat: number; lng: number }

/**
 * The CMA map (app PRD §9.4): the draggable subject with "This property", the dashed search
 * circle and its half-distance circle with labels, comps inside the distance and "too far"
 * deals. Click or drag moves the subject. The view fits the circle after every change.
 */
export function CmaMap({ subject, radius, inside, tooFar, onMove }: { subject: LatLng; radius: number; inside: Near[]; tooFar: Near[]; onMove: (p: LatLng) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const st = useRef<{ L: L; map: Leaflet.Map; layer: Leaflet.LayerGroup; renderer: Leaflet.Canvas; subj: Leaflet.Marker; labels: HTMLDivElement } | null>(null)
  const move = useRef(onMove)
  const [ready, setReady] = useState(false)
  const [theme, setTheme] = useState(0)
  const live = useRef({ subject, radius })

  useEffect(() => {
    move.current = onMove
    live.current = { subject, radius }
  })

  // Distance labels at each circle's east edge, 4 px outside it and 4 px above the center line.
  const placeLabels = () => {
    const s = st.current
    if (!s) return
    const { subject: c, radius: r } = live.current
    s.labels.textContent = ''
    const center = s.map.latLngToContainerPoint([c.lat, c.lng])
    for (const [rr, text] of [
      [r, distanceLabel(r)],
      [r / 2, distanceLabel(r / 2)],
    ] as const) {
      const east = s.L.latLng(c.lat, c.lng).toBounds(rr * 2).getEast()
      const x = s.map.latLngToContainerPoint([c.lat, east]).x
      const el = document.createElement('span')
      el.className = 'mlab muted dist'
      el.textContent = text
      s.labels.appendChild(el)
      el.style.transform = `translate(${Math.round(x + 4)}px, ${Math.round(center.y - 4 - el.offsetHeight)}px)`
    }
  }

  useEffect(() => {
    let dead = false
    let destroy: (() => void) | null = null
    void import('leaflet').then((mod) => {
      if (dead || !box.current) return
      const Lf = (mod.default ?? mod) as L
      const made = createZetaMap(Lf, box.current, 'Closed deals around the property. Click to move the property.')
      destroy = made.destroy
      const map = made.map
      // The search circles sit in their own pane under the comp markers, so the fill never tints them.
      map.createPane('cmacircles').style.zIndex = '350'
      const layer = Lf.layerGroup().addTo(map)
      const labels = document.createElement('div')
      labels.className = 'maplabels'
      map.getContainer().appendChild(labels)
      const { subject: s0 } = live.current
      const subj = Lf.marker([s0.lat, s0.lng], {
        draggable: true,
        keyboard: false,
        zIndexOffset: 1000,
        icon: Lf.divIcon({ className: 'cmasubj', html: '<span class="dot"></span><span class="lab">This property</span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(map)
      subj.on('dragend', () => {
        const ll = subj.getLatLng()
        move.current({ lat: ll.lat, lng: ll.lng })
      })
      map.on('click', (e: Leaflet.LeafletMouseEvent) => move.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
      map.on('move zoom resize', () => placeLabels())
      st.current = { L: Lf, map, layer, renderer: Lf.canvas(), subj, labels }
      setReady(true)
    })
    return () => {
      dead = true
      destroy?.()
      st.current = null
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => setTheme((t) => t + 1)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    const s = st.current
    if (!s || !ready) return
    const { L: Lf, layer, renderer, map } = s
    layer.clearLayers()
    s.subj.setLatLng([subject.lat, subject.lng])
    Lf.circle([subject.lat, subject.lng], { radius, color: cssVar('--ink'), weight: 1.2, dashArray: '5 4', fillColor: cssVar('--hl'), fillOpacity: 0.6, interactive: false, pane: 'cmacircles' }).addTo(layer)
    Lf.circle([subject.lat, subject.lng], { radius: radius / 2, color: cssVar('--line'), weight: 1, fill: false, interactive: false, pane: 'cmacircles' }).addTo(layer)
    const tip = (x: Near) => `${x.d.location.name}, ${peso(x.d.pp)} per sqm, ${Math.round(x.dist)} m away`
    const surface = cssVar('--surface')
    for (const x of tooFar)
      Lf.circleMarker([x.d.lat, x.d.lng], { renderer, radius: 4.5, color: surface, weight: 1.5, fillColor: cssVar('--muted'), fillOpacity: 0.4 }).bindTooltip(tip(x)).addTo(layer)
    for (const x of inside)
      Lf.circleMarker([x.d.lat, x.d.lng], { renderer, radius: 6, color: surface, weight: 1.5, fillColor: cssVar('--mark'), fillOpacity: 0.9 }).bindTooltip(tip(x)).addTo(layer)
    box.current?.setAttribute('data-comps', String(inside.length))
    box.current?.setAttribute('data-toofar', String(tooFar.length))
    // Bounds from the center and radius: circle.getBounds() needs a map view, which the first draw does not have yet.
    map.fitBounds(Lf.latLng(subject.lat, subject.lng).toBounds(radius * 2), { animate: false })
    placeLabels()
  }, [ready, subject.lat, subject.lng, radius, inside, tooFar, theme])

  return <div ref={box} className="zmap cmamap pickable" id="map" />
}
