import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ResultsGrid } from '@/components/ResultsGrid'
import { GetInTouch } from '@/components/site/GetInTouch'
import { deviceType } from '@/lib/search/device'
import { mergeModuleQuery, parseSearch } from '@/lib/search/params'
import { searchListings } from '@/lib/search/query'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { getRates, payload } from '@/lib/site/payload'
import { resolveMeasurement } from '@/lib/site/units'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const findShortlist = async (slug: string) =>
  (await (await payload()).find({ collection: 'shortlists', where: { slug: { equals: slug } }, depth: 1, limit: 1 })).docs[0] ?? null

export async function generateMetadata({ params }: Props) {
  const s = await findShortlist((await params).slug)
  return s ? { title: s.title } : {}
}

/**
 * /shortlist/{slug}/ — a rule-based shortlist (BPM-012): its saved query with the request's
 * parameters layered on top (ignore_get=false). 12 per page, 9 on phones; the foreclosed list keeps
 * the block default 9 on desktop too (BPM-006a census).
 */
export default async function ShortlistPage({ params, searchParams }: Props) {
  const { slug } = await params
  const shortlist = await findShortlist(slug)
  if (!shortlist) notFound()
  const raw = await searchParams
  const request = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) (Array.isArray(v) ? v : v === undefined ? [] : [v]).forEach((x) => request.append(k, x))
  const sp = mergeModuleQuery(shortlist.savedQuery, request)
  const perPage = slug.startsWith('foreclosed-') ? undefined : 12
  const q = parseSearch(sp, { sortby: 'priority_desc', propertyPerPage: perPage, device: deviceType((await headers()).get('user-agent')) })
  const [result, rates, currency, measurement] = await Promise.all([searchListings(await payload(), q), getRates(), resolveDisplayCurrency(raw.currency), resolveMeasurement()])
  const hero = shortlist.heroImage && typeof shortlist.heroImage === 'object' ? (shortlist.heroImage as Media) : null
  return (
    <article className="shortlist">
      <header className="page-hero">
        <div>
          <h1>{shortlist.title}</h1>
          <p>
            Welcome to your personalized shortlist! Explore top choices tailored just for you, featuring products, services, and recommendations based on your preferences. Easily compare options, read reviews, and make informed decisions—all in one convenient location.
          </p>
          <Link href="/contact/" className="btn btn-dark btn-yellow-text">Speak to a Property Specialist</Link>
        </div>
        {hero?.url ? <Image src={hero.url} alt="" className="page-hero-image" width={hero.width ?? 1080} height={hero.height ?? 720} priority sizes="(max-width: 767px) 100vw, 560px" /> : <div className="page-hero-image tile-noimg" />}
      </header>
      <p className="results-count">{result.totalDocs} properties</p>
      <ResultsGrid result={result} sp={sp} rates={rates} currency={currency} measurement={measurement} />
      <GetInTouch />
    </article>
  )
}
