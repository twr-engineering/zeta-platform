import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Where } from 'payload'

import { ListingCard } from '@/components/ListingCard'
import { DirectoryGrid } from '@/components/directory/DirectoryGrid'
import { ListingTabs } from '@/components/location/ListingTabs'
import { ContentTabs } from '@/components/home/ContentTabs'
import { GuideTabs } from '@/components/location/GuideTabs'
import { ReadMore } from '@/components/location/ReadMore'
import { directoryGrid } from '@/lib/site/directory'
import { wpExcerpt } from '@/lib/site/excerpt'
import { locationExplore, type ExploreItem } from '@/lib/site/location-explore'
import { youtubeThumb } from '@/lib/site/youtube'
import { pending } from '@/lib/parity/pending'
import { deviceType } from '@/lib/search/device'
import { parseSearch } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { PRESELLING_TABS, RESALE_TABS, tabQuery, type LocationTab } from '@/lib/site/location-modules'
import { locationHref } from '@/lib/site/locations-menu'
import { getRates, payload } from '@/lib/site/payload'
import { resolveMeasurement } from '@/lib/site/units'
import type { Location, Media, Post, Short } from '@/payload-types'
import { RichText } from '@payloadcms/richtext-lexical/react'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

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
export default async function LocationPage({ params, searchParams }: Props) {
  const location = await findLocation((await params).path)
  if (!location) notFound()
  const sp = await searchParams
  const num = (v: unknown, max: number) => Math.min(max, Math.max(0, Number.parseInt(String(v ?? ''), 10) || 0))
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
  // The city this page belongs to (its own page at city level): the Explore lists are the city's.
  const crumbs = location.breadcrumbs ?? []
  const cityCrumbId = level === 'municipality' ? location.id : crumbs.map((b) => (typeof b.doc === 'object' ? b.doc?.id : b.doc)).find(Boolean)
  const city = cityCrumbId && cityCrumbId !== location.id ? ((await p.findByID({ collection: 'locations', id: cityCrumbId, depth: 0 }).catch(() => null)) as Location | null) : location
  // "More About": posts whose CRM location meta holds this page's level and id (meta LIKE, BPM-017).
  const metaKey = { municipality: 'municipality', town: 'city', complex: 'complex' }[level]

  // Pagination per module (?rtab=&rpage= / ?ptab=&ppage=): live pages each tab with Next.
  const rtab = num(sp.rtab, RESALE_TABS.length - 1)
  const ptab = num(sp.ptab, PRESELLING_TABS.length - 1)
  const rpage = Math.max(1, num(sp.rpage, 999))
  const ppage = Math.max(1, num(sp.ppage, 999))
  const [rates, currency, measurement, children, posts, explore] = await Promise.all([
    getRates(),
    resolveDisplayCurrency(),
    resolveMeasurement(),
    p.find({ collection: 'locations', where: { parent: { equals: location.id } }, sort: 'name', depth: 1, limit: 200 }),
    ID ? p.find({ collection: 'posts', where: { crmLocationTree: { like: `${metaKey}:${ID}` } }, sort: '-publishedAt', limit: 6, depth: 1 }) : Promise.resolve({ docs: [] as Post[] }),
    city ? locationExplore(city, location.id) : Promise.resolve(null),
  ])
  const run = (saleDetail: '1' | '2', tab: LocationTab, page: number) => {
    const q = tabQuery(saleDetail, area, tab)
    q.set('pageid', String(page))
    return searchListings(p, parseSearch(q, { propertyPerPage: 8, sortby: 'priority_desc', device }), byName)
  }
  const [resale, preselling] = await Promise.all([
    Promise.all(RESALE_TABS.map((t, i) => run('1', t, i === rtab ? rpage : 1))),
    Promise.all(PRESELLING_TABS.map((t, i) => run('2', t, i === ptab ? ppage : 1))),
  ])
  const pageLink = (tabKey: 'r' | 'p', tab: number, page: number) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && !k.startsWith(tabKey)) next.set(k, v)
    next.set(`${tabKey}tab`, String(tab))
    next.set(`${tabKey}page`, String(page))
    return `?${next.toString()}#${tabKey === 'r' ? 'resale' : 'preselling'}`
  }
  const panel = (r: (typeof resale)[number], tabKey: 'r' | 'p', tab: number) =>
    r.docs.length ? (
      <>
        <div className="grid">{r.docs.map((l) => <ListingCard key={l.id} listing={l} rates={rates} currency={currency} measurement={measurement} />)}</div>
        {r.totalPages > 1 && <Pager page={r.page ?? 1} total={r.totalPages} href={(n) => pageLink(tabKey, tab, n)} />}
      </>
    ) : (
      <p className="empty-note">No data found</p>
    )
  const hero = location.heroImage && typeof location.heroImage === 'object' ? (location.heroImage as Media) : null
  const lat = location.coordinates?.latitude
  const lng = location.coordinates?.longitude
  const developments = level === 'town' ? (children.docs as Location[]).filter((c) => c.type === 'subdivision') : []
  const exploreTitle = level === 'town' ? 'Explore More Areas' : `Explore Areas in ${location.name}`

  return (
    <article className="location">
      <header className="page-hero loc-hero">
        <div>
          <nav className="loc-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            {crumbs.map((b, i) => (
              <span key={b.id ?? i}>
                {' › '}
                {i === crumbs.length - 1 ? <span>Properties for sale in {b.label}</span> : <Link href={`/location${(b.url ?? '').replace(/\/$/, '')}/`}>Properties for sale in {b.label}</Link>}
              </span>
            ))}
          </nav>
          <h1>{location.name}</h1>
          {level === 'town' && (
            // The live count comes from page meta (_respacio_count) and was stale ("0") on 24 Nov
            // 2026; the live listing count is shown instead (CD-36).
            <p>
              There are {resale[0].totalDocs + preselling[0].totalDocs} property for sale in {location.name}. The communities and urbanisations you see below have bigger text if they have more properties available! Try clicking on one of them to get more information and see properties for sale.
            </p>
          )}
          {location.intro && <ReadMore intro={<div className="rich"><RichText data={location.intro} /></div>} more={location.content ? <div className="rich"><RichText data={location.content} /></div> : null} />}
          {/* Saved locations need the account area (BPM-014). */}
          <Link href="/my-account/" className="btn btn-outline loc-save">Save this Location</Link>
        </div>
        {hero?.url && <Image src={hero.url} alt="" className="page-hero-image" width={hero.width ?? 1080} height={hero.height ?? 720} priority sizes="(max-width: 767px) 100vw, 560px" />}
      </header>

      <section id="resale" className="home-section">
        <h2>Resale Properties</h2>
        <ListingTabs label="Resale" initial={rtab} tabs={RESALE_TABS.map((t, i) => ({ label: t.label, count: resale[i].totalDocs, panel: panel(resale[i], 'r', i) }))} />
      </section>
      <section id="preselling" className="home-section">
        <h2>Pre-selling Properties</h2>
        <ListingTabs label="Pre-selling" initial={ptab} tabs={PRESELLING_TABS.map((t, i) => ({ label: t.label, count: preselling[i].totalDocs, panel: panel(preselling[i], 'p', i) }))} />
      </section>

      {developments.length > 0 && (
        <section className="home-section">
          <h2>Developments located in {location.name}</h2>
          <div className="tiles">
            {developments.map((d) => {
              const img = d.heroImage && typeof d.heroImage === 'object' ? (d.heroImage as Media) : null
              return (
                // Live tiles carry empty links; they lead to the development page here.
                <Link key={d.id} href={locationHref(d)} className="tile">
                  {img?.url ? <Image src={img.url} alt="" fill sizes="(max-width: 767px) 100vw, 300px" /> : <div className="tile-noimg" />}
                  <span className="tile-body">
                    <strong>{d.name}</strong>
                    <span className="tile-more">Find out More</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {lat != null && lng != null && (
        // The live map (Google) shows "Oops! Something went wrong" (CD-35); an OpenStreetMap view of the location instead.
        <section className="home-section">
          <h2>Location of {location.name}</h2>
          <iframe
            className="lp-map"
            title={`Map of ${location.name}`}
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.05},${lat - 0.03},${lng + 0.05},${lat + 0.03}&layer=mapnik&marker=${lat},${lng}`}
          />
        </section>
      )}

      {(location.guideTabs ?? []).length > 0 && (
        <section className="home-section">
          <h2>{location.guideHeading || 'City Guide'}</h2>
          <GuideTabs tabs={(location.guideTabs ?? []).map((t) => ({ label: t.label, panel: t.body ? <RichText data={t.body} /> : null }))} />
        </section>
      )}

      {level === 'complex' && (
        // BPM-019: "Complex Bottom" opens with the directory grid on every development page.
        <section className="home-section">
          <h2>Directory</h2>
          <DirectoryGrid data={await directoryGrid()} />
        </section>
      )}

      <section className="home-section">
        <h2>More About {location.name}</h2>
        <ContentTabs
          posts={(posts.docs as Post[]).map((po) => ({ id: po.id, title: po.title, excerpt: wpExcerpt(po.excerpt, po.content), href: `/${po.slug}/`, image: po.heroImage && typeof po.heroImage === 'object' ? ((po.heroImage as Media).url ?? null) : null }))}
          shorts={([] as Short[]).map((s) => ({ id: s.id, title: s.title, href: `/shorts/${s.slug}/`, image: youtubeThumb(s.videoUrl) }))}
          moreLabel="View More blogs"
          moreHref="/insights/"
        />
      </section>

      {explore && (
        <section className="home-section loc-explore">
          <h2>{exploreTitle}</h2>
          <div className="loc-explore-cols">
            <ExploreColumn title="Neighborhoods" items={explore.neighborhoods} />
            <ExploreColumn title="Developments" items={explore.developments} />
            <ExploreColumn title="Preselling" items={explore.preselling} />
          </div>
        </section>
      )}
    </article>
  )
}

function ExploreColumn({ title, items }: { title: string; items: ExploreItem[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map((it) => (
          <li key={it.name} className={it.active ? 'is-active' : undefined}>
            {it.href ? <Link href={it.href}>{it.name} ({it.count})</Link> : <span>{it.name} ({it.count})</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The live module pager: 1 2 3 4 5 … last, Next. */
function Pager({ page, total, href }: { page: number; total: number; href: (n: number) => string }) {
  const show = [...new Set([1, 2, 3, 4, 5, page - 1, page, page + 1, total].filter((n) => n >= 1 && n <= total))].sort((a, b) => a - b)
  return (
    <nav className="pagination" aria-label="Pages">
      {show.map((n, i) => (
        <span key={n}>
          {i > 0 && n - show[i - 1] > 1 && <span className="pager-gap">…</span>}
          <Link href={href(n)} aria-current={n === page ? 'page' : undefined}>{n}</Link>
        </span>
      ))}
      {page < total && <Link href={href(page + 1)}>Next</Link>}
    </nav>
  )
}
