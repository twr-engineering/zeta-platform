import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Where } from 'payload'

import { ListingCard } from '@/components/ListingCard'
import { DirectoryGrid } from '@/components/directory/DirectoryGrid'
import { ListingTabs } from '@/components/location/ListingTabs'
import { GetInTouch } from '@/components/site/GetInTouch'
import { directoryGrid } from '@/lib/site/directory'
import { pending } from '@/lib/parity/pending'
import { deviceType } from '@/lib/search/device'
import { parseSearch } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { PRESELLING_TABS, RESALE_TABS, tabQuery, type LocationTab } from '@/lib/site/location-modules'
import { locationHref } from '@/lib/site/locations-menu'
import { getRates, payload } from '@/lib/site/payload'
import { resolveMeasurement } from '@/lib/site/units'
import type { Location, Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ path: string[] }> }

/** /location/{…path}/ — the frozen WordPress URL; the last segment is the slug, and the full path must match. */
async function findLocation(path: string[]) {
  const slug = path.at(-1)
  if (!slug) return null
  const { docs } = await (await payload()).find({ collection: 'locations', where: { slug: { equals: slug } }, depth: 1, limit: 5 })
  return docs.find((l) => locationHref(l) === `/location/${path.join('/')}/`) ?? null
}

export async function generateMetadata({ params }: Props) {
  const l = await findLocation((await params).path)
  return l ? { title: l.seo?.title || `Properties for sale in ${l.name}`, description: l.seo?.description || undefined } : {}
}

/**
 * BPM-017 location page. City-level pages (CRM municipality) filter area[]=municipality_{id};
 * barangay pages (CRM city) filter area[]=city_{id}. Unbound locations match by name meanwhile.
 */
export default async function LocationPage({ params }: Props) {
  const location = await findLocation((await params).path)
  if (!location) notFound()
  // Bound locations match listings by CRM id; most mirrored listings carry only names (the list
  // payload has no geography ids), so a name match is OR-ed in until the live sync fills the ids.
  const g = location.crmGeography
  const level = location.type === 'subdivision' ? 'complex' : location.type === 'barangay' ? 'town' : 'municipality'
  const ID = { complex: g?.complexId, town: g?.townId, municipality: g?.municipalityId }[level]
  const NAME = { complex: 'geo.complexName', town: 'geo.cityName', municipality: 'geo.municipalityName' }[level]
  const idMatch: Where | null = ID ? { [`geo.${level}Id`]: { equals: ID } } : null
  const nameMatch: Where = { [NAME]: { like: location.name.replace(/ City$/i, '') } }
  pending('location-counts')
  const byName: Where = idMatch ? { or: [idMatch, nameMatch] } : nameMatch
  const area: string | null = null
  pending('location-defects')

  const p = await payload()
  const device = deviceType((await headers()).get('user-agent'))
  const [rates, currency, measurement, children] = await Promise.all([
    getRates(),
    resolveDisplayCurrency(),
    resolveMeasurement(),
    p.find({ collection: 'locations', where: { parent: { equals: location.id } }, sort: 'name', depth: 0, limit: 200 }),
  ])
  const run = (saleDetail: '1' | '2', tab: LocationTab) => searchListings(p, parseSearch(tabQuery(saleDetail, area, tab), { propertyPerPage: 8, sortby: 'priority_desc', device }), byName)
  const [resale, preselling] = await Promise.all([Promise.all(RESALE_TABS.map((t) => run('1', t))), Promise.all(PRESELLING_TABS.map((t) => run('2', t)))])
  const panel = (docs: typeof resale[number]['docs']) =>
    docs.length ? (
      <div className="grid">{docs.map((l) => <ListingCard key={l.id} listing={l} rates={rates} currency={currency} measurement={measurement} />)}</div>
    ) : (
      <p className="empty-note">No properties here yet.</p>
    )
  const hero = location.heroImage && typeof location.heroImage === 'object' ? (location.heroImage as Media) : null

  return (
    <article className="location">
      <header className="page-hero">
        <div>
          <h1>{location.name}</h1>
          {level !== 'municipality' && (
            <p>There are {resale[0].totalDocs + preselling[0].totalDocs} property for sale in {location.name}</p>
          )}
        </div>
        {hero?.url && <Image src={hero.url} alt="" className="page-hero-image" width={hero.width ?? 1080} height={hero.height ?? 720} priority sizes="(max-width: 767px) 100vw, 560px" />}
      </header>

      <section className="home-section">
        <h2>Resale properties in {location.name}</h2>
        <ListingTabs label="Resale" tabs={RESALE_TABS.map((t, i) => ({ label: t.label, count: resale[i].totalDocs, panel: panel(resale[i].docs) }))} />
      </section>
      <section className="home-section">
        <h2>Pre-selling properties in {location.name}</h2>
        <ListingTabs label="Pre-selling" tabs={PRESELLING_TABS.map((t, i) => ({ label: t.label, count: preselling[i].totalDocs, panel: panel(preselling[i].docs) }))} />
      </section>

      {children.docs.length > 0 && (
        <section className="home-section">
          <h2>Explore Areas in {location.name}</h2>
          <ul className="area-list">
            {(children.docs as Location[]).map((c) => <li key={c.id}><Link href={locationHref(c)}>{c.name}</Link></li>)}
          </ul>
        </section>
      )}
      {level === 'complex' && (
        // BPM-019: "Complex Bottom" opens with the directory grid on every development page.
        <section className="home-section">
          <h2>Directory</h2>
          <DirectoryGrid data={await directoryGrid()} />
        </section>
      )}
      <GetInTouch />
    </article>
  )
}
