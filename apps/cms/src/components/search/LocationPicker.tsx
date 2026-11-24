'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getAll, normaliseSuffixedKeys } from '@zeta/parity/search/params'

import type { AreaOption } from '@/lib/site/area-options'

/**
 * The live header search (respacio search form 1, `select[name="area_1[]"]` as a bootstrap-select):
 * a location picker. Unfiltered, it lists the municipalities (shown as "(City)"); typing reveals
 * matching barangays and developments under their municipality, which also stays listed when a
 * descendant matches (its data-tokens). Select All / Deselect all act on what is listed; "Search"
 * (or closing with a changed selection) runs the search.
 *
 * On /search_results/ the picker is part of the results filters (search-results.php:4258): the
 * other filters stay and the page resets. Elsewhere it starts a Sale search (property_for=1), as the
 * header form does. Typed text with nothing ticked runs the free-text search (q, FR-SR14 — E-class).
 */
export function LocationPicker({ options }: { options: AreaOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const onResults = pathname?.startsWith('/search_results') ?? false
  const current = useMemo(() => (onResults ? getAll(normaliseSuffixedKeys(new URLSearchParams(params?.toString())), 'area') : []), [params, onResults])

  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<string[]>(current)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Adopt the URL's selection when it changes (back/forward, chip removal). React-recommended
  // "adjust state during render" instead of an effect.
  const [seen, setSeen] = useState(current.join('|'))
  if (seen !== current.join('|')) {
    setSeen(current.join('|'))
    setSelected(current)
  }

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
  const visible = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (!t) return options.filter((o) => o.level === 'municipality')
    const hits = options.filter((o) => o.label.toLowerCase().includes(t))
    const keep = new Set(hits.map((o) => o.value))
    // A municipality stays listed when one of its barangays or developments matches.
    for (const o of hits) {
      let p = o.parent
      while (p) {
        const parent = byValue.get(p)
        if (parent?.level === 'municipality') keep.add(parent.value)
        p = parent?.parent ?? null
      }
    }
    return options.filter((o) => keep.has(o.value))
  }, [term, options, byValue])

  const apply = (values: string[], text?: string) => {
    const next = onResults ? normaliseSuffixedKeys(new URLSearchParams(params?.toString())) : new URLSearchParams({ property_for: '1' })
    next.delete('area')
    next.delete('area[]')
    next.delete('pageid')
    for (const v of values) next.append('area[]', v)
    if (text) next.set('q', text)
    setOpen(false)
    router.push(`/search_results/?${next.toString()}`)
  }
  const changed = selected.join('|') !== current.join('|')
  const close = (commit: boolean) => {
    if (commit && changed) apply(selected)
    else setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(true)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const toggle = (v: string) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
  const names = selected.map((v) => byValue.get(v)?.label).filter(Boolean)
  const summary = names.length === 0 ? 'Search a development, neighborhood, or city' : names.length <= 3 ? names.join(', ') : `${names.length} locations`
  const free = term.trim()

  return (
    <div className="location-picker" ref={rootRef} role="search">
      <button type="button" className={`picker-trigger${names.length ? ' has-value' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close(true) : setOpen(true))}>
        <SearchIcon />
        <span className="picker-summary">{summary}</span>
        <span className="picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="picker-panel" role="dialog" aria-label="Choose locations" onKeyDown={(e) => e.key === 'Escape' && close(false)}>
          <input
            ref={inputRef}
            type="search"
            className="picker-input"
            placeholder="Search e.g Cagayan de Oro..."
            aria-label="Filter locations"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (selected.length) apply(selected)
                else if (free) apply([], free)
              }
            }}
          />
          <div className="picker-bulk">
            <button type="button" onClick={() => setSelected((s) => [...new Set([...s, ...visible.map((o) => o.value)])])}>Select All</button>
            <button type="button" onClick={() => setSelected((s) => s.filter((v) => !visible.some((o) => o.value === v)))}>Deselect all</button>
          </div>
          <ul className="picker-list" aria-label="Locations">
            {visible.map((o) => (
              <li key={o.value} className={`picker-item level-${o.level}`}>
                <label>
                  <span className="picker-label">
                    {o.level === 'municipality' ? o.label : `- ${o.label}`}
                    {o.level === 'municipality' && <small>(City)</small>}
                  </span>
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="picker-empty">No location matches “{free}”.</li>}
          </ul>
          {free && selected.length === 0 && (
            <button type="button" className="picker-free" onClick={() => apply([], free)}>
              Search all listings for “{free}”
            </button>
          )}
          <button type="button" className="btn btn-dark picker-go" onClick={() => apply(selected)}>
            Search
          </button>
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
