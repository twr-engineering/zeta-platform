'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import type { DirectoryGridData } from '@/lib/site/directory'

/** BPM-019 directory grid: "All" plus the first page's categories; each tab swaps the cards. */
export function DirectoryGrid({ data }: { data: DirectoryGridData }) {
  const [tab, setTab] = useState<string>('all')
  const cards = tab === 'all' ? data.all : (data.tabs.find((t) => t.slug === tab)?.cards ?? [])
  if (!data.all.length) return <p className="empty-note">No data found</p>
  return (
    <div className="directory-grid">
      <div className="seg-tabs" role="tablist" aria-label="Directory categories">
        {[{ slug: 'all', name: 'All' }, ...data.tabs].map((t) => (
          <button key={t.slug} type="button" role="tab" aria-selected={tab === t.slug} className={tab === t.slug ? 'is-on' : ''} onClick={() => setTab(t.slug)}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="directory-cards">
        {cards.map((c) => (
          <Link key={c.id} href={c.href} className="directory-card">
            <span className="media-box">{c.image ? <Image src={c.image} alt="" fill sizes="(max-width: 767px) 100vw, 360px" /> : <span className="tile-noimg" />}</span>
            <strong>{c.name}</strong>
            {c.excerpt && <span className="post-excerpt">{c.excerpt}</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
