/**
 * pnpm seed:home — builds the front page ("home") from the live zetagroup.ph sections, so a dev or
 * staging database shows the real home page before WP-10 migrates content.
 *
 * Structure (blocks, headings, statistics, the six shortlists and four featured cities) is generic
 * site configuration. Client content — testimonials, FAQ answers, the hero photo — is read from a
 * local, gitignored file (default ../../.local/home-content.json; HOME_CONTENT to override), never
 * from the public repo. Idempotent: re-running updates the same records.
 * Refuses APP_ENV=production unless --force (production content is the editors' job).
 */
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '../src/payload.config'

if (process.env.APP_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('seed:home refuses APP_ENV=production without --force.')
  process.exit(1)
}

type LocalContent = {
  testimonials?: { clientName: string; quote: string }[]
  faq?: { question: string; answer: string }[]
  heroImage?: string
  /** slug → featured image in the offline pull (the WordPress _thumbnail_id of that location/shortlist). */
  tileImages?: Record<string, string>
}
const contentPath = process.env.HOME_CONTENT ?? path.resolve(process.cwd(), '../../.local/home-content.json')
const local: LocalContent = existsSync(contentPath) ? JSON.parse(readFileSync(contentPath, 'utf8')) : {}
if (!existsSync(contentPath)) console.warn(`seed:home: ${contentPath} not found — testimonials, FAQ and hero photo are skipped.`)
const expand = (p: string) => p.replace(/^~(?=\/)/, os.homedir())

const payload = await getPayload({ config })
const opts = { overrideAccess: true } as const

/**
 * Uploads a local image once (by its resized file name). Originals in the pull reach 51 MB, so they
 * are scaled to 1600 px wide JPEG first; the site's image optimiser does the rest per request.
 */
async function uploadImage(file: string, alt: string): Promise<number | undefined> {
  const src = expand(file)
  if (!existsSync(src)) return undefined
  const name = `${path.basename(src, path.extname(src))}.jpg`
  const existing = await payload.find({ collection: 'media', where: { filename: { equals: name } }, limit: 1, ...opts })
  if (existing.docs[0]) return existing.docs[0].id as number
  const data = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  const doc = await payload.create({ collection: 'media', data: { alt }, file: { data, mimetype: 'image/jpeg', name, size: data.length }, ...opts })
  return doc.id as number
}

async function upsert<T extends Record<string, unknown>>(collection: 'shortlists' | 'locations' | 'testimonials', where: Record<string, unknown>, data: T) {
  const found = await payload.find({ collection, where: where as never, limit: 1, depth: 0, ...opts })
  const doc = found.docs[0]
    ? await payload.update({ collection, id: found.docs[0].id, data: data as never, ...opts })
    : await payload.create({ collection, data: data as never, ...opts })
  return doc.id as number
}

// The six home shortlists, in live order, with their saved queries (BPM-012).
const SHORTLISTS: [string, string, string][] = [
  ['Preselling condotels for sale in the Philippines', 'preselling-condotels-for-sale-in-the-philippines', 'property_for=1&sale_detail_type[]=2&type[]=_st_94'],
  ['Beachfront properties for sale in the Philippines', 'beachfront-properties-for-sale-in-the-philippines', 'property_for=1&sortby=priority_desc&type[]=_st_7'],
  ['Foreclosed Properties for sale in the Philippines', 'foreclosed-properties-for-sale-in-the-philippines', 'property_for=1&sortby=priority_desc&fa[]=a143'],
  ['Commercial properties for sale in the Philippines', 'commercial-properties-for-sale-in-the-philippines', 'property_for=1&sortby=priority_desc&type[]=_st_7'],
  ['Luxury Houses for sale in the Philippines', 'luxury-houses-for-sale-in-the-philippines', 'property_for=1&price=&min_price=19901000&max_price=100000000&type[]=_st_9'],
  ['Condominiums for sale in the Philippines', 'condominiums-for-sale-in-the-philippines', 'property_for=1&sortby=priority_desc&type[]=_st_38'],
]
const shortlistIds: number[] = []
for (const [title, slug, savedQuery] of SHORTLISTS) {
  const heroImage = local.tileImages?.[slug] ? await uploadImage(local.tileImages[slug], title) : undefined
  shortlistIds.push(await upsert('shortlists', { slug: { equals: slug } }, { title, slug, savedQuery, ...(heroImage ? { heroImage } : {}), _status: 'published' }))
}

// The four featured cities, in live order.
const CITIES: [string, string, 'luzon' | 'visayas' | 'mindanao' | 'island-destination'][] = [
  ['San Vicente', 'san-vicente', 'luzon'],
  ['Lapu-Lapu City', 'lapu-lapu-city', 'visayas'],
  ['Cebu City', 'cebu-city', 'visayas'],
  ['Cagayan de Oro City', 'cagayan-de-oro-city', 'mindanao'],
]
const locationIds: number[] = []
for (const [name, slug, islandGroup] of CITIES) {
  const heroImage = local.tileImages?.[slug] ? await uploadImage(local.tileImages[slug], name) : undefined
  locationIds.push(await upsert('locations', { slug: { equals: slug } }, { name, slug, type: 'city', islandGroup, ...(heroImage ? { heroImage } : {}), _status: 'published' }))
}

const testimonialIds: number[] = []
for (const t of local.testimonials ?? []) {
  const slug = t.clientName.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  testimonialIds.push(await upsert('testimonials', { slug: { equals: slug } }, { clientName: t.clientName, slug, quote: t.quote, _status: 'published' }))
}

let heroImage: number | undefined
const heroPath = local.heroImage ? expand(local.heroImage) : null
if (heroPath && existsSync(heroPath)) {
  const existing = await payload.find({ collection: 'media', where: { filename: { equals: path.basename(heroPath) } }, limit: 1, ...opts })
  heroImage = (existing.docs[0] ?? (await payload.create({ collection: 'media', data: { alt: 'Alex Zeta-Guingao' }, filePath: heroPath, ...opts }))).id as number
}

const layout = [
  { blockType: 'homeHero', heading: 'Your Ultimate Real Estate Resource in the Philippines', backgroundImage: heroImage, presenterName: 'Alex Zeta-Guingao', presenterTagline: 'Truly Wealthy Realty', guideLink: { label: 'Learn how to buy in the Philippines', url: '/buy/' } },
  { blockType: 'homeTestimonials', heading: 'What our clients say', intro: 'Zeta clients are always a top priority. Here’s what they have to say.', testimonials: testimonialIds, moreLink: { label: 'View more reviews', url: '/about-us/' } },
  { blockType: 'homeStats', heading: 'Award winning track record', intro: 'Elevating the standard of real estate practice in the Philippines. Showcasing our success in Philippine real estate.', items: [
    { value: '10+ years', label: 'Real Estate Experience' },
    { value: '2B+', label: 'Sales volume since 2012' },
    { value: '15k', label: 'Youtube Subscribers' },
    { value: '500+', label: 'Transactions since 2012' },
  ], moreLink: { label: 'More about the Zeta Group', url: '/about-us/' } },
  { blockType: 'homeLocations', heading: 'City Guide', intro: 'Virtually search through the key cities in the Philippines to find the right property for you.', locations: locationIds, moreLink: { label: 'View More Locations', url: '/location/' } },
  { blockType: 'homeCta', heading: 'Sell with confidence.', text: 'Sell your property in the Philippines free from worry and doubt. Zeta Group has a track record of serving foreign buyers, OFWs, and local residents. Our huge database of people looking for properties in the Philippines can help you sell your property with ease and confidence.', imageSide: 'left', button: { label: 'Get Started', url: '/sell/' } },
  { blockType: 'homeShortlists', heading: 'Interesting Properties you might like', intro: 'Carefully curated properties in the Philippines that will resonate with you.', shortlists: shortlistIds, moreLink: { label: 'View More Shortlists', url: '/shortlist-page/' } },
  { blockType: 'homeCta', heading: 'Home Buying Guide', text: 'Easily navigate the process of buying your dream property in the Philippines by downloading your copy of Zeta Group’s Philippine Home Buying Guide for FREE!', imageSide: 'right', button: { label: 'Get your FREE Home Buying Guide', url: '/buy/' } },
  { blockType: 'homeContent', heading: 'Featured Content', intro: 'Real estate information at your fingertips. Alex, an expert real estate broker and consultant in the Philippines will help you understand the ins and outs of the Philippine real estate process through her hand-picked and easy-to-follow content.', moreLink: { label: 'View More blogs', url: '/insights/' } },
  { blockType: 'homeFaq', heading: 'FAQ', intro: 'Got questions? We’ve got answers. Learn everything you need to know about the Philippine real estate process in our comprehensive FAQ section.', items: local.faq ?? [] },
]

const found = await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 1, ...opts })
const data = { title: 'Home', slug: 'home', layout, _status: 'published' } as never
const page = found.docs[0] ? await payload.update({ collection: 'pages', id: found.docs[0].id, data, ...opts }) : await payload.create({ collection: 'pages', data, ...opts })
console.log(`seed:home: page ${page.id} — ${layout.length} blocks, ${shortlistIds.length} shortlists, ${locationIds.length} cities, ${Object.keys(local.tileImages ?? {}).length} tile images, ${testimonialIds.length} testimonials, ${local.faq?.length ?? 0} FAQs, hero image ${heroImage ? 'set' : 'skipped'}.`)
process.exit(0)
