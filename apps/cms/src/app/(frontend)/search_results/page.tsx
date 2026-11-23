import { headers } from 'next/headers'
import Link from 'next/link'

import { ListingCard } from '@/components/ListingCard'
import { Pending } from '@/components/Pending'
import { deviceType } from '@/lib/search/device'
import { parseSearch, type SearchModuleConfig } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { resolveMeasurement } from '@/lib/site/units'
import { getRates, payload } from '@/lib/site/payload'

/**
 * /search_results/ — FR-SR01..SR15. The URL and its query string are frozen.
 *
 * Server-rendered per request. Production is NOT: an uncached hit returns 271 bytes of JS that
 * appends `res_dev` and reloads (CD-15). Rendering on the server is an approved E-class change;
 * `res_dev` is accepted and ignored.
 */
export const dynamic = 'force-dynamic'

/**
 * The search page's own module config. priority_desc is the operative default on every
 * configured module in the corpus (BPM-002); price_desc is only the unreached fallback.
 * Page size (BPM-006a): page 6's search-results block stores property_per_page "12" and no phone
 * size, so phones get the block default 9.
 */
const MODULE: SearchModuleConfig = { sortby: 'priority_desc', propertyPerPage: 12 }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function toSp(raw: Record<string, string | string[] | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
    else if (v !== undefined) sp.append(k, v)
  }
  return sp
}

export default async function SearchResults({ searchParams }: Props) {
  const raw = await searchParams
  const sp = toSp(raw)
  const q = parseSearch(sp, { ...MODULE, device: deviceType((await headers()).get('user-agent')) })
  const [result, rates, currency, measurement] = await Promise.all([
    searchListings(await payload(), q),
    getRates(),
    resolveDisplayCurrency(raw.currency),
    resolveMeasurement(),
  ])

  // ?pageid={n} is the pagination form the site emits (BPM-013), preserved here.
  const pageHref = (n: number) => {
    const next = new URLSearchParams(sp)
    next.set('pageid', String(n))
    return `?${next.toString()}`
  }

  return (
    <section className="search">
      <h1>Search results</h1>
      <p className="search-count">{result.totalDocs} properties</p>
      {q.amount !== null && <Pending id="amount-filter">Qualified amount from the calculator: {q.amount}. Not yet applied as a filter.</Pending>}
      <Pending id="price-slider-plus">The filter panel (price slider, banded facets) is not built yet. The URL contract is.</Pending>
      <div className="grid">
        {result.docs.map((l) => (
          <ListingCard key={l.id} listing={l} rates={rates} currency={currency} measurement={measurement} />
        ))}
      </div>
      {result.totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={pageHref(n)} aria-current={n === result.page ? 'page' : undefined}>
              {n}
            </Link>
          ))}
        </nav>
      )}
    </section>
  )
}
