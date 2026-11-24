import { RichText } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'
import { notFound } from 'next/navigation'

import { payload } from '@/lib/site/payload'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const findEntry = async (slug: string) =>
  (await (await payload()).find({ collection: 'directory', where: { slug: { equals: slug } }, depth: 1, limit: 1 })).docs[0] ?? null

export async function generateMetadata({ params }: Props) {
  const entry = await findEntry((await params).slug)
  return entry ? { title: entry.seo?.title || entry.name, description: entry.seo?.description || entry.excerpt || undefined } : {}
}

/**
 * /directory/{slug}/ — a directory entry (the live single-directory template shows the entry's
 * content only; the name is added as the page heading for accessibility).
 */
export default async function DirectoryEntryPage({ params }: Props) {
  const entry = await findEntry((await params).slug)
  if (!entry) notFound()
  const img = entry.image && typeof entry.image === 'object' ? (entry.image as Media) : null
  return (
    <article className="directory-entry">
      <h1>{entry.name}</h1>
      {img?.url && <Image src={img.url} alt={img.alt ?? ''} width={img.width ?? 1200} height={img.height ?? 800} sizes="(max-width: 991px) 100vw, 780px" priority />}
      {entry.description && <div className="rich"><RichText data={entry.description} /></div>}
    </article>
  )
}
