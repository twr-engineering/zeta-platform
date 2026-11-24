/**
 * pnpm migrate:wp — WP-10 content migration from the extractor's JSON (scripts/wp-extract.py):
 * categories, tags, articles (Gutenberg HTML → Lexical), shorts, the 152 locations (hierarchy,
 * CRM geography, island group, coordinates, featured image), the directory and testimonials.
 *
 * Inputs stay local (client content): WP_EXPORT (default ../../.local/wp-export.json) and
 * WP_UPLOADS (default ~/Projects/zeta-group/site/wp-content/uploads) for featured images, which are
 * scaled to 1600 px JPEG before upload. Idempotent: records match on their WordPress URL (legacyUrls)
 * or slug, so a re-run updates instead of duplicating. Content pages are recomposed into layout
 * blocks by scripts/wp-pages.ts (--only=pages); app-rendered pages are routes and are skipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '../src/payload.config'
import { decode, planPage, relativeLinks } from './wp-pages'

type Thumb = { file: string; alt: string } | null
type Base = { wpId: number; title: string; slug: string; date: string; content: string; excerpt: string; parent: number; thumb: Thumb; seoTitle?: string | null; seoDescription?: string | null }
type Term = { termId: string; name: string; slug: string; parent: string }
type Export = {
  posts: (Base & { categories: string[]; tags: string[]; primaryCategory?: string | null })[]
  shorts: (Base & { videoUrl?: string | null })[]
  locations: (Base & { geo?: string | null; level?: string | null; crmName?: string | null; lat?: string | null; lng?: string | null; locationTags?: string[] })[]
  directory: (Base & { categories: string[]; logo: Thumb; summary?: string | null })[]
  testimonials: (Base & { categories: string[] })[]
  pages: Base[]
  categories: Term[]
  tags: Term[]
  directoryCategories: Term[]
  testimonialCategories: Term[]
}

const home = os.homedir()
const exportPath = process.env.WP_EXPORT ?? path.resolve(process.cwd(), '../../.local/wp-export.json')
const uploads = (process.env.WP_UPLOADS ?? '~/Projects/zeta-group/site/wp-content/uploads').replace(/^~(?=\/)/, home)
if (!existsSync(exportPath)) {
  console.error(`migrate:wp: ${exportPath} not found. Run scripts/wp-extract.py first.`)
  process.exit(1)
}
const wp: Export = JSON.parse(readFileSync(exportPath, 'utf8'))
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
const want = (k: string) => !only || only.includes(k)

const payload = await getPayload({ config })
const opts = { overrideAccess: true } as const
const editorConfig = await editorConfigFactory.default({ config: payload.config })
const log = (msg: string) => console.log(`migrate:wp: ${msg}`)

/** Yoast templates like "Properties for sale in X %%sep%% %%sitename%%" → the site's title pattern. */
const seoText = (v?: string | null) => (v ? v.replace(/\s*%%sep%%\s*/g, ' | ').replace(/%%sitename%%/g, 'Zeta Group').replace(/%%[a-z_]+%%/g, '').trim() || undefined : undefined)
/** Gutenberg markup → clean HTML: block comments go, the HTML inside stays. */
const gutenberg = (html: string) => html.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').trim()

/**
 * Inline images: the converter links an <img> to Media only through data-lexical-upload-id, so each
 * wp-content/uploads image is uploaded (from the offline pull, preferring the full-size original over
 * a "-1024x768" variant) and its tag rewritten; images that cannot be found locally are dropped.
 */
async function withUploads(html: string, alt: string): Promise<string> {
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  let out = html
  for (const tag of new Set(tags)) {
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1] ?? ''
    const rel = /\/wp-content\/uploads\/(.+?)(?:\?.*)?$/.exec(src)?.[1]
    const tagAlt = /\salt="([^"]*)"/i.exec(tag)?.[1] || alt
    // Inline social icons (24–30 px) are decoration, not content.
    const width = Number(/\swidth="?(\d+)/i.exec(tag)?.[1] ?? /width:\s*(\d+)px/i.exec(tag)?.[1] ?? 0)
    let id: number | undefined
    if (rel && !(width > 0 && width < 100)) {
      const original = rel.replace(/-\d+x\d+(\.\w+)$/, '$1')
      id = (await upload({ file: original, alt: tagAlt }, tagAlt)) ?? (await upload({ file: rel, alt: tagAlt }, tagAlt))
    }
    out = out.split(tag).join(id ? `<img data-lexical-upload-id="${id}" data-lexical-upload-relation-to="media">` : '')
  }
  return out
}

type LexNode = { type?: string; value?: unknown; pending?: unknown; children?: LexNode[] }
/** The converter stores upload ids as strings; Payload ids are integers. Unresolved uploads are removed. */
function fixUploads(node: LexNode): LexNode {
  if (node.children) {
    node.children = node.children
      .filter((c) => !(c.type === 'upload' && (c.pending || !c.value)))
      .map((c) => {
        if (c.type === 'upload' && typeof c.value === 'string' && /^\d+$/.test(c.value)) c.value = Number(c.value)
        return fixUploads(c)
      })
  }
  return node
}

const toLexical = async (html: string, alt: string) => {
  const state = convertHTMLToLexical({ editorConfig, html: (await withUploads(gutenberg(html), alt)) || '<p></p>', JSDOM })
  fixUploads(state.root as unknown as LexNode)
  return state
}

async function upload(thumb: Thumb, alt: string): Promise<number | undefined> {
  if (!thumb) return undefined
  const src = path.join(uploads, thumb.file)
  if (!existsSync(src)) return undefined
  const name = `${path.basename(src, path.extname(src))}.jpg`
  const found = await payload.find({ collection: 'media', where: { filename: { equals: name } }, limit: 1, depth: 0, ...opts })
  if (found.docs[0]) return found.docs[0].id as number
  const data = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer()
  const doc = await payload.create({ collection: 'media', data: { alt: thumb.alt || alt }, file: { data, mimetype: 'image/jpeg', name, size: data.length }, ...opts })
  return doc.id as number
}

type Coll = 'pages' | 'categories' | 'tags' | 'posts' | 'shorts' | 'locations' | 'directory' | 'directory-categories' | 'testimonials' | 'testimonial-categories'
async function upsert(collection: Coll, where: Record<string, unknown>, data: Record<string, unknown>): Promise<number> {
  const found = await payload.find({ collection, where: where as never, limit: 1, depth: 0, ...opts })
  const doc = found.docs[0]
    ? await payload.update({ collection, id: found.docs[0].id, data: data as never, context: { migration: true }, ...opts })
    : await payload.create({ collection, data: data as never, context: { migration: true }, ...opts })
  return doc.id as number
}

async function terms(collection: 'categories' | 'tags' | 'directory-categories' | 'testimonial-categories', list: Term[]) {
  const ids = new Map<string, number>()
  for (const t of list) ids.set(t.termId, await upsert(collection, { slug: { equals: t.slug } }, { name: t.name, slug: t.slug }))
  return ids
}

// ---- taxonomies ----------------------------------------------------------------------------
const categoryIds = want('posts') ? await terms('categories', wp.categories) : new Map()
const tagIds = want('posts') ? await terms('tags', wp.tags) : new Map()
const dirCatIds = want('directory') ? await terms('directory-categories', wp.directoryCategories) : new Map()
const testiCatIds = want('testimonials') ? await terms('testimonial-categories', wp.testimonialCategories) : new Map()

// ---- articles ------------------------------------------------------------------------------
if (want('posts')) {
  let n = 0
  for (const p of wp.posts) {
    const category = categoryIds.get(p.primaryCategory ?? '') ?? categoryIds.get(p.categories[0] ?? '')
    await upsert('posts', { slug: { equals: p.slug } }, {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt || undefined,
      heroImage: await upload(p.thumb, p.title),
      content: await toLexical(p.content, p.title),
      category,
      tags: p.tags.map((t) => tagIds.get(t)).filter(Boolean),
      publishedAt: new Date(`${p.date.replace(' ', 'T')}Z`).toISOString(),
      legacyUrls: [{ path: `/${p.slug}/` }],
      seo: { title: seoText(p.seoTitle), description: seoText(p.seoDescription) },
      _status: 'published',
    })
    n++
  }
  log(`${n} articles`)
}

// ---- shorts --------------------------------------------------------------------------------
if (want('shorts')) {
  for (const s of wp.shorts) {
    await upsert('shorts', { slug: { equals: s.slug } }, {
      title: s.title,
      slug: s.slug,
      videoUrl: s.videoUrl,
      description: gutenberg(s.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
      thumbnail: await upload(s.thumb, s.title),
      legacyUrls: [{ path: `/shorts/${s.slug}/` }],
      _status: 'published',
    })
  }
  log(`${wp.shorts.length} shorts`)
}

// ---- locations -----------------------------------------------------------------------------
if (want('locations')) {
  // BPM-017: the site's city page is CRM level "municipality", its barangay page CRM "city".
  const TYPE: Record<string, string> = { municipality: 'city', city: 'barangay', complex: 'subdivision' }
  // Province (CRM id) → island group, for the location menu (FR-G01). Ids resolved from the listing payloads.
  const ISLAND: Record<string, string> = {
    '4689': 'mindanao', '4691': 'mindanao', '4685': 'mindanao', '4699': 'mindanao', '4683': 'mindanao',
    '4673': 'visayas', '4669': 'visayas', '4672': 'visayas', '4670': 'visayas', '4674': 'visayas', '4666': 'visayas',
    '4720': 'luzon',
  }
  const byWp = new Map(wp.locations.map((l) => [l.wpId, l]))
  const pathOf = (l: Export['locations'][number]): string => {
    const parts = [l.slug]
    let p = byWp.get(l.parent)
    while (p) {
      parts.unshift(p.slug)
      p = byWp.get(p.parent)
    }
    return `/location/${parts.join('/')}/`
  }
  const geoIds = (geo?: string | null) => Object.fromEntries((geo ?? '').split('|').map((kv) => kv.split(':')).filter((kv) => kv.length === 2)) as Record<string, string>
  const ids = new Map<number, number>()
  // Parents first, so a child's parent exists when it is written.
  const depth = (l: Export['locations'][number]) => pathOf(l).split('/').length
  for (const l of [...wp.locations].sort((a, b) => depth(a) - depth(b))) {
    const g = geoIds(l.geo)
    const level = l.level ?? (g.complex ? 'complex' : g.city ? 'city' : g.municipality ? 'municipality' : null)
    const legacy = pathOf(l)
    const name = l.crmName || l.title.replace(/^(properties|condos?|houses?|lots?)\s+for\s+sale\s+in\s+/i, '')
    const data = {
      name,
      slug: l.slug,
      type: TYPE[level ?? ''] ?? 'region',
      // Only pages with level meta are cities in the menu; the 20 without it (project pages rendered
      // with municipality modules, BPM-017) keep that behaviour but stay out of the City Guide.
      islandGroup: l.level === 'municipality' ? ISLAND[g.province] : null,
      parent: ids.get(l.parent),
      crmGeography: { provinceId: g.province, municipalityId: g.municipality, townId: g.city, complexId: g.complex },
      coordinates: { latitude: l.lat ? Number(l.lat) : undefined, longitude: l.lng ? Number(l.lng) : undefined },
      heroImage: await upload(l.thumb, name),
      legacyUrls: [{ path: legacy }],
      seo: { title: seoText(l.seoTitle), description: seoText(l.seoDescription)?.replace(/\[global_location_property_count\]/g, '').replace(/\s{2,}/g, ' ') },
      _status: 'published',
    }
    // seed:home created four cities by slug without a legacy URL; adopt them rather than duplicate.
    const byLegacy = await payload.find({ collection: 'locations', where: { 'legacyUrls.path': { equals: legacy } }, limit: 1, depth: 0, ...opts })
    const where = byLegacy.docs[0] ? { id: { equals: byLegacy.docs[0].id } } : { and: [{ slug: { equals: l.slug } }, l.parent ? { parent: { equals: ids.get(l.parent) ?? -1 } } : { parent: { exists: false } }] }
    ids.set(l.wpId, await upsert('locations', where, data))
  }
  log(`${wp.locations.length} locations`)
}

// ---- directory -----------------------------------------------------------------------------
if (want('directory')) {
  for (const d of wp.directory) {
    await upsert('directory', { slug: { equals: d.slug } }, {
      name: d.title,
      slug: d.slug,
      category: dirCatIds.get(d.categories[0] ?? ''),
      description: (d.summary || gutenberg(d.content).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || undefined,
      image: await upload(d.thumb, d.title),
      legacyUrls: [{ path: `/directory/${d.slug}/` }],
      _status: 'published',
    })
  }
  log(`${wp.directory.length} directory entries`)
}

// ---- testimonials --------------------------------------------------------------------------
if (want('testimonials')) {
  for (const t of wp.testimonials) {
    await upsert('testimonials', { slug: { equals: t.slug } }, {
      clientName: t.title,
      slug: t.slug,
      quote: decode(gutenberg(t.content).replace(/<\/p>\s*<p>/g, '\n\n').replace(/<[^>]+>/g, '')).trim() || t.excerpt || t.title,
      category: testiCatIds.get(t.categories[0] ?? ''),
      photo: await upload(t.thumb, t.title),
      _status: 'published',
    })
  }
  log(`${wp.testimonials.length} testimonials`)
}

// ---- pages ---------------------------------------------------------------------------------
if (want('pages')) {
  // Content pages only: search, listings, locations, shortlists, insights, account and 404 are routes.
  const CONTENT = ['about-us', 'services', 'buy', 'rent', 'sell', 'contact', 'preselling-developments', 'cookies-policy', 'terms-and-conditions', 'privacy-policy', 'data-deletion']
  const TITLES: Record<string, string> = { contact: 'Contact' }
  const isEmpty = (html: string) => !html.replace(/<(?!img)[^>]+>/g, '').replace(/&nbsp;|\s/g, '')
  // Links without a real target (href="#", modal triggers) keep their text and lose the link.
  const realLinks = (html: string) => html.replace(/<a\b(?![^>]*\shref="[^"#\s][^"]*")[^>]*>([\s\S]*?)<\/a>/gi, '$1')
  const rich = async (html: string, alt: string) => (isEmpty(html) ? undefined : await toLexical(realLinks(relativeLinks(html)), alt))
  const testimonialIds = (await payload.find({ collection: 'testimonials', limit: 100, depth: 0, sort: 'id', ...opts })).docs.map((t) => t.id)
  let n = 0
  for (const page of wp.pages.filter((p) => CONTENT.includes(p.slug))) {
    const title = TITLES[page.slug] ?? page.title
    const layout: Record<string, unknown>[] = []
    for (const b of planPage(page.content)) {
      switch (b.kind) {
        case 'content':
          layout.push({ blockType: 'content', body: await rich(b.html, title), videoUrl: b.videoUrl, image: b.imageFile ? await upload({ file: b.imageFile, alt: '' }, title) : undefined, buttons: b.buttons })
          break
        case 'accordion':
          layout.push({
            blockType: 'accordion',
            heading: b.heading,
            intro: await rich(b.introHtml, title),
            items: await Promise.all(b.items.map(async (it) => ({ question: it.question, answer: await rich(`<p>${it.answerHtml}</p>`, title) }))),
          })
          break
        case 'tabs':
          layout.push({ blockType: 'tabs', heading: b.heading, intro: await rich(b.introHtml, title), tabs: await Promise.all(b.tabs.map(async (t) => ({ label: t.label, body: await rich(t.html, title) }))) })
          break
        case 'contactDetails':
          layout.push({ blockType: 'contactDetails', body: await rich(b.html, title), mapAddress: b.mapAddress })
          break
        case 'form':
          layout.push({ blockType: 'form', body: await rich(b.html, title), form: b.form })
          break
        case 'calculator':
          layout.push({ blockType: 'calculator', body: await rich(b.html, title) })
          break
        case 'homeContent':
          layout.push({ blockType: 'homeContent', heading: b.heading, intro: null })
          break
        case 'homeTestimonials':
          layout.push({ blockType: 'homeTestimonials', heading: b.heading, intro: b.intro ?? null, testimonials: testimonialIds, moreLink: { label: null, url: null } })
          break
        case 'homeLocations': {
          // The live grid: 12 locations with this location tag, newest first. Tile photos: pending('location-grid-images').
          const slugs = wp.locations.filter((l) => l.locationTags?.includes(b.tag)).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 12).map((l) => l.slug)
          const found = await payload.find({ collection: 'locations', where: { slug: { in: slugs } }, limit: 50, depth: 0, ...opts })
          const ids = slugs.map((s) => found.docs.find((d) => d.slug === s)?.id).filter(Boolean)
          layout.push({ blockType: 'homeLocations', heading: b.heading ?? null, intro: b.intro ?? null, locations: ids, moreLink: { label: null, url: null } })
          break
        }
      }
    }
    await upsert('pages', { slug: { equals: page.slug } }, { title, slug: page.slug, layout, seo: { title: seoText(page.seoTitle), description: seoText(page.seoDescription) }, _status: 'published' })
    n++
  }
  log(`${n} pages`)
}

process.exit(0)
