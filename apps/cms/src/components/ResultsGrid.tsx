import Link from 'next/link'

import { ListingCard } from '@/components/ListingCard'
import type { Measurement } from '@zeta/parity/area'
import type { Rates } from '@/lib/price'
import type { Listing } from '@/payload-types'

type Props = {
  result: { docs: Listing[]; page?: number; totalPages: number }
  sp: URLSearchParams
  rates: Rates
  currency: string
  measurement: Measurement
}

/** The result grid and its ?pageid={n} pagination (BPM-013), shared by search and shortlist pages. */
export function ResultsGrid({ result, sp, rates, currency, measurement }: Props) {
  const pageHref = (n: number) => {
    const next = new URLSearchParams(sp)
    next.set('pageid', String(n))
    return `?${next.toString()}`
  }
  return (
    <>
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
    </>
  )
}
