'use client'

import type * as Leaflet from 'leaflet'

/**
 * The base map (app PRD §9.1), started in M3 for the add/edit pin map and finished in M5.
 * Plain Leaflet 1.9.4 created in an effect (never on the server), OpenStreetMap tiles from
 * the two env variables, metric scale, and the scroll and touch rules that keep the page
 * scrolling: wheel zoom only after the map is clicked or focused, one-finger pan only after
 * a tap on touch devices.
 */
export type L = typeof Leaflet

export const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
/** With nothing to show (§9.1). */
export const DEFAULT_VIEW = { center: [8.477, 124.647] as [number, number], zoom: 14 }

/** A theme color for canvas drawing, which cannot use var() (§9.1). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'

export const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function createZetaMap(L: L, el: HTMLElement, label: string): { map: Leaflet.Map; destroy: () => void } {
  el.tabIndex = 0
  el.setAttribute('aria-label', label)
  el.setAttribute('role', 'region')
  const touch = coarse()
  const map = L.map(el, { scrollWheelZoom: false, keyboard: true, dragging: !touch, tapHold: false, zoomSnap: 0.5 })
  // Canvas markers are not in the DOM: tests and debugging reach the map through its own element.
  ;(el as HTMLElement & { __map?: Leaflet.Map }).__map = map
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

  // Wheel zoom on while the map has focus or was clicked; off when focus or the click leaves it.
  const on = () => {
    map.scrollWheelZoom.enable()
    if (touch) map.dragging.enable()
  }
  const off = () => {
    map.scrollWheelZoom.disable()
    if (touch) map.dragging.disable()
  }
  const onDoc = (e: Event) => {
    if (!el.contains(e.target as Node)) off()
  }
  el.addEventListener('focus', on)
  el.addEventListener('pointerdown', on)
  el.addEventListener('focusout', (e) => {
    if (!el.contains((e as FocusEvent).relatedTarget as Node | null)) map.scrollWheelZoom.disable()
  })
  document.addEventListener('pointerdown', onDoc)
  const onScroll = () => {
    if (touch) map.dragging.disable()
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  const ro = new ResizeObserver(() => map.invalidateSize())
  ro.observe(el)

  return {
    map,
    destroy: () => {
      ro.disconnect()
      document.removeEventListener('pointerdown', onDoc)
      window.removeEventListener('scroll', onScroll)
      map.remove()
    },
  }
}

/** Hides labels that would overlap one already placed; `first` is placed before the rest (§9.3). */
export function declutter(labels: HTMLElement[], first?: HTMLElement | null) {
  const order = first ? [first, ...labels.filter((l) => l !== first)] : labels
  const placed: DOMRect[] = []
  for (const l of order) {
    l.style.visibility = 'visible'
    const r = l.getBoundingClientRect()
    if (placed.some((p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)) l.style.visibility = 'hidden'
    else placed.push(r)
  }
}
