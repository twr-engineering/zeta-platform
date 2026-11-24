import Image from 'next/image'
import Link from 'next/link'

import { locationHref } from '@/lib/site/locations-menu'
import { youtubeThumb } from '@/lib/site/youtube'
import type { Location, Media, Page, Post, Short, Shortlist, Testimonial } from '@/payload-types'

import { PageBlock } from '@/components/page/PageBlocks'

import { FaqList } from './FaqList'
import { HeroSearch } from './HeroSearch'
import { ContentTabs } from './ContentTabs'

type Block = NonNullable<Page['layout']>[number]
export type HomeData = {
  locationCounts: Record<number, number>
  latestPosts: Post[]
  latestShorts: Short[]
  searchLocations: { label: string; value: string }[]
  incomeMultiple: number
}

const media = (m: unknown): Media | null => (m && typeof m === 'object' ? (m as Media) : null)
const docs = <T,>(list: unknown): T[] => (Array.isArray(list) ? list.filter((d): d is T => !!d && typeof d === 'object') : [])

/** Renders a page's blocks in their editor-set order (FR-H01, FR-H10): home blocks here, the rest in PageBlock. */
export function HomeBlocks({ blocks, data }: { blocks: Block[]; data: HomeData }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.blockType) {
          case 'homeHero': {
            const bg = media(b.backgroundImage)
            return (
              <section key={i} className="home-hero">
                {bg?.url && <Image className="home-hero-image" src={bg.url} alt="" fill priority sizes="100vw" />}
                {b.backgroundVideoUrl && (
                  <video className="home-hero-video" src={b.backgroundVideoUrl} poster={bg?.url ?? undefined} autoPlay muted loop playsInline aria-hidden="true" />
                )}
                <div className="home-hero-inner">
                  <div className="home-hero-copy">
                    <h1>{b.heading}</h1>
                    <HeroSearch locations={data.searchLocations} />
                    {b.guideLink?.label && b.guideLink.url && <Link className="home-hero-guide" href={b.guideLink.url}>{b.guideLink.label}</Link>}
                  </div>
                  {b.presenterName && (
                    <div className="home-hero-presenter">
                      <span className="presenter-name">{b.presenterName}</span>
                      {b.presenterTagline && <span className="presenter-tagline">{b.presenterTagline}</span>}
                    </div>
                  )}
                </div>
              </section>
            )
          }
          case 'homeTestimonials': {
            const items = docs<Testimonial>(b.testimonials)
            return (
              <section key={i} className="home-section container">
                <SectionHead heading={b.heading} intro={b.intro} />
                <div className="testimonials">
                  {items.map((t) => (
                    <figure key={t.id} className="testimonial">
                      <span className="quote-mark" aria-hidden="true">„</span>
                      <blockquote>{t.quote}</blockquote>
                      <figcaption>{t.clientName}</figcaption>
                    </figure>
                  ))}
                </div>
                <MoreLink link={b.moreLink} />
              </section>
            )
          }
          case 'homeStats':
            return (
              <section key={i} className="home-section home-stats">
                <div className="container home-stats-inner">
                  <SectionHead heading={b.heading} intro={b.intro} />
                  <dl className="stats">
                    {(b.items ?? []).map((s) => (
                      <div key={s.label}>
                        <dt>{s.label}</dt>
                        <dd>{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            )
          case 'homeLocations': {
            const locs = docs<Location>(b.locations)
            const development = b.tileStyle === 'development'
            return (
              <section key={i} className="home-section container">
                <SectionHead heading={b.heading} intro={b.intro} centered />
                <div className="tiles">
                  {locs.map((l) => {
                    const img = media(l.heroImage)
                    return (
                      <Link key={l.id} href={locationHref(l)} className="tile">
                        {img?.url ? <Image src={img.url} alt="" fill sizes="(max-width: 767px) 100vw, 300px" /> : <div className="tile-noimg" />}
                        <span className="tile-body">
                          {development ? (
                            // BPM-022: the location grid's tile names the parent location, no count.
                            <strong>Property for sale in {l.name}{parentName(l) ? `, ${parentName(l)}` : ''}</strong>
                          ) : (
                            <strong>Properties for sale in {l.name}</strong>
                          )}
                          {!development && data.locationCounts[l.id] !== undefined && <span>{data.locationCounts[l.id]} Properties</span>}
                          <span className="tile-more">Find out More</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
                <MoreLink link={b.moreLink} center />
              </section>
            )
          }
          case 'homeCta': {
            const img = media(b.image)
            return (
              <section key={i} className={`home-section container home-cta${b.imageSide === 'right' ? ' is-reversed' : ''}`}>
                {img?.url && <Image className="home-cta-image" src={img.url} alt={img.alt ?? ''} width={img.width ?? 800} height={img.height ?? 600} sizes="(max-width: 991px) 100vw, 560px" />}
                <div className="home-cta-copy">
                  <h2>{b.heading}</h2>
                  {b.text && <p>{b.text}</p>}
                  {b.button?.label && b.button.url && <Link className="btn btn-dark" href={b.button.url}>{b.button.label}</Link>}
                </div>
              </section>
            )
          }
          case 'homeShortlists': {
            const lists = docs<Shortlist>(b.shortlists)
            return (
              <section key={i} className="home-section container">
                <SectionHead heading={b.heading} intro={b.intro} centered />
                <div className="tiles tiles-tall">
                  {lists.map((s) => {
                    const img = media(s.heroImage)
                    return (
                      <Link key={s.id} href={`/shortlist/${s.slug}/`} className="tile">
                        {img?.url ? <Image src={img.url} alt="" fill sizes="(max-width: 767px) 100vw, 300px" /> : <div className="tile-noimg" />}
                        <span className="tile-body">
                          <strong>{s.title}</strong>
                          <span className="tile-more">Find out More</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
                <MoreLink link={b.moreLink} center />
              </section>
            )
          }
          case 'homeContent': {
            const posts = docs<Post>(b.posts).length ? docs<Post>(b.posts) : data.latestPosts
            const shorts = docs<Short>(b.shorts).length ? docs<Short>(b.shorts) : data.latestShorts
            return (
              <section key={i} className="home-section container">
                <SectionHead heading={b.heading} intro={b.intro} />
                <ContentTabs
                  posts={posts.map((p) => ({ id: p.id, title: p.title, excerpt: p.excerpt ?? '', href: `/${p.slug}/`, image: media(p.heroImage)?.url ?? null }))}
                  shorts={shorts.map((s) => ({ id: s.id, title: s.title, href: `/shorts/${s.slug}/`, image: media(s.thumbnail)?.url ?? youtubeThumb(s.videoUrl) }))}
                  moreLabel={b.moreLink?.label ?? 'View More blogs'}
                  moreHref={b.moreLink?.url ?? '/insights/'}
                />
              </section>
            )
          }
          case 'homeFaq':
            return (
              <section key={i} className="home-section container">
                <SectionHead heading={b.heading} intro={b.intro} />
                <FaqList items={(b.items ?? []).map((f) => ({ q: f.question, a: f.answer }))} />
              </section>
            )
          default:
            return <PageBlock key={i} block={b} incomeMultiple={data.incomeMultiple} first={i === 0} />
        }
      })}
    </>
  )
}

/** The parent location's name, from the nested-docs breadcrumbs (no extra populate needed). */
const parentName = (l: Location) => (l.breadcrumbs && l.breadcrumbs.length > 1 ? l.breadcrumbs[l.breadcrumbs.length - 2]?.label : null) ?? null

function SectionHead({ heading, intro, centered }: { heading?: string | null; intro?: string | null; centered?: boolean }) {
  if (!heading && !intro) return null
  return (
    <header className={`section-head${centered ? ' is-centered' : ''}`}>
      {heading && <h2>{heading}</h2>}
      {intro && <p>{intro}</p>}
    </header>
  )
}

function MoreLink({ link, center }: { link?: { label?: string | null; url?: string | null } | null; center?: boolean }) {
  if (!link?.label || !link.url) return null
  return (
    <p className={`more-link${center ? ' is-centered' : ''}`}>
      <Link href={link.url}>{link.label}</Link>
    </p>
  )
}
