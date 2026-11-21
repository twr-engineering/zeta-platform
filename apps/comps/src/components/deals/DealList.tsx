'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useDeleteDeal } from '@/components/deal/useDeleteDeal'
import { Icon } from '@/components/Icon'
import { LoadError } from '@/components/LoadState'
import { InfoButton } from '@/components/Tips'
import type { DealJSON } from '@/lib/data'
import { detailFields, gridCols, type Field } from '@/lib/details'
import { LIMIT, SORT_OPTS, confidence, filtered, isSplit, searched, sortList, typeInfoOf, type SortDir, type SortKey } from '@/lib/filters'
import { fmtDate, fmtMonth, manilaISO, peso, sqm } from '@/lib/format'
import { linkLabel } from '@/lib/listing'
import { median } from '@/lib/stats'
import { useData } from '@/lib/store'

/**
 * The Closed deals list column (app PRD §7.1.2–7.1.8): header with count, middle price and
 * sort; search with the "outside your filters" note; the deal table with sortable headers,
 * inline details and "Show all"; and the empty, loading and failure states.
 */
export function DealList() {
  const status = useData((s) => s.status)
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const bar = useData((s) => s.bar)
  const query = useData((s) => s.query)
  const sort = useData((s) => s.sort)
  const showAll = useData((s) => s.showAll)
  const selDeal = useData((s) => s.selDeal)
  const { setSort, setShowAll, setSelDeal, widenFilters, clearFilters } = useData.getState()

  const q = query.trim()
  const t = typeInfoOf(bar.fType, types)
  const split = isSplit(t, bar.fType)
  // Lot and floor sorts only exist in the split view; without it they become size (§7.1.2).
  const key: SortKey = !split && (sort.key === 'lot' || sort.key === 'floor') ? 'size' : sort.key
  useEffect(() => {
    if (key !== sort.key) setSort(key, sort.dir)
  }, [key, sort.key, sort.dir, setSort])

  const inFilters = filtered(deals, bar, types, manilaISO())
  const list = searched(inFilters, q)
  const everywhere = q ? searched(deals, q).length : 0
  const outside = everywhere - list.length
  const sorted = sortList(list, key, sort.dir)
  let limit = showAll ? sorted.length : LIMIT
  if (selDeal !== null) {
    const ix = sorted.findIndex((d) => d.id === selDeal)
    if (ix >= limit) limit = ix + 1
  }

  if (status === 'error') return <LoadError />
  if (status === 'loading')
    return (
      <>
        <div className="listhead">
          <div>
            <h2 id="listCount">Closed deals</h2>
          </div>
        </div>
        <div className="skelrows" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 64 }} />
          ))}
        </div>
      </>
    )

  const vals = list.map((d) => d.pp)
  const oneType = new Set(list.map((d) => `${d.type.id}|${d.type.name}`)).size === 1
  const conf = confidence(vals)

  return (
    <>
      <div className="listhead">
        <div>
          <h2 id="listCount">
            {list.length} closed deal{list.length === 1 ? '' : 's'}
            {q ? ' found' : ''}
          </h2>
          <p id="listSub">
            {!list.length ? null : !oneType ? (
              'Choose a property type to see the middle price per sqm.'
            ) : conf ? (
              <>
                Middle price <strong className="num">{peso(median(vals))}</strong> per sqm <InfoButton tip="middle" />
                {'  '}
                <span className={`pill conf-${conf.lvl.toLowerCase()}`}>{conf.lvl} confidence</span>
              </>
            ) : (
              `A middle price needs at least 5 deals. These filters have ${list.length}.`
            )}
          </p>
        </div>
        <label>
          <span className="srl">Sort</span>
          <select
            id="sortBy"
            value={`${key}:${sort.dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(':') as [SortKey, SortDir]
              setSort(k, d)
            }}
          >
            {SORT_OPTS.map((o) => (
              <option key={o.v} value={o.v} hidden={o.split && !split} disabled={o.split && !split}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SearchBox />

      {q && outside > 0 && (
        <p className="searchnote" id="searchNote">
          <span>
            {outside} more {outside === 1 ? 'deal matches' : 'deals match'} outside your filters.
          </span>
          <button type="button" className="link" id="searchAll" onClick={widenFilters}>
            Show {outside === 1 ? 'it' : 'them'}
          </button>
        </p>
      )}

      <div className={'dtable' + (split ? ' bysize' : '')} id="cards">
        {!sorted.length ? (
          <Empty q={q} anyDeals={deals.length > 0} anywhere={everywhere > 0} onClear={clearFilters} />
        ) : (
          <>
            <div className="dhead" role="row">
              <div>Property</div>
              {split ? (
                <>
                  <SortHead k="lot" label="Lot" right cur={key} dir={sort.dir} className="c-lot" />
                  <SortHead k="floor" label="Floor" right cur={key} dir={sort.dir} className="c-floor" />
                </>
              ) : (
                <SortHead k="size" label="Size" cur={key} dir={sort.dir} />
              )}
              <SortHead k="pp" label="Per sqm" right cur={key} dir={sort.dir} />
            </div>
            {sorted.slice(0, limit).map((d) => (
              <Row key={d.id} d={d} open={d.id === selDeal} onToggle={() => setSelDeal(d.id === selDeal ? null : d.id)} />
            ))}
          </>
        )}
      </div>
      {sorted.length > LIMIT && (
        <button className="btn" id="more" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${sorted.length} deals`}
        </button>
      )}
    </>
  )
}

/** The pill search box (§7.1.3): 120 ms debounce, Escape and × clear. */
function SearchBox() {
  const query = useData((s) => s.query)
  const setQuery = useData((s) => s.setQuery)
  const [text, setText] = useState(query)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = (v: string, now = false) => {
    if (timer.current) clearTimeout(timer.current)
    if (now) setQuery(v)
    else timer.current = setTimeout(() => setQuery(v), 120)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return (
    <div className="searchbox">
      <Icon name="search" />
      <label htmlFor="dSearch" className="srl">
        Search closed deals
      </label>
      <input
        ref={input}
        type="search"
        id="dSearch"
        placeholder="Search block and lot, code or place"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          run(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.preventDefault()
            setText('')
            run('', true)
          }
        }}
      />
      {text && (
        <button
          type="button"
          className="sx"
          id="dSearchX"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            run('', true)
            input.current?.focus()
          }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

function SortHead({ k, label, right, cur, dir, className }: { k: SortKey; label: string; right?: boolean; cur: SortKey; dir: SortDir; className?: string }) {
  const setSort = useData((s) => s.setSort)
  const on = cur === k
  const arrow = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={on && dir === 'asc' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  )
  return (
    <div className={[right ? 'r' : '', className ?? ''].join(' ').trim() || undefined}>
      <button
        type="button"
        className="sorth"
        data-sort={k}
        aria-pressed={on}
        aria-label={`Sort by ${label.toLowerCase()}${on ? (dir === 'asc' ? ', lowest first' : ', highest first') : ''}`}
        // Clicking the active header flips it; another header sorts by it, highest first.
        onClick={() => setSort(k, on ? (dir === 'asc' ? 'desc' : 'asc') : 'desc')}
      >
        {right ? (
          <>
            {arrow}
            {label}
          </>
        ) : (
          <>
            {label}
            {arrow}
          </>
        )}
      </button>
    </div>
  )
}

/** One deal row and, when open, its details (§7.1.4–7.1.5). */
function Row({ d, open, onToggle }: { d: DealJSON; open: boolean; onToggle: () => void }) {
  const f = d.type.form
  const blt = d.details || d.code || ''
  const words = blt.split(' ')
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }
  return (
    <div className="dwrap">
      <div
        className={'drow' + (open ? ' sel' : '')}
        data-id={d.id}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${d.location.name}${d.details ? ' ' + d.details : ''}, ${d.type.name}, sold ${fmtDate(d.date)}, ${peso(d.pp)} per sqm`}
        onClick={onToggle}
        onKeyDown={onKey}
      >
        <div className="c-prop">
          <span className="p1" title={d.location.name + (blt ? ` · ${blt}` : '')}>
            {d.location.name}
            {blt && (
              <span className="bl">
                {blt.length <= 14 ? (
                  <span className="nw">
                    <span className="dot">{'·'}</span>
                    {blt}
                  </span>
                ) : (
                  <>
                    <span className="nw">
                      <span className="dot">{'·'}</span>
                      {words[0]}
                    </span>{' '}
                    {words.slice(1).join(' ')}
                  </>
                )}
              </span>
            )}
          </span>
          <span className="p2">
            <span className="nw">{d.type.name}</span>
            <span className="nw">
              <span className="dot">{'·'}</span>
              {fmtMonth(d.date)}
            </span>
          </span>
        </div>
        <div className="c-size">
          {f === 'lot' ? (
            <span>{sqm(d.area)} lot</span>
          ) : f === 'condo' ? (
            <span>{sqm(d.area)} floor</span>
          ) : (
            <>
              {d.lotArea ? <span>{sqm(d.lotArea)} lot</span> : null}
              <span>{sqm(d.area)} floor</span>
            </>
          )}
        </div>
        <div className="c-lot r">{sqm(f === 'lot' ? d.area : d.lotArea)}</div>
        <div className="c-floor r">{f === 'lot' ? '–' : sqm(d.area)}</div>
        <div className="c-pp">{peso(d.pp)}</div>
      </div>
      {open && <Details d={d} />}
    </div>
  )
}

function Details({ d }: { d: DealJSON }) {
  const router = useRouter()
  const deleteDeal = useDeleteDeal()
  const fields = detailFields(d)
  return (
    <div className="ddetail">
      <dl className="kv dkv" style={{ ['--kvc' as string]: gridCols(fields.length) }}>
        {fields.map((x) => (
          <div key={x.label}>
            <dt>{x.label}</dt>
            <dd>
              <FieldValue f={x} />
            </dd>
          </div>
        ))}
      </dl>
      {d.note && (
        <div className="dnote">
          <span className="k">Notes</span>
          <p>{d.note}</p>
        </div>
      )}
      <div className="rowacts">
        <span className="samplenote" />
        <span className="rowbtns">
          <button type="button" className="btn sm" data-edit={d.id} onClick={() => router.push(`/deals/${d.id}/edit`)}>
            <Icon name="edit" />
            Edit deal
          </button>
          <button type="button" className="btn sm danger" data-del={d.id} onClick={() => deleteDeal(d)}>
            <Icon name="trash" />
            Delete
          </button>
        </span>
      </div>
    </div>
  )
}

function FieldValue({ f }: { f: Field }) {
  if (f.kind === 'text') return <>{f.value}</>
  if (f.kind === 'asking') {
    const g = f.gap
    return (
      <span className="gapv">
        <span>{f.value}</span>
        {g.kind === 'at' ? (
          <span className="vs at" title="Sold at the asking price">
            At asking
          </span>
        ) : (
          <span className={`vs ${g.kind}`} title={`Sold ${g.pct}% ${g.kind} asking`}>
            <span aria-hidden="true">{g.kind === 'below' ? '▼' : '▲'}</span>
            {g.pct}%<span className="srl"> {g.kind} asking</span>
          </span>
        )}
      </span>
    )
  }
  // The last word and the icon stay together, so the icon never sits alone on a new line (§8.8).
  const words = linkLabel(f.href).split(' ')
  const last = words.pop()
  return (
    <a className="link extlink" href={f.href} target="_blank" rel="noopener noreferrer">
      {words.length ? words.join(' ') + ' ' : ''}
      <span className="nw">
        {last}
        <Icon name="external" className="ext" />
      </span>
      <span className="srl"> (opens in a new tab)</span>
    </a>
  )
}

/** Empty states, first match wins (§7.1.7). Curly quotes around the query. */
function Empty({ q, anyDeals, anywhere, onClear }: { q: string; anyDeals: boolean; anywhere: boolean; onClear: () => void }) {
  const add = (
    <Link className="btn primary" href="/deals/new" style={{ marginTop: 8 }}>
      + Add a deal
    </Link>
  )
  if (!anyDeals)
    return (
      <div className="empty">
        <strong>No deals yet</strong>
        <span>Closed deals show up here and on the map.</span>
        {add}
      </div>
    )
  if (!q)
    return (
      <div className="empty">
        <strong>No matches</strong>
        <span>No closed deals match these filters.</span>
        <button type="button" className="btn" id="emptyClear" style={{ marginTop: 8 }} onClick={onClear}>
          Clear filters
        </button>
      </div>
    )
  return (
    <div className="empty">
      <strong>Nothing found</strong>
      <span>{anywhere ? `No deal matches “${q}” in these filters.` : `No deal matches “${q}”. If it is not saved yet, you can add it.`}</span>
      {!anywhere && add}
    </div>
  )
}
