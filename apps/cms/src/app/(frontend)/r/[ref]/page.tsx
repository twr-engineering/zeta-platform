import { notFound } from 'next/navigation'

import { Pending } from '@/components/Pending'
import { pending } from '@/lib/parity/pending'
import { formatPrice } from '@/lib/price'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { getRates, payload } from '@/lib/site/payload'

/**
 * Listing detail — /r/{reference_no}/ (BPM-007). Also mounted at /long-term/{ref}/.
 *
 * The rendered field set is PROVISIONAL (pending: listing-field-render-set): the 113-field
 * template transcription is not done, so this shows the obvious core and nothing more.
 */
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ ref: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props) {
  const { ref } = await params
  const { docs } = await (await payload()).find({ collection: 'listings', where: { referenceNo: { equals: ref } }, limit: 1, depth: 0 })
  const l = docs[0]
  return l ? { title: l.seo?.title || l.propertyTitle, description: l.seo?.description || l.shortDescription } : {}
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { ref } = await params
  const { docs } = await (await payload()).find({ collection: 'listings', where: { referenceNo: { equals: ref } }, limit: 1, depth: 0 })
  const listing = docs[0]
  if (!listing) notFound()
  if (listing.syncStatus === 'withdrawn') {
    pending('withdrawn-listing-url')
    notFound()
  }

  const [rates, currency] = await Promise.all([getRates(), resolveDisplayCurrency((await searchParams).currency)])
  const { price, alternates } = formatPrice(listing.price, listing.currencyCode ?? 'PHP', currency, rates)
  const place = [listing.geo?.cityName, listing.geo?.municipalityName, listing.geo?.provinceName].filter(Boolean).join(', ')

  return (
    <article className="listing">
      <Pending id="listing-field-render-set" />
      <div className="listing-gallery">
        {(listing.images ?? []).slice(0, 5).map((img, i) => (
          <img key={i} src={img.url} alt={`${listing.propertyTitle ?? ref} — photo ${i + 1}`} />
        ))}
      </div>
      <h1>{listing.propertyTitle}</h1>
      <p className="listing-price">{price}</p>
      {Object.keys(alternates).length > 0 && (
        <p className="listing-alt">{Object.values(alternates).join(' · ')}</p>
      )}
      <p className="listing-place">{place}</p>
      <dl className="listing-facts">
        <dt>Reference</dt><dd>{listing.referenceNo}</dd>
        <dt>Type</dt><dd>{listing.subTypeName}</dd>
        {listing.saleDetailType && (<><dt>Sale type</dt><dd>{listing.saleDetailType}</dd></>)}
        {listing.bedrooms != null && (<><dt>Bedrooms</dt><dd>{listing.bedrooms}</dd></>)}
        {listing.bathrooms != null && (<><dt>Bathrooms</dt><dd>{listing.bathrooms}</dd></>)}
        {listing.builtSize != null && (<><dt>Floor area</dt><dd>{listing.builtSize} {listing.areaUnit}</dd></>)}
        {listing.plotSize != null && (<><dt>Lot area</dt><dd>{listing.plotSize} {listing.areaUnit}</dd></>)}
      </dl>
      {listing.description && <div className="listing-description">{listing.description}</div>}
      {!!listing.features?.length && (
        <ul className="listing-features">{listing.features.map((f) => <li key={f.id}>{f.name}</li>)}</ul>
      )}
      <Pending id="contact-forms">Inquiry form for {listing.referenceNo}.</Pending>
    </article>
  )
}
