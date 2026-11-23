'use client'

import 'leaflet/dist/leaflet.css'

import type * as Leaflet from 'leaflet'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { useConfirm } from '@/components/Confirm'
import { coarse, createZetaMap, cssVar, DEFAULT_VIEW, type L } from '@/components/map/zetaMap'
import { useToast } from '@/components/Toast'
import type { DealJSON, LocationJSON } from '@/lib/data'
import { nearName, refKey, suggestFor } from '@/lib/deals'
import { peso, pinText } from '@/lib/format'
import { kPerSqm, makeShader, typeColors } from '@/lib/mapColors'
import { pinOk } from '@/lib/settings'
import { metres } from '@/lib/stats'
import { draftHasText, emptyDraft, useData } from '@/lib/store'

import { useShownDeals } from './useShownDeals'

type LatLng = { lat: number; lng: number }
type Label = { name: string; n: number; pts: Leaflet.Point[]; muted: boolean }

/** Selected deal colors, the same in both themes (§9.2.2). */
const SEL_FILL = '#FEDD00'
const SEL_STROKE = '#000000'
const PIN_SVG =
  '<svg width="22" height="30" viewBox="-11 -28 22 30" aria-hidden="true"><path d="M0 0 l-9 -15 a10.5 10.5 0 1 1 18 0 z" fill="#FEDD00" stroke="#000" stroke-width="2"/><circle cx="0" cy="-21" r="3.5" fill="#000"/></svg>'

/**
 * The Closed deals map (app PRD §9.2): one canvas marker per visible deal, colored by type or
 * shaded by price, the selected deal on top with its "₱{k}k / sqm" tooltip, hover linked to
 * the list both ways, place labels that never overlap (R12), and "drop a pin to add a deal".
 */
export function DealsMap() {
  const router = useRouter()
  const toast = useToast()
  const ask = useConfirm()
  const status = useData((s) => s.status)
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const locations = useData((s) => s.locations)
  const selDeal = useData((s) => s.selDeal)
  const hovDeal = useData((s) => s.hovDeal)
  const { list, fType } = useMapView()

  const box = useRef<HTMLDivElement>(null)
  const st = useRef<{
    L: L
    map: Leaflet.Map
    layer: Leaflet.LayerGroup
    renderer: Leaflet.Canvas
    labels: HTMLDivElement
    markers: Map<number, Leaflet.CircleMarker>
    pin: Leaflet.Marker | null
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [lmap, setLmap] = useState<Leaflet.Map | null>(null)
  const [pin, setPin] = useState<LatLng | null>(null)
  const [, setTick] = useState(0)
  const [theme, setTheme] = useState(0)
  const live = useRef({ list, locations, onClick: (_: LatLng) => {} })

  const tc = useMemo(() => typeColors(deals, types), [deals, types])
  const sortedPps = useMemo(() => list.map((d) => d.pp).sort((a, b) => a - b), [list])
  const shade = !!fType
  const shader = useMemo(() => makeShader(sortedPps), [sortedPps])
  const colorOf = (d: DealJSON) => (shade ? shader(d.pp) : tc.color(refKey(d.type)))

  const wire = (m: Leaflet.CircleMarker, d: DealJSON) => {
    const { setHovDeal, setSelDeal } = useData.getState()
    m.on('mouseover', () => setHovDeal(d.id))
    m.on('mouseout', () => setHovDeal(null))
    m.on('click', (e) => {
      // A marker click selects (never toggles closed) and never drops a pin.
      st.current?.L.DomEvent.stopPropagation(e)
      setSelDeal(d.id)
      setTimeout(() => document.querySelector(`.drow[data-id="${d.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    })
  }

  // ----- place labels (§9.2.5, §9.2.6) -----
  const layoutLabels = () => {
    const s = st.current
    if (!s) return
    const { map, labels } = s
    const { list: l, locations: locs } = live.current
    labels.textContent = ''
    const size = map.getSize()
    let groups: Label[]
    if (l.length) {
      const by = new Map<string, Label>()
      for (const d of l) {
        const k = refKey(d.location)
        const g = by.get(k) ?? { name: d.location.name, n: 0, pts: [], muted: false }
        g.n++
        g.pts.push(map.latLngToContainerPoint([d.lat, d.lng]))
        by.set(k, g)
      }
      groups = [...by.values()].sort((a, b) => b.n - a.n)
    } else {
      groups = locs.map((p: LocationJSON) => ({ name: p.name, n: 0, pts: [map.latLngToContainerPoint([p.lat, p.lng])], muted: true }))
    }
    const placed: DOMRect[] = []
    for (const g of groups) {
      const el = document.createElement('span')
      el.className = 'mlab' + (g.muted ? ' muted' : '')
      el.textContent = g.name
      labels.appendChild(el)
      const w = el.offsetWidth
      const h = el.offsetHeight
      const meanX = g.pts.reduce((a, p) => a + p.x, 0) / g.pts.length
      const x = Math.max(6, Math.min(size.x - 6 - w, meanX - w / 2))
      const top = Math.min(...g.pts.map((p) => p.y))
      const low = Math.max(...g.pts.map((p) => p.y))
      const first = g.muted ? top - h / 2 : top - 10 - h
      const tries = g.muted ? [first] : [first, low + 10, first - (h + 4)]
      const spot = tries.find((y) => {
        const r = new DOMRect(x, y, w, h)
        return !placed.some((p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)
      })
      if (spot === undefined) {
        el.remove()
        continue
      }
      placed.push(new DOMRect(x, spot, w, h))
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(spot)}px)`
    }
  }

  // ----- create once -----
  useEffect(() => {
    let dead = false
    let destroy: (() => void) | null = null
    void import('leaflet').then((mod) => {
      if (dead || !box.current) return
      const Lf = (mod.default ?? mod) as L
      const made = createZetaMap(Lf, box.current, 'Map of closed deals')
      destroy = made.destroy
      const map = made.map
      map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom)
      const renderer = Lf.canvas()
      const layer = Lf.layerGroup().addTo(map)
      const labels = document.createElement('div')
      labels.className = 'maplabels'
      map.getContainer().appendChild(labels)
      st.current = { L: Lf, map, layer, renderer, labels, markers: new Map(), pin: null }
      map.on('click', (e: Leaflet.LeafletMouseEvent) => live.current.onClick({ lat: e.latlng.lat, lng: e.latlng.lng }))
      map.on('move zoom resize', () => {
        layoutLabels()
        setTick((t) => t + 1)
      })
      setReady(true)
      setLmap(map)
    })
    return () => {
      dead = true
      destroy?.()
      st.current = null
    }
  }, [])

  // Canvas colors come from the theme: redraw when it changes (§9.1).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => setTheme((t) => t + 1)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  // ----- markers -----
  const drawMarkers = (s: NonNullable<typeof st.current>) => {
    const { L: Lf, layer, renderer } = s
    layer.clearLayers()
    s.markers.clear()
    const big = coarse()
    const surface = cssVar('--surface')
    // One computed-style lookup per color token, not one per marker (NFR-002).
    const colors = new Map<string, string>()
    const color = (token: string) => colors.get(token) ?? (colors.set(token, cssVar(token)), colors.get(token)!)
    const sel = list.find((d) => d.id === selDeal) ?? null
    for (const d of list) {
      if (d.id === selDeal) continue
      const m = Lf.circleMarker([d.lat, d.lng], {
        renderer,
        radius: big ? 9 : 7,
        color: surface,
        weight: 1.5,
        fillColor: color(colorOf(d)),
        fillOpacity: shade ? 1 : 0.85,
        bubblingMouseEvents: false,
      })
      // Text built when the tooltip opens, not up front for every marker (NFR-002).
      m.bindTooltip(() => `${d.location.name}, ${peso(d.pp)} per sqm`, { direction: 'top', offset: [0, -6] })
      wire(m, d)
      m.addTo(layer)
      s.markers.set(d.id, m)
    }
    if (sel) {
      const m = Lf.circleMarker([sel.lat, sel.lng], { renderer, radius: big ? 11 : 9, color: SEL_STROKE, weight: 2, fillColor: SEL_FILL, fillOpacity: 1, bubblingMouseEvents: false })
      m.bindTooltip(kPerSqm(sel.pp), { permanent: true, direction: 'top', offset: [0, -12], className: 'seltip' })
      wire(m, sel)
      m.addTo(layer)
      s.markers.set(sel.id, m)
    }
    // One marker per visible deal (MAP-001, MAP-009), readable by tests.
    box.current?.setAttribute('data-markers', String(s.markers.size))
    layoutLabels()
  }

  useEffect(() => {
    const s = st.current
    if (!s || !ready) return
    live.current.list = list
    live.current.locations = locations
    // Rebuilt after the next paint: with thousands of deals this takes a few hundred ms on a phone,
    // and the list (and whatever else changed) must reach the screen first (NFR-002).
    return afterPaint(() => drawMarkers(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, list, selDeal, tc, shade, sortedPps, theme, locations])

  // Hovering a list row: its marker gets a 3 px --ink stroke.
  useEffect(() => {
    const s = st.current
    if (!s || hovDeal === null || hovDeal === selDeal) return
    const m = s.markers.get(hovDeal)
    if (!m) return
    m.setStyle({ color: cssVar('--ink'), weight: 3 })
    m.bringToFront()
    return () => {
      m.setStyle({ color: cssVar('--surface'), weight: 1.5 })
    }
  }, [hovDeal, selDeal, list, theme])

  // ----- view: fit the visible markers when the visible set changes (§9.1) -----
  const sig = list.map((d) => d.id).join(',')
  useEffect(() => {
    const s = st.current
    if (!s || !ready || status !== 'ready') return
    const pts: [number, number][] = list.length ? list.map((d) => [d.lat, d.lng]) : locations.map((l) => [l.lat, l.lng])
    // Instant: the view jumps with the filters instead of gliding, so labels and the pin card never lag.
    if (pts.length) s.map.fitBounds(s.L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig, status])

  // ----- drop a pin to add a deal (§9.2.7) -----
  useEffect(() => {
    live.current.onClick = (p: LatLng) => {
      if (!pinOk(p)) {
        toast('That spot is outside Cagayan de Oro.')
        return
      }
      setPin(p)
    }
  }, [toast])
  useEffect(() => {
    const s = st.current
    if (!s) return
    if (!pin) {
      if (s.pin) s.map.removeLayer(s.pin)
      s.pin = null
      return
    }
    if (!s.pin) {
      s.pin = s.L.marker([pin.lat, pin.lng], {
        interactive: false,
        keyboard: false,
        icon: s.L.divIcon({ className: 'droppin', html: PIN_SVG, iconSize: [22, 30], iconAnchor: [11, 28] }),
      }).addTo(s.map)
    } else s.pin.setLatLng([pin.lat, pin.lng])
  }, [pin])

  const startHere = () => {
    if (!pin) return
    const go = () => {
      const st0 = useData.getState()
      const h = suggestFor(pin, st0.locations, st0.deals, metres)
      st0.setDraft({ ...emptyDraft(), pin: pinText(pin.lat, pin.lng), loc: h.key, hint: h.hint, hintWarn: h.warn })
      setPin(null)
      router.push('/deals/new')
    }
    if (draftHasText(useData.getState().draft))
      ask('Start a new deal at this pin?', 'You have an unsaved deal in the add form. Starting here will clear it.', 'Start new deal', go)
    else go()
  }

  const msg = status !== 'ready' || list.length ? null : deals.length ? 'No closed deals match these filters.' : 'No closed deals yet. Click the map to add one.'

  return (
    <div className="mapwrap">
      <div ref={box} className="mapbox zmap dealmap canpin" id="dealMap" />
      {msg && (
        <div className="mapmsg" role="status">
          {msg}
        </div>
      )}
      {pin && lmap && <PinCard pin={pin} map={lmap} onClose={() => setPin(null)} onAdd={startHere} near={nearName(pin, locations, deals, metres)} />}
    </div>
  )
}

/** The pin card (§9.2.7): follows the pin; above it, or below when there is no room. */
function PinCard({ pin, map, near, onClose, onAdd }: { pin: LatLng; map: Leaflet.Map; near: string | null; onClose: () => void; onAdd: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const add = useRef<HTMLButtonElement>(null)
  const [h, setH] = useState(150)
  useEffect(() => {
    add.current?.focus({ preventScroll: true })
    if (ref.current) setH(ref.current.offsetHeight)
  }, [])
  const p = map.latLngToContainerPoint([pin.lat, pin.lng])
  const size = map.getSize()
  const W = 236
  const left = Math.max(8, Math.min(size.x - W - 8, p.x - W / 2))
  let top = p.y - 34 - h
  if (top < 8) top = p.y + 14
  top = Math.max(8, Math.min(size.y - h - 8, top))
  return (
    <div
      ref={ref}
      className="pincard"
      id="pinCard"
      role="dialog"
      aria-labelledby="pinT"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <button type="button" className="pinx" id="pinClose" aria-label="Remove the pin" onClick={onClose}>
        &times;
      </button>
      <strong id="pinT">New pin</strong>
      <span className="mono" id="pinXY">
        {pinText(pin.lat, pin.lng)}
      </span>
      <span className="pinnear" id="pinNear">
        {near ? `Near ${near}` : 'Not near a saved subdivision or area'}
      </span>
      <button ref={add} type="button" className="btn primary" id="pinAdd" onClick={onAdd}>
        + Add a deal here
      </button>
    </div>
  )
}

/** Run `fn` once the browser has painted the next frame; returns a cancel function. */
function afterPaint(fn: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  const raf = requestAnimationFrame(() => {
    t = setTimeout(fn, 0)
  })
  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(t)
  }
}

/**
 * The deals and type the map and legend draw, deferred as one snapshot: after a filter change the
 * list paints first and the map catches up in the next render, instead of rebuilding thousands of
 * markers before the screen can update (NFR-002). One snapshot, so the map never pairs a new list
 * with an old color mode or the reverse.
 */
function useMapView() {
  const { list } = useShownDeals()
  const fType = useData((s) => s.bar.fType)
  const now = useMemo(() => ({ list, fType }), [list, fType])
  return useDeferredValue(now)
}

/** The legend under the map (§9.2.4): type swatches, or the price shades for one type. */
export function MapLegend() {
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const { list, fType } = useMapView()
  const tc = useMemo(() => typeColors(deals, types), [deals, types])
  if (!list.length) return <div className="legend" id="mapLegend" />
  if (fType)
    return (
      <div className="legend" id="mapLegend">
        <span className="grad">
          Lower per sqm{' '}
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} style={{ background: `var(--s${i})` }} />
          ))}{' '}
          Higher
        </span>
      </div>
    )
  const visible = new Set(list.map((d) => refKey(d.type)))
  const names = new Map(list.map((d) => [refKey(d.type), d.type.name]))
  const grey = list.filter((d) => tc.color(refKey(d.type)) === '--muted')
  const greyTypes = new Set(grey.map((d) => refKey(d.type))).size
  return (
    <div className="legend" id="mapLegend">
      {tc.colored
        .filter((k) => visible.has(k))
        .map((k) => (
          <span key={k} className="k" style={{ ['--kc' as string]: `var(${tc.color(k)})` }}>
            {names.get(k)}
          </span>
        ))}
      {greyTypes > 0 && (
        <span className="k" style={{ ['--kc' as string]: 'var(--muted)' }}>
          {greyTypes} other type{greyTypes === 1 ? '' : 's'} ({grey.length} deal{grey.length === 1 ? '' : 's'}). Pick a type to see them alone.
        </span>
      )}
    </div>
  )
}
