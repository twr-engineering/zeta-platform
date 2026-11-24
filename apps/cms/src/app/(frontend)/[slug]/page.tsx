import { RichText } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { HomeBlocks } from '@/components/home/HomeBlocks'
import { pending } from '@/lib/parity/pending'
import { blocksData } from '@/lib/site/blocks-data'
import { payload } from '@/lib/site/payload'
import type { Media, Post } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const findPost = async (slug: string) =>
  (await (await payload()).find({ collection: 'posts', where: { slug: { equals: slug } }, depth: 2, limit: 1 })).docs[0] ?? null

const findPage = async (slug: string) =>
  slug === 'home' ? null : ((await (await payload()).find({ collection: 'pages', where: { slug: { equals: slug } }, depth: 2, limit: 1 })).docs[0] ?? null)

export async function generateMetadata({ params }: Props) {
  const slug = (await params).slug
  const page = await findPage(slug)
  if (page) return { title: page.seo?.title || page.title, description: page.seo?.description || undefined }
  const post = await findPost(slug)
  return post ? { title: post.seo?.title || post.title, description: post.seo?.description || post.excerpt || undefined } : {}
}

/**
 * /{slug}/ — a CMS page (About, Services, Buy, Rent, Sell, Contact, the legal pages…) when one has
 * this slug, else an article. Both live at the root in WordPress, and their slugs do not collide.
 *
 * Article page — /{post-slug}/, the live URL form. BPM-018: title over the featured-image banner,
 * the body, then previous / next by publish date in any category; no author, date or category line.
 */
export default async function SlugPage({ params }: Props) {
  const slug = (await params).slug
  const page = await findPage(slug)
  if (page) return <div className="cms-page"><HomeBlocks blocks={page.layout ?? []} data={await blocksData(page.layout)} /></div>
  const post = await findPost(slug)
  if (!post) notFound()
  pending('article-double-h1')
  const p = await payload()
  const at = post.publishedAt ?? post.createdAt
  const [prev, next] = await Promise.all([
    p.find({ collection: 'posts', where: { publishedAt: { less_than: at } }, sort: '-publishedAt', limit: 1, depth: 0 }),
    p.find({ collection: 'posts', where: { publishedAt: { greater_than: at } }, sort: 'publishedAt', limit: 1, depth: 0 }),
  ])
  const hero = post.heroImage && typeof post.heroImage === 'object' ? (post.heroImage as Media) : null
  return (
    <article className="article">
      <header className={`article-hero${hero?.url ? ' has-image' : ''}`}>
        {hero?.url && <Image src={hero.url} alt="" fill priority sizes="100vw" className="article-hero-image" />}
        <h1>{post.title}</h1>
      </header>
      <div className="article-body">{post.content && <RichText data={withoutLeadingRepeat(post.content, post.title, hero?.id)} />}</div>
      <nav className="article-nav" aria-label="More articles">
        {prev.docs[0] && <Link href={`/${(prev.docs[0] as Post).slug}/`}>← {(prev.docs[0] as Post).title}</Link>}
        {next.docs[0] && <Link href={`/${(next.docs[0] as Post).slug}/`} className="is-next">{(next.docs[0] as Post).title} →</Link>}
      </nav>
    </article>
  )
}

type Node = { type?: string; text?: string; value?: unknown; children?: Node[] }
const textOf = (n: Node): string => (n.text ?? '') + (n.children ?? []).map(textOf).join('')
/**
 * Every live article body opens with its own H1 (the title again) and often the featured image
 * (BPM-018's double H1). The banner already shows both, so a leading heading equal to the title and
 * a leading upload of the hero image are skipped when rendering — the stored content is untouched.
 */
function withoutLeadingRepeat(content: NonNullable<Post['content']>, title: string, heroId?: number) {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const children = [...((content.root.children ?? []) as Node[])]
  for (let i = 0; i < 3 && children.length; i++) {
    const first = children[0]
    const isTitle = first.type === 'heading' && norm(textOf(first)) === norm(title)
    const value = first.value && typeof first.value === 'object' ? (first.value as { id?: number }).id : first.value
    const isHero = first.type === 'upload' && heroId !== undefined && value === heroId
    const isEmpty = first.type === 'paragraph' && !textOf(first).trim()
    if (!(isTitle || isHero || isEmpty)) break
    children.shift()
  }
  return { ...content, root: { ...content.root, children } } as typeof content
}
