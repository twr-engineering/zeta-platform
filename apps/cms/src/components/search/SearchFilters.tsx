'use client'

import { usePathname, useRouter } from 'next/navigation'
import { startTransition, useEffect, useOptimistic, useRef, useState, type ReactNode } from 'react'

import {
  FORECLOSED,
  LOT_TYPES,
  PAYMENT_TERMS,
  PRICE_ABOVE,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_STEP,
  PROPERTY_FOR,
  PROPERTY_TYPES,
  PROPERTY_VIEWS,
  ROOM_OPTIONS,
  SALES_DETAILS,
  SORT_OPTIONS,
  STOREYS,
  toggleType,
  withParam,
  type Opt,
} from '@zeta/parity/search/form'
import { getAll } from '@zeta/parity/search/params'
import type { FacetCounts } from '@/lib/search/query'
import { setPreferences } from '@/lib/site/preferences'

type Props = { query: string; total: number; currencies: readonly string[]; currency: string; counts: FacetCounts }

/**
 * WP-04 filter bar — the live /search_results/ controls and the exact URLs they write (BPM-021).
 * Production refreshes the grid by AJAX + pushState; here each change navigates to the same URL
 * and the server renders it (an E-class change: same URL, same results, linkable, no JS needed
 * to read it). Every control resets pageid to 1, as the live handlers do.
 */
export function SearchFilters({ query, total, currencies, currency, counts }: Props) {
  const router = useRouter()
  const path = usePathname()
  // The URL is the state; it is shown optimistically while the server renders the new results.
  const [shown, setShown] = useOptimistic(query)
  const sp = new URLSearchParams(shown)
  const go = (next: URLSearchParams) =>
    startTransition(() => {
      setShown(next.toString())
      router.push(`${path}?${next.toString()}`, { scroll: false })
    })
  const set = (key: string, v: string | string[] | null) => go(withParam(sp, key, v))

  const propertyFor = sp.get('property_for') ?? '1'
  const types = getAll(sp, 'type')
  const fa = getAll(sp, 'fa')
  const minBed = sp.get('min_bedroom')
  const minBath = sp.get('min_bathroom')
  const sort = sp.get('sortby')
  const moreCount =
    getAll(sp, 'sale_detail_type').length + fa.length + getAll(sp, 'payment_terms').length + getAll(sp, 'min_storey').length +
    ['min_plot_size', 'max_plot_size', 'min_total_built_size', 'max_total_built_size', 'min_built_year', 'max_built_year'].filter((k) => sp.get(k)).length

  // fa[] is one key shared by three selects; keep the other groups' values when one group changes.
  const setFaGroup = (group: Opt[], values: string[]) => {
    const others = fa.filter((v) => !group.some((o) => o.value === v))
    set('fa', [...others, ...values])
  }

  return (
    <div className="filters" role="search" aria-label="Filter properties">
      <div className="filter-bar">
        <Popover label="More Filters" badge={moreCount} wide>
          {(close) => (
            <div className="more-filters">
              <h3 className="more-title">More filters</h3>
              <CheckGroup legend="Sales Details" options={SALES_DETAILS} counts={counts.saleDetail} selected={getAll(sp, 'sale_detail_type')} onChange={(v) => set('sale_detail_type', v)} />
              <CheckGroup legend="Property View" options={PROPERTY_VIEWS} selected={fa} onChange={(v) => setFaGroup(PROPERTY_VIEWS, v.filter((x) => PROPERTY_VIEWS.some((o) => o.value === x)))} />
              <CheckGroup legend="Lot Type" options={LOT_TYPES} selected={fa} onChange={(v) => setFaGroup(LOT_TYPES, v.filter((x) => LOT_TYPES.some((o) => o.value === x)))} />
              <CheckGroup legend="Payment Term" options={PAYMENT_TERMS} selected={getAll(sp, 'payment_terms')} onChange={(v) => set('payment_terms', v)} />
              <MinMax legend="Lot Area" sp={sp} keys={['min_plot_size', 'max_plot_size']} go={go} />
              <MinMax legend="Floor Area" sp={sp} keys={['min_total_built_size', 'max_total_built_size']} go={go} />
              <MinMax legend="Year Built" sp={sp} keys={['min_built_year', 'max_built_year']} go={go} />
              <Choice legend="Storey" options={STOREYS} value={getAll(sp, 'min_storey')[0] ?? null} onChange={(v) => set('min_storey', v === null ? null : [v])} />
              <Choice legend="Is Foreclosed?" options={FORECLOSED} value={FORECLOSED.find((o) => fa.includes(o.value))?.value ?? null} onChange={(v) => setFaGroup(FORECLOSED, v ? [v] : [])} />
              <div className="more-actions">
                <button type="button" className="btn btn-soft" onClick={() => go(onlyPropertyFor(sp))}>Clear filters</button>
                <button type="button" className="btn btn-dark" onClick={close}>Show {total} results</button>
              </div>
            </div>
          )}
        </Popover>

        <Popover label={PROPERTY_FOR.find((o) => o.value === propertyFor)?.label ?? 'Sale'} badge={1} active>
          {(close) => (
            <ul className="opt-list" role="listbox" aria-label="Listing type">
              {PROPERTY_FOR.map((o) => (
                <li key={o.value}>
                  <button type="button" role="option" aria-selected={o.value === propertyFor} className={`opt${!counts.propertyFor[o.value] ? ' is-zero' : ''}`} onClick={() => { set('property_for', o.value); close() }}>{o.label}<Count n={counts.propertyFor[o.value]} /></button>
                </li>
              ))}
            </ul>
          )}
        </Popover>

        <Popover label="Property Type" badge={types.length}>
          {() => (
            <div className="type-tree">
              {PROPERTY_TYPES.map((b) => (
                <fieldset key={b.branch}>
                  <legend>{b.branch}</legend>
                  {b.types.map((t) => {
                    const parentOn = types.includes(t.value)
                    return (
                      <div key={t.value} className="type-node">
                        <label className={`check${!counts.type[t.value] ? ' is-zero' : ''}`}><input type="checkbox" checked={parentOn} onChange={() => set('type', toggleType(types, t.value))} />{t.label}<Count n={counts.type[t.value]} /></label>
                        {t.children.map((c) => (
                          // A sub-sub option is disabled until its parent is ticked (search-form.php:1340–1347).
                          <label key={c.value} className={`check child${!parentOn && !types.includes(c.value) ? ' is-disabled' : ''}${!counts.type[c.value] ? ' is-zero' : ''}`}>
                            <input type="checkbox" checked={types.includes(c.value)} disabled={!parentOn && !types.includes(c.value)} onChange={() => set('type', toggleType(types, c.value))} />
                            {c.label}
                            <Count n={counts.type[c.value]} />
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </fieldset>
              ))}
            </div>
          )}
        </Popover>

        <RoomPopover label="Bedrooms" value={minBed} counts={counts.bedrooms} onChange={(v) => set('min_bedroom', v)} />
        <RoomPopover label="Bathrooms" value={minBath} counts={counts.bathrooms} onChange={(v) => set('min_bathroom', v)} />
        <Popover label="Price" badge={sp.get('min_price') || sp.get('max_price') ? 1 : 0}>
          {() => <PricePanel sp={sp} go={go} />}
        </Popover>

        <div className="filter-bar-end">
          <button type="button" className="btn btn-soft" onClick={() => go(onlyPropertyFor(sp))}>Clear Filters</button>
        </div>
      </div>

      <div className="results-head">
        <p className="results-count" aria-live="polite">{rangeLabel(sp, total)}</p>
        <div className="results-tools">
          <label className="tool">
            <span>Order By</span>
            <select value={sort ?? ''} onChange={(e) => set('sortby', e.target.value || null)}>
              {/* Live shows "Newest" here while the results are priority-ordered (CD-30); labelled honestly. */}
              <option value="">Featured</option>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="tool">
            <span>Per page</span>
            {/* FR-SR11: 12 or 24 (?property_per_page, honoured by the live plugin, BPM-006). */}
            <select value={sp.get('property_per_page') === '24' ? '24' : '12'} onChange={(e) => set('property_per_page', e.target.value === '12' ? null : e.target.value)}>
              <option value="12">12</option>
              <option value="24">24</option>
            </select>
          </label>
          <label className="tool">
            <span>Currency</span>
            <select
              className="pill-dark"
              value={currency}
              onChange={async (e) => {
                // Live: sets the form_displaycurrency cookie, then reloads (BPM-008).
                const fd = new FormData()
                fd.set('currency', e.target.value)
                await setPreferences(fd)
                router.refresh()
              }}
            >
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

/** "1-12 of 487 Property" (the live counter). */
function rangeLabel(sp: URLSearchParams, total: number) {
  if (!total) return '0 Property'
  const per = Number(sp.get('property_per_page')) || 12
  const page = Math.max(1, Number(sp.get('pageid')) || 1)
  const from = (page - 1) * per + 1
  return `${from}-${Math.min(total, page * per)} of ${total} Property`
}

/** Clear: back to the listing type alone (the live panel resets to the module query). */
function onlyPropertyFor(sp: URLSearchParams) {
  const next = new URLSearchParams()
  const pf = sp.get('property_for')
  if (pf) next.set('property_for', pf)
  return next
}

function Popover({ label, badge = 0, active, wide, children }: { label: string; badge?: number; active?: boolean; wide?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className={`pop${wide ? ' is-wide' : ''}`} ref={ref}>
      <button type="button" className={`pill${active || badge ? ' is-on' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        {badge > 0 && <span className="pill-badge">{badge}</span>}
        <span className="caret" aria-hidden="true" />
      </button>
      {open && <div className="pop-panel">{children(() => setOpen(false))}</div>}
    </div>
  )
}

function RoomPopover({ label, value, counts, onChange }: { label: string; value: string | null; counts: Record<string, number>; onChange: (v: string | null) => void }) {
  return (
    <Popover label={value ? `${label} ${value}+`.replace('++', '+') : label} badge={value ? 1 : 0}>
      {(close) => (
        <ul className="opt-list" role="listbox" aria-label={label}>
          <li><button type="button" role="option" aria-selected={!value} className="opt" onClick={() => { onChange(null); close() }}>{label}</button></li>
          {ROOM_OPTIONS.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={value === o.value} className={`opt${!counts[o.value] ? ' is-zero' : ''}`} onClick={() => { onChange(o.value); close() }}>{o.label}+<Count n={counts[o.value]} /></button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}

function CheckGroup({ legend, options, selected, onChange, counts }: { legend: string; options: Opt[]; selected: string[]; onChange: (v: string[]) => void; counts?: Record<string, number> }) {
  return (
    <fieldset className="check-group">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={`check${counts && !counts[o.value] ? ' is-zero' : ''}`}>
          <input type="checkbox" checked={selected.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))} />
          {o.label}
          {counts && <Count n={counts[o.value]} />}
        </label>
      ))}
    </fieldset>
  )
}

function Choice({ legend, options, value, onChange }: { legend: string; options: Opt[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="choice-row">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} className={`choice-btn${value === o.value ? ' is-on' : ''}`} onClick={() => onChange(value === o.value ? null : o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Free-text min/max boxes; applied on Enter or when the box loses focus (live: 100 ms after typing). */
function MinMax({ legend, sp, keys, go }: { legend: string; sp: URLSearchParams; keys: [string, string]; go: (s: URLSearchParams) => void }) {
  const apply = (key: string, v: string) => {
    if ((sp.get(key) ?? '') === v) return
    go(withParam(sp, key, v || null))
  }
  return (
    <fieldset className="minmax">
      <legend>{legend}</legend>
      {keys.map((k, i) => (
        <input
          key={k}
          className="field"
          inputMode="numeric"
          aria-label={`${legend} ${i ? 'max' : 'min'}`}
          placeholder={i ? 'Max' : 'Min'}
          defaultValue={sp.get(k) ?? ''}
          onBlur={(e) => apply(k, e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && apply(k, (e.target as HTMLInputElement).value.trim())}
        />
      ))}
    </fieldset>
  )
}

/** FR-SR04: dual-handle slider with number boxes as the accessible alternative; the "above" box (BPM-021). */
function PricePanel({ sp, go }: { sp: URLSearchParams; go: (s: URLSearchParams) => void }) {
  const above = sp.get('min_price') === String(PRICE_ABOVE.min) && sp.get('max_price') === String(PRICE_ABOVE.max)
  const [lo, setLo] = useState(Number(sp.get('min_price')) || PRICE_MIN)
  const [hi, setHi] = useState(above ? PRICE_MAX : Number(sp.get('max_price')) || PRICE_MAX)
  const apply = (a: number, b: number) => {
    let next = withParam(sp, 'price', '')
    next = withParam(next, 'min_price', String(Math.min(a, b)))
    go(withParam(next, 'max_price', String(Math.max(a, b))))
  }
  const fmt = (n: number) => `₱${n.toLocaleString('en-US')}`
  return (
    <div className="price-panel">
      <h3>Price</h3>
      <div className="price-values"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
      <div className="dual-range">
        <input type="range" aria-label="Minimum price" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={lo} disabled={above} onChange={(e) => setLo(Math.min(Number(e.target.value), hi))} onPointerUp={() => apply(lo, hi)} onKeyUp={() => apply(lo, hi)} />
        <input type="range" aria-label="Maximum price" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={hi} disabled={above} onChange={(e) => setHi(Math.max(Number(e.target.value), lo))} onPointerUp={() => apply(lo, hi)} onKeyUp={() => apply(lo, hi)} />
      </div>
      <div className="price-boxes">
        <input className="field" inputMode="numeric" aria-label="Minimum price, pesos" value={lo} disabled={above} onChange={(e) => setLo(Number(e.target.value.replace(/\D/g, '')) || PRICE_MIN)} onBlur={() => apply(lo, hi)} />
        <input className="field" inputMode="numeric" aria-label="Maximum price, pesos" value={hi} disabled={above} onChange={(e) => setHi(Number(e.target.value.replace(/\D/g, '')) || PRICE_MAX)} onBlur={() => apply(lo, hi)} />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={above}
          onChange={(e) => (e.target.checked ? apply(PRICE_ABOVE.min, PRICE_ABOVE.max) : go(withParam(withParam(sp, 'min_price', null), 'max_price', null)))}
        />
        Show Properties Above {fmt(PRICE_MAX)}+
      </label>
    </div>
  )
}

/** FR-SR08: the option's live count; zero is shown, and the option de-emphasised, not hidden. */
function Count({ n }: { n?: number }) {
  return <span className="opt-count">({n ?? 0})</span>
}
