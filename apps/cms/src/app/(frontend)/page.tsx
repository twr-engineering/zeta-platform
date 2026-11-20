import Link from 'next/link'

import { ListingCard } from '@/components/ListingCard'
import { parseSearch } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { getRates, payload } from '@/lib/site/payload'

export const dynamic = 'force-dynamic'

/** Placeholder home. The real home template is WP-03; this exercises the listing pipeline. */
export default async function HomePage() {
  const q = parseSearch(new URLSearchParams('property_for=1&property_per_page=8'), { sortby: 'priority_desc' })
  const [result, rates, currency] = await Promise.all([searchListings(await payload(), q), getRates(), resolveDisplayCurrency()])
  return (
    <section>
      <h1>Find your property</h1>
      <p>
        <Link href="/search_results/?property_for=1">Browse all {result.totalDocs} properties for sale →</Link>
      </p>
      <div className="grid">
        {result.docs.map((l) => (
          <ListingCard key={l.id} listing={l} rates={rates} currency={currency} />
        ))}
      </div>
    </section>
  )
}
