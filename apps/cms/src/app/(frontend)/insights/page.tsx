import Image from 'next/image'
import Link from 'next/link'

import { wpExcerpt } from '@/lib/site/excerpt'
import { payload } from '@/lib/site/payload'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Insights' }

type Props = { searchParams: Promise<{ pageid?: string }> }

/** /insights/ — articles, newest first, 6 per page with ?pageid={n} (BPM-013; the block default post_limit '6'). */
export default async function Insights({ searchParams }: Props) {
  const page = Math.max(1, Number.parseInt((await searchParams).pageid ?? '1', 10) || 1)
  const result = await (await payload()).find({ collection: 'posts', sort: '-publishedAt', limit: 6, page, depth: 1 })
  return (
    <article>
      <header className="page-hero">
        <div>
          <h1>Insights</h1>
          <p>Real estate information at your fingertips: guides, news and tips on the Philippine property process.</p>
        </div>
      </header>
      <div className="insights-grid">
        {result.docs.map((post) => {
          const img = post.heroImage && typeof post.heroImage === 'object' ? (post.heroImage as Media) : null
          return (
            <Link key={post.id} href={`/${post.slug}/`} className="insight-card">
              <span className="media-box">{img?.url ? <Image src={img.url} alt="" fill sizes="(max-width: 767px) 100vw, 360px" /> : <span className="tile-noimg" />}</span>
              <strong>{post.title}</strong>
              {wpExcerpt(post.excerpt, post.content) && <span className="post-excerpt">{wpExcerpt(post.excerpt, post.content)}</span>}
              <span className="tile-more">Read More</span>
            </Link>
          )
        })}
      </div>
      {result.totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={n === 1 ? '/insights/' : `/insights/?pageid=${n}`} aria-current={n === page ? 'page' : undefined}>{n}</Link>
          ))}
        </nav>
      )}
    </article>
  )
}
