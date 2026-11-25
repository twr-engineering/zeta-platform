'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

type Item = { id: number; title: string; href: string; image: string | null; excerpt?: string }

/** "Featured Content": Blogs / Shorts tabs (FR-H07, FR-H08). */
export function ContentTabs({ posts, shorts, moreLabel, moreHref }: { posts: Item[]; shorts: Item[]; moreLabel: string; moreHref: string }) {
  const [tab, setTab] = useState<'blogs' | 'shorts'>('blogs')
  const items = tab === 'blogs' ? posts : shorts
  return (
    <div className="content-tabs">
      <div className="seg-tabs" role="tablist" aria-label="Content type">
        <button type="button" role="tab" aria-selected={tab === 'blogs'} className={tab === 'blogs' ? 'is-on' : ''} onClick={() => setTab('blogs')}>Blogs</button>
        <button type="button" role="tab" aria-selected={tab === 'shorts'} className={tab === 'shorts' ? 'is-on' : ''} onClick={() => setTab('shorts')}>Shorts</button>
      </div>
      {items.length === 0 ? (
        <p className="empty-note">No data found</p>
      ) : (
        <div className={tab === 'blogs' ? 'post-list' : 'short-grid'}>
          {items.map((it) => (
            <Link key={it.id} href={it.href} className={tab === 'blogs' ? 'post-row' : 'short-card'}>
              <span className="media-box">{it.image ? <Image src={it.image} alt="" fill sizes="(max-width: 767px) 100vw, 260px" /> : <span className="tile-noimg" />}</span>
              <span>
                <strong>{it.title}</strong>
                {it.excerpt && <span className="post-excerpt">{it.excerpt}</span>}
                {tab === 'blogs' && <span className="tile-more">Read More</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
      <p className="more-link"><Link href={moreHref}>{tab === 'blogs' ? moreLabel : 'View More shorts'}</Link></p>
    </div>
  )
}
