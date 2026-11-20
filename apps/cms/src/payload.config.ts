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
import { anyone, isAdmin, isStaff } from './access'
import { syncRespacio } from './crm/respacio/sync'
import { CalculatorDefaults } from './globals/CalculatorDefaults'
import { CrmState } from './globals/CrmState'
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
  globals: [SiteSettings, CalculatorDefaults, CrmState],
  /**
   * The Respacio mirror sync (FR-C01, FR-C07). Hourly in production; run on demand with
   * `pnpm sync:crm`. Without RESPACIO_API_KEY it replays the golden-master fixtures.
   */
  jobs: {
    /**
     * Who may hit /api/payload-jobs/run: an admin, or Vercel Cron, which sends
     * `Authorization: Bearer $CRON_SECRET` (ADR-17). Never open.
     */
    access: {
      run: ({ req }) => {
        if (isAdmin({ req })) return true
        const secret = process.env.CRON_SECRET
        return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
      },
    },
    tasks: [
      {
        slug: 'respacioSync',
        retries: 2,
        schedule: [{ cron: '0 * * * *', queue: 'crm' }],
        outputSchema: [{ name: 'result', type: 'json' }],
        handler: async ({ req }) => ({ output: { result: await syncRespacio(req.payload) } }),
      },
    ],
    autoRun: process.env.ENABLE_JOB_AUTORUN === 'true' ? [{ cron: '*/5 * * * *', queue: 'crm' }] : [],
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // Schema changes go through committed migrations (PRD §14.5), never dev auto-push: push
    // stops on an interactive rename prompt, which hangs unattended (cloud agent) sessions.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
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
      // The plugin's defaults let any logged-in user write. Deny by default (ADR-9).
      overrides: { access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin } },
    }),
    seoPlugin({
      collections: ['pages', 'posts', 'locations', 'shortlists', 'listings', 'shorts', 'directory'],
      uploadsCollection: 'media',
      generateTitle: ({ doc }) => (doc?.title as string) || (doc?.name as string) || '',
    }),
  ],
})
