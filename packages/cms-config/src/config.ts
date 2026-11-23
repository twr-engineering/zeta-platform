import { postgresAdapter } from '@payloadcms/db-postgres'

/** The Postgres schema Payload owns in the shared platform database (ADR-23). */
export const DB_SCHEMA = 'cms'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import type { Config } from 'payload'
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
import { CompsDeals } from './collections/comps/CompsDeals'
import { CompsLocations } from './collections/comps/CompsLocations'
import { CompsPropertyTypes } from './collections/comps/CompsPropertyTypes'
import { anyone, isAdmin, isStaff } from './access'
import { syncRespacio } from './crm/respacio/sync'
import { CalculatorDefaults } from './globals/CalculatorDefaults'
import { CrmState } from './globals/CrmState'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export type CreateConfigOptions = {
  /**
   * Where the admin panel's generated importMap lives (apps/cms/src). Only the app that
   * serves the Payload admin passes it; other apps (Tier 1 Local API consumers) do not.
   */
  importMapBaseDir?: string
}

/**
 * The one Payload config for the platform (Architecture ADR-3). Every app that talks to
 * Payload builds it from here, so schema, access rules, hooks, jobs and migrations have a
 * single owner. Migrations and generated types live in this package.
 */
export function createConfig(options: CreateConfigOptions = {}): Promise<import('payload').SanitizedConfig> {
  const admin: Config['admin'] = { user: Users.slug }
  if (options.importMapBaseDir) admin.importMap = { baseDir: options.importMapBaseDir }

  return buildConfig({
    admin,
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
      // Zeta Comps (apps/comps, client-apps/comps.md)
      CompsLocations,
      CompsPropertyTypes,
      CompsDeals,
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
        {
          /**
           * Zeta Comps: permanently delete closed deals trashed more than 30 days ago
           * (app PRD §13.2, Q5). 19:00 UTC = 03:00 Asia/Manila.
           */
          slug: 'compsPurgeTrash',
          schedule: [{ cron: '0 19 * * *', queue: 'comps' }],
          outputSchema: [{ name: 'purged', type: 'number' }],
          handler: async ({ req }) => {
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            const result = await req.payload.delete({
              collection: 'comps-deals',
              trash: true,
              where: { deletedAt: { less_than: cutoff } },
              overrideAccess: true,
              req,
            })
            return { output: { purged: result.docs.length } }
          },
        },
      ],
      autoRun: process.env.ENABLE_JOB_AUTORUN === 'true' ? [{ cron: '*/5 * * * *', queue: 'crm' }] : [],
    },
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
    db: postgresAdapter({
      pool: { connectionString: process.env.DATABASE_URI || '' },
      // ADR-23: one shared platform database (the commission Supabase project), one schema per
      // app. Payload and Comps own `cms`; commission keeps `public`. Every environment uses the
      // same schema, so migrations are written once, fully qualified to "cms".
      schemaName: DB_SCHEMA,
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
      /**
       * Media storage on deployments (ADR-17 allows Vercel Blob "with config only"). Enabled only when
       * BLOB_READ_WRITE_TOKEN is set (Vercel sets it when the Blob store is connected); local dev and
       * CI keep files on disk.
       */
      vercelBlobStorage({
        enabled: !!process.env.BLOB_READ_WRITE_TOKEN,
        collections: { media: true },
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }),
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
}
