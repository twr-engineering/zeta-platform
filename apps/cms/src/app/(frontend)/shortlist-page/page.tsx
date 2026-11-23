import Link from 'next/link'

import { GetInTouch } from '@/components/site/GetInTouch'
import { payload } from '@/lib/site/payload'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shortlist' }

/** /shortlist-page/ — the shortlist index (live page "ShortList"). */
export default async function ShortlistIndex() {
  const { docs } = await (await payload()).find({ collection: 'shortlists', sort: 'createdAt', depth: 1, limit: 100 })
  return (
    <article>
      <header className="page-hero">
        <div>
          <p className="eyebrow">ShortList</p>
          <h1>Curated List of Properties in the Philippines</h1>
          <p>
            Dive into our curated selection of the finest properties the Philippines has to offer, from breathtaking beachfront homes to luxurious urban condos. Your dream property is just a click away—explore our exclusive shortlist of properties in the Philippines and embark on a journey to find your perfect slice of paradise.
          </p>
          <Link href="/contact/" className="btn btn-dark btn-yellow-text">Speak to a Property Specialist</Link>
        </div>
      </header>
      <div className="tiles tiles-tall">
        {docs.map((s) => {
          const img = s.heroImage && typeof s.heroImage === 'object' ? (s.heroImage as Media) : null
          return (
            <Link key={s.id} href={`/shortlist/${s.slug}/`} className="tile">
              {img?.url ? <img src={img.url} alt="" loading="lazy" /> : <div className="tile-noimg" />}
              <span className="tile-body">
                <strong>{s.title}</strong>
                <span className="tile-more">Find out More</span>
              </span>
            </Link>
          )
        })}
      </div>
      <GetInTouch />
    </article>
  )
}
