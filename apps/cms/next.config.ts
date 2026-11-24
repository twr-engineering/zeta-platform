import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // WordPress URLs end in '/', and the URL space is frozen (FR-SE01..SE13): /r/ZTP345/,
  // /search_results/, /buy/. Without this every legacy link 308s to a slashless form.
  trailingSlash: true,
  // Workspace packages ship TypeScript source (Phase 3).
  transpilePackages: ['@zeta/parity', '@zeta/cms-config'],
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    // Listing photos are the CRM's S3 originals (0.3–1.6 MB, eu-west-3) and editor media is on
    // Vercel Blob; the optimiser resizes both to the rendered size, as WebP, cached at the edge.
    remotePatterns: [
      { protocol: 'https', hostname: 's3.eu-west-3.amazonaws.com', pathname: '/respacio-b6f2533a04ad44064505dafc89e3aa54/**' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
    formats: ['image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    // Monorepo root, not this app: pnpm's store (node_modules/.pnpm) and packages/* live
    // there, and Turbopack resolves nothing outside its root.
    root: path.resolve(dirname, '../..'),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
