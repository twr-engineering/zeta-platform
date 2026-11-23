import Link from 'next/link'

import { displayArea, type Measurement } from '@zeta/parity/area'
import { cardCount, cardFloorArea, cardLotArea, cardRibbons } from '@zeta/parity/card'
import { formatPrice, type Rates } from '@/lib/price'
import { listingPath } from '@/lib/site/listing-path'
import type { Listing } from '@/payload-types'

type Props = { listing: Listing; rates: Rates; currency: string; measurement?: Measurement }

/**
 * Result card — live template "Custom Property Grid Template – 4" (customtemplates 276562):
 * image with marketing ribbons, price and a call button, the title (two lines), the type (sub-sub
 * type, else sub type), then bedrooms · bathrooms · {unit}.floor · {unit}.lot. Figures follow the
 * live page scripts (@zeta/parity/card); the unit follows the visitor's preference (FR-G05).
 */
export function ListingCard({ listing, rates, currency, measurement = 'metric' }: Props) {
  const image = listing.images?.[0]?.url
  const { price } = formatPrice(listing.price, listing.currencyCode ?? 'PHP', currency, rates)
  const payload = (listing.crmPayload ?? {}) as Record<string, unknown>
  // The template keys on the English labels (marketing_features_en; marketing_features is the same on this single-language site).
  const en = payload.marketing_features_en ?? payload.marketing_features
  const ribbons = cardRibbons(typeof en === 'string' ? en : null)
  const type = listing.subSubTypeName || listing.subTypeName
  const floor = displayArea(listing.builtSize, measurement)
  const lot = displayArea(listing.plotSize, measurement)
  const href = listingPath(listing)
  const priceLine = rentPriceLine(listing.propertyForId, price, listing.rentAmountPeriod)

  return (
    <article className="card">
      <Link href={href} className="card-link" aria-label={listing.propertyTitle ?? listing.referenceNo ?? 'Property'}>
        <figure className="card-media">
          {/* Respacio S3 originals; rebinding to Media is WP-10, so no next/image optimisation yet. */}
          {image ? <img src={image} alt="" loading="lazy" /> : <div className="card-noimg" />}
          {ribbons.length > 0 && (
            <div className="card-ribbons">{ribbons.map((r) => <span key={r} className="ribbon">{r}</span>)}</div>
          )}
        </figure>
      </Link>
      <div className="card-body">
        <div className="card-price-row">
          <p className="card-price">{priceLine}</p>
          <a className="card-call" href="#contact" aria-label="Call about this property">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </a>
        </div>
        <Link href={href} className="card-title">{listing.propertyTitle}</Link>
        <p className="card-type">{type}</p>
        <dl className="card-figures">
          <div><dt>bedrooms</dt><dd>{cardCount(listing.bedrooms)}</dd></div>
          <div><dt>bathrooms</dt><dd>{cardCount(listing.bathrooms)}</dd></div>
          <div><dt>{floor.unit}.floor</dt><dd>{cardFloorArea(floor.value)}</dd></div>
          <div><dt>{lot.unit}.lot</dt><dd>{cardLotArea(lot.value)}</dd></div>
        </dl>
      </div>
    </article>
  )
}

/** Template 276562 price lines: short rent (4) reads "From {price} {period}", long rent (5) "{price} {period}". */
function rentPriceLine(propertyForId: string | null | undefined, price: string, period: string | null | undefined) {
  if (propertyForId === '4') return `From ${price} ${period ?? ''}`.trim()
  if (propertyForId === '5') return `${price} ${period ?? ''}`.trim()
  return price
}
