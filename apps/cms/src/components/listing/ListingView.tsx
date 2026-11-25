import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ListingCard } from '@/components/ListingCard'
import { Pending } from '@/components/Pending'
import { displayArea } from '@zeta/parity/area'
import { cardRibbons } from '@zeta/parity/card'
import { attributeRows, featureList, newDevelopmentDescription, priceHistoryRows, similarPriceBounds } from '@zeta/parity/listing'
import { pending } from '@/lib/parity/pending'
import { formatPrice } from '@/lib/price'
import { deviceType } from '@/lib/search/device'
import { parseSearch } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { listingPath } from '@/lib/site/listing-path'
import { getSiteSettings } from '@/lib/site/settings'
import { getRates, payload } from '@/lib/site/payload'
import { resolveMeasurement } from '@/lib/site/units'
import type { Listing, Media } from '@/payload-types'

import { BackLink } from './BackLink'
import { ListingGallery } from './ListingGallery'
import { PaymentCalculator } from './PaymentCalculator'
import { PlacesOfInterest } from './PlacesOfInterest'
import { ShareButton } from './ShareButton'

type View = 'r' | 'long-term'
type Raw = Record<string, unknown>

export async function findListing(ref: string) {
  const { docs } = await (await payload()).find({ collection: 'listings', where: { referenceNo: { equals: ref } }, limit: 1, depth: 0 })
  return docs[0] ?? null
}

/**
 * BPM-020 — the listing page (template 288102 "custom property view"), in its DOM order: header
 * (title, "for …", ribbons, price), essentials, sub-nav, gallery, media, breadcrumb line, overview,
 * features, location, property info, places of interest, price history, payment calculation,
 * similar properties, enquiry. Detail fields come from the CRM detail payload (crmPayload.view)
 * where the sync fetched it, else the list payload.
 */
export async function ListingView({ refNo, view, searchParams }: { refNo: string; view: View; searchParams: Record<string, string | string[] | undefined> }) {
  const listing = await findListing(refNo)
  if (!listing) notFound()
  if (listing.syncStatus === 'withdrawn') {
    pending('withdrawn-listing-url')
    notFound()
  }
  // BPM-007a (live check 2026-11-24): a listing under the other view page (a sale ref under
  // /long-term/, a rent ref under /r/) redirects to its canonical link. The source answers 302;
  // Next's server-component redirect is a 307 (also temporary). Query strings: src/proxy.ts.
  const canonical = listingPath(listing)
  if (canonical !== `/${view}/${listing.referenceNo}/`) redirect(canonical)
  pending('listing-defects')

  const payloadData = (listing.crmPayload ?? {}) as { list?: Raw; view?: Raw }
  const detail = (payloadData.view ?? {}) as Raw
  const pd = ((Array.isArray(detail.property_details) ? detail.property_details[0] : detail.property_details) ?? {}) as Raw
  const list = (payloadData.list ?? {}) as Raw
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
  const pick = (k: string) => str(pd[k]) ?? str(list[k])

  const p = await payload()
  const [rates, currency, measurement] = await Promise.all([getRates(), resolveDisplayCurrency(searchParams.currency), resolveMeasurement()])
  const { price } = formatPrice(listing.price, listing.currencyCode ?? 'PHP', currency, rates)
  const ribbons = cardRibbons(str(detail.marketing_feature_en as unknown) ?? str(list.marketing_features_en) ?? str(list.marketing_features))
  const photos = Array.isArray(detail.photos) ? (detail.photos as Raw[]).map((x) => str(x.big_image_path)).filter((u): u is string => !!u) : []
  const images = photos.length ? photos : (listing.images ?? []).map((i) => i.url)
  const videos = Array.isArray(detail.video) ? (detail.video as unknown[]).map((v) => (typeof v === 'string' ? v : str((v as Raw)?.url))).filter((u): u is string => !!u) : []
  const floorPlans = Array.isArray(detail.floor_plans) ? (detail.floor_plans as Raw[]).map((x) => str(x.big_image_path) ?? str(x.image_path)).filter((u): u is string => !!u) : []
  const tour = str(detail.iframe_url)
  const floor = displayArea(listing.builtSize, measurement)
  const lot = displayArea(listing.plotSize, measurement)
  const type = listing.subSubTypeName || listing.subTypeName || listing.typeName || 'Property'
  const crumbs = [listing.geo?.municipalityName, listing.geo?.cityName, listing.geo?.cityName ? listing.geo?.complexName : null, listing.referenceNo].filter(Boolean)
  const description = newDevelopmentDescription(listing.description ?? '', listing.saleDetailTypeId)
  const attributes = detail.attributes as Parameters<typeof attributeRows>[0]
  const features = featureList(attributes, detail.features as Parameters<typeof featureList>[1])
  const infoRows = attributeRows(attributes)
  const custom = (detail.custom_property_fields ?? {}) as Raw
  const history = priceHistoryRows(detail.price_history as Parameters<typeof priceHistoryRows>[0])
  const places = Array.isArray(detail.nearest_location) ? (detail.nearest_location as Raw[]).filter((n) => str(n.latitude as unknown) && str(n.longitude as unknown)) : []
  const lat = listing.geo?.latitude
  const lng = listing.geo?.longitude
  const fees = pick('community_fees_monthly') ? formatPrice(Number(pick('community_fees_monthly')), listing.currencyCode ?? 'PHP', currency, rates).price : null
  const rpt = pick('local_tax_yearly') ? formatPrice(Number(pick('local_tax_yearly')), listing.currencyCode ?? 'PHP', currency, rates).price : null

  // Similar properties (BPM-010): municipality + price ±40% + property_for; /r/ adds the sub-type,
  // 4 per page (3 on phones); /long-term/ has no sub-type filter, 3 per page.
  const device = deviceType((await headers()).get('user-agent'))
  const similarSp = new URLSearchParams({ property_for: listing.propertyForId ?? '1' })
  if (listing.price) {
    const { min, max } = similarPriceBounds(listing.price)
    similarSp.set('min_price', String(min))
    similarSp.set('max_price', String(max))
  }
  if (listing.geo?.municipalityId) similarSp.append('area[]', `municipality_${listing.geo.municipalityId}`)
  if (view === 'r' && listing.subTypeId) similarSp.append('type[]', `_st_${listing.subTypeId}`)
  const similar = await searchListings(
    p,
    parseSearch(similarSp, view === 'r' ? { propertyPerPage: 4, propertyPerPagePhone: 3, device } : { propertyPerPage: 3, propertyPerPagePhone: 3, device }),
    { referenceNo: { not_equals: listing.referenceNo } },
  )
  const similarDocs = similar.docs
  const agent = (await getSiteSettings()).listingAgent ?? {}
  const agentPhoto = agent.photo && typeof agent.photo === 'object' ? (agent.photo as Media) : null

  return (
    <article className="listing-page">
      <header className="lp-header">
        <div>
          <h1>{listing.propertyTitle}</h1>
          <div className="lp-ribbons">
            <span className="ribbon ribbon-plain">for {listing.propertyFor ?? 'Sale'}</span>
            {ribbons.map((r) => <span key={r} className="ribbon">{r}</span>)}
          </div>
          {/* CD-21: the live /long-term/ page shows no price; shown here (pending: listing-defects). */}
          <p className="lp-price">{listing.price ? price : 'POA'}{view === 'long-term' && listing.rentAmountPeriod ? ` ${listing.rentAmountPeriod}` : ''}</p>
          <ul className="lp-essentials">
            <li><strong>{listing.bedrooms || '-'}</strong> Beds</li>
            <li><strong>{listing.bathrooms || '-'}</strong> Baths</li>
            <li><strong>{lot.value || '-'}</strong> {lot.unit} lot</li>
            <li><strong>{floor.value || '-'}</strong> {floor.unit} floor</li>
          </ul>
        </div>
        <div className="lp-actions">
          {/* Row 10: [property_favourite] Save — favourites need the account area (BPM-014). */}
          <Link href="/my-account/" className="lp-save">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            Save
          </Link>
          <ShareButton title={listing.propertyTitle ?? listing.referenceNo ?? 'Property'} />
        </div>
      </header>

      <nav className="lp-subnav" aria-label="On this page">
        <BackLink />
        {[['#overview', 'Overview'], ['#features', 'Feature'], ['#location', 'Location'], ['#info', 'Property Info'], ['#places', 'Places of Interest'], ['#price-history', 'Price History'], ['#payment', 'Payment Calculation'], ['#similar', 'Similar properties']].map(([h, l]) => (
          <a key={h} href={h}>{l}</a>
        ))}
      </nav>

      <ListingGallery title={listing.propertyTitle ?? listing.referenceNo ?? 'Property'} images={images} floorPlans={floorPlans} videos={videos} tour={tour ?? null} />

      <p className="lp-crumbs">
        {/* CD-23: the live line reads "House in …" for every type; the real type is used. */}
        <strong>{type}</strong> in <Link href="/">Zeta Group</Link>{crumbs.map((c) => <span key={c}>, {c}</span>)}
      </p>

      <div className="lp-body">
        <div className="lp-main">
          <section id="overview" className="lp-section">
            <div className="lp-description">{description}</div>
          </section>

          <section id="features" className="lp-section">
            <h2>Features</h2>
            {features.length ? <ul className="lp-features">{features.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="empty-note">No features listed.</p>}
          </section>

          {lat && lng && (
            <section id="location" className="lp-section">
              <h2>Location</h2>
              <iframe
                className="lp-map"
                title={`Map of ${listing.propertyTitle ?? 'the property'}`}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.006},${lng + 0.01},${lat + 0.006}&layer=mapnik&marker=${lat},${lng}`}
              />
            </section>
          )}

          <section id="info" className="lp-section">
            <h2>Property Info</h2>
            <dl className="lp-info">
              <div><dt>Type</dt><dd>{listing.subTypeName ?? '-'}</dd></div>
              {listing.subSubTypeName && <div><dt>Subtype</dt><dd>{listing.subSubTypeName}</dd></div>}
              {/* CD-29: the live template reads property_custom_fields (always empty); custom_property_fields holds the data. */}
              {str(custom['payment terms']) && <div><dt>Payment Term</dt><dd>{str(custom['payment terms'])}</dd></div>}
              {str(custom['title status']) && <div><dt>Title Status</dt><dd>{str(custom['title status'])}</dd></div>}
              {listing.storeys ? <div><dt>Storey</dt><dd>{listing.storeys}</dd></div> : null}
              {fees && <div><dt>HOA/Condo fees</dt><dd>{fees}</dd></div>}
              {rpt && <div><dt>RPT(yearly)</dt><dd>{rpt}</dd></div>}
              {pick('custom_required_income') && <div><dt>Required Income</dt><dd>{pick('custom_required_income')}</dd></div>}
              {infoRows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.values.join(', ')}</dd></div>)}
              {/* CD-25: the live row reads attribute ids 113–119 and shows only with one media item; built_year is used. */}
              {listing.builtYear ? <div><dt>Year Built</dt><dd>{listing.builtYear}</dd></div> : null}
            </dl>
          </section>

          <section id="places" className="lp-section">
            <h2>Places of Interest</h2>
            <PlacesOfInterest
              title={listing.propertyTitle ?? 'the property'}
              lat={lat ?? null}
              lng={lng ?? null}
              places={places.map((pl) => ({ label: str(pl.label as unknown) ?? '', name: str(pl.location_name as unknown) ?? '' })).filter((pl) => pl.label || pl.name)}
            />
          </section>

          <section id="price-history" className="lp-section">
            <h2>Price History</h2>
            <table className="lp-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">Previous Price</th></tr></thead>
              <tbody>
                {history === null ? (
                  <tr><td colSpan={3}>Price history not found.</td></tr>
                ) : (
                  history.map((h, i) => (
                    <tr key={i}>
                      <td>{h.date}</td>
                      <td className={h.direction === 'down' ? 'is-down' : 'is-up'}>{h.direction === 'down' ? '▼' : '▲'} {h.percent}%</td>
                      <td>{h.previous}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {listing.price ? (
            <section id="payment" className="lp-section">
              <h2>Payment Calculation</h2>
              <PaymentCalculator price={listing.price} />
            </section>
          ) : null}

        </div>

        <aside className="lp-aside">
          <div className="lp-enquiry">
            {/* Row 42: the agent card (Site Settings → Listing agent), then the enquiry form. */}
            <div className="lp-agent">
              {agentPhoto?.url && <Image src={agentPhoto.url} alt="" width={72} height={72} className="lp-agent-photo" />}
              <div>
                <h2>{agent.heading || 'Speak to Alex'}</h2>
                {agent.licence && <p className="lp-agent-licence">{agent.licence}</p>}
                {agent.text && <p>{agent.text}</p>}
              </div>
            </div>
            <Pending id="contact-forms">The enquiry form (CF7 235756) waits for the live form list (OQ-17).</Pending>
          </div>
        </aside>
      </div>

      {similarDocs.length > 0 && (
        <section id="similar" className="lp-section">
          <h2>Similar properties</h2>
          <div className="grid">
            {similarDocs.map((l: Listing) => <ListingCard key={l.id} listing={l} rates={rates} currency={currency} measurement={measurement} />)}
          </div>
        </section>
      )}
    </article>
  )
}
