'use client'

import 'leaflet/dist/leaflet.css'

import type * as Leaflet from 'leaflet'
import { useEffect, useRef } from 'react'

import { createZetaMap, cssVar, declutter, DEFAULT_VIEW, type L } from './zetaMap'

export type LatLng = { lat: number; lng: number }
export type MapPlace = { id: number; name: string; lat: number; lng: number }

/**
 * The add/edit pin map (app PRD §9.3), also the Settings place dialog map in M5 (§9.5).
 * Saved places as faint squares with labels (the chosen one in --ink, its label placed
 * first), deals as faint canvas dots, and one draggable round pin. Click sets the pin;
 * drag end moves it; a pin set from outside pans into view if it is out of view.
 */
export function PinMap({
  pin,
  places,
  dots,
  chosenId,
  label,
  onPick,
  pinZoom,
}: {
  pin: LatLng | null
  places: MapPlace[]
  dots: LatLng[]
  chosenId: number | null
  label: string
  onPick: (p: LatLng) => void
  /** Start centered on the pin at this zoom when there is one (the Settings dialog map, §9.5). */
  pinZoom?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const st = useRef<{ L: L; map: Leaflet.Map; ctx: Leaflet.LayerGroup; pin: Leaflet.Marker | null; labels: HTMLElement[]; chosen: HTMLElement | null } | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  const initial = useRef({ pin, places, dots })

  // Create once; remove on unmount.
  useEffect(() => {
    let destroy: (() => void) | null = null
    let dead = false
    void import('leaflet').then((mod) => {
      if (dead || !box.current) return
      const Lf = (mod.default ?? mod) as L
      const made = createZetaMap(Lf, box.current, label)
      destroy = made.destroy
      const map = made.map
      const ctx = Lf.layerGroup().addTo(map)
      st.current = { L: Lf, map, ctx, pin: null, labels: [], chosen: null }
      map.on('click', (e: Leaflet.LeafletMouseEvent) => pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
      map.on('zoomend moveend', () => st.current && declutter(st.current.labels, st.current.chosen))
      const { pin: p0, places: pl, dots: d0 } = initial.current
      if (p0 && pinZoom) {
        map.setView([p0.lat, p0.lng], pinZoom)
        draw()
        setPin(p0, false)
        return
      }
      const pts: [number, number][] = [...pl.map((x) => [x.lat, x.lng] as [number, number]), ...d0.map((x) => [x.lat, x.lng] as [number, number])]
      if (p0) pts.push([p0.lat, p0.lng])
      if (pts.length) map.fitBounds(Lf.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 })
      else map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom)
      draw()
      setPin(initial.current.pin, false)
    })
    return () => {
      dead = true
      destroy?.()
      st.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draw() {
    const s = st.current
    if (!s) return
    const { L: Lf, ctx } = s
    ctx.clearLayers()
    const renderer = Lf.canvas()
    const muted = cssVar('--muted')
    for (const d of initial.current.dots) {
      Lf.circleMarker([d.lat, d.lng], { renderer, radius: 3.5, stroke: false, fillColor: muted, fillOpacity: 0.5, interactive: false }).addTo(ctx)
    }
    s.labels = []
    s.chosen = null
    for (const p of initial.current.places) {
      const chosen = p.id === chosenRef.current
      const el = document.createElement('div')
      el.className = 'mplace' + (chosen ? ' on' : '')
      const sq = document.createElement('i')
      const lab = document.createElement('span')
      lab.textContent = p.name
      el.append(lab, sq)
      Lf.marker([p.lat, p.lng], { icon: Lf.divIcon({ className: 'mplacei', html: el, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(ctx)
      s.labels.push(lab)
      if (chosen) s.chosen = lab
    }
    requestAnimationFrame(() => st.current && declutter(st.current.labels, st.current.chosen))
  }

  function setPin(p: LatLng | null, pan: boolean) {
    const s = st.current
    if (!s) return
    if (!p) {
      if (s.pin) s.map.removeLayer(s.pin)
      s.pin = null
      return
    }
    if (!s.pin) {
      s.pin = s.L.marker([p.lat, p.lng], {
        draggable: true,
        keyboard: false,
        icon: s.L.divIcon({ className: 'pinicon', html: '<span></span>', iconSize: [17, 17], iconAnchor: [8.5, 8.5] }),
      }).addTo(s.map)
      s.pin.on('dragend', () => {
        const ll = s.pin!.getLatLng()
        pick.current({ lat: ll.lat, lng: ll.lng })
      })
    } else s.pin.setLatLng([p.lat, p.lng])
    if (pan && !s.map.getBounds().contains([p.lat, p.lng])) s.map.panTo([p.lat, p.lng])
  }

  const chosenRef = useRef(chosenId)
  useEffect(() => {
    initial.current = { ...initial.current, places, dots }
    chosenRef.current = chosenId
    draw()
  }, [places, dots, chosenId])

  useEffect(() => {
    setPin(pin, true)
  }, [pin])

  // Canvas dots read the theme colors: redraw when the scheme changes (§9.1).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => draw()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  return <div ref={box} className="zmap pinmap pickable" data-testid="pinmap" />
}
