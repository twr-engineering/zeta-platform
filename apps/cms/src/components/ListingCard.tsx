import Link from 'next/link'

import { formatPrice, type Rates } from '@/lib/price'
import { listingPath } from '@/lib/site/listing-path'
import type { Listing } from '@/payload-types'

export function ListingCard({ listing, rates, currency }: { listing: Listing; rates: Rates; currency: string }) {
  const image = listing.images?.[0]?.url
  const { price } = formatPrice(listing.price, listing.currencyCode ?? 'PHP', currency, rates)
  const place = [listing.geo?.cityName, listing.geo?.municipalityName].filter(Boolean).join(', ')
  return (
    <article className="card">
      <Link href={listingPath(listing)}>
        {/* Respacio S3 originals; rebinding to Media is WP-10, so no next/image optimisation yet. */}
        {image ? <img src={image} alt={listing.propertyTitle ?? listing.referenceNo ?? ''} loading="lazy" /> : <div className="card-noimg" />}
        <div className="card-body">
          <p className="card-price">{price}</p>
          <h3>{listing.propertyTitle}</h3>
          <p className="card-meta">
            {place}
            {listing.bedrooms ? ` · ${listing.bedrooms} bd` : ''}
            {listing.bathrooms ? ` · ${listing.bathrooms} ba` : ''}
            {listing.builtSize ? ` · ${listing.builtSize} ${listing.areaUnit ?? 'm²'}` : ''}
          </p>
          <p className="card-ref">{listing.referenceNo}</p>
        </div>
      </Link>
    </article>
  )
}
