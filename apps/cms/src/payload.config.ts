import { postgresAdapter } from '@payloadcms/db-postgres'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Categories } from './collections/Categories'
import { DirectoryCategories, DirectoryEntries } from './collections/Directory'
import { Listings } from './collections/Listings'
import { Locations } from './collections/Locations'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Shortlists } from './collections/Shortlists'
import { Shorts } from './collections/Shorts'
import { Tags } from './collections/Tags'
import { TestimonialCategories, Testimonials } from './collections/Testimonials'
import { Users } from './collections/Users'
import { CalculatorDefaults } from './globals/CalculatorDefaults'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [
    // Property
    Locations,
    Listings,
    Shortlists,
    // Editorial
    Posts,
    Categories,
    Tags,
    Shorts,
    // Content
    Pages,
    Testimonials,
    TestimonialCategories,
    DirectoryEntries,
    DirectoryCategories,
    // System
    Media,
    Users,
  ],
  globals: [SiteSettings, CalculatorDefaults],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),
  sharp,
  /**
   * Single-locale English. This is a VERIFIED FACT, not a forward assumption:
   * WPML is installed but deactivated on the current site (PRD CF-05), so the
   * production site is monolingual today. The three-currency selector is a CRM
   * feature, not a translation layer.
   */
  localization: {
    locales: ['en'],
    defaultLocale: 'en',
    fallback: true,
  },
  plugins: [
    /** FR-L01/FR-L04 — the 152-record location hierarchy, 25 top-level, 47 parents. */
    nestedDocsPlugin({
      collections: ['locations', 'categories'],
      generateLabel: (_, doc) => doc.name as string,
      generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
    }),
    /**
     * FR-SE01..SE13. Seeded with the 59 redirects already stored in Yoast Premium
     * — dropping them silently re-breaks URLs that were already repaired.
     */
    redirectsPlugin({
      collections: ['pages', 'posts', 'locations', 'shortlists'],
    }),
    seoPlugin({
      collections: ['pages', 'posts', 'locations', 'shortlists', 'listings', 'shorts', 'directory'],
      uploadsCollection: 'media',
      generateTitle: ({ doc }) => (doc?.title as string) || (doc?.name as string) || '',
    }),
  ],
})
