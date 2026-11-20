import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@zeta/cms-config', '@zeta/parity'],
  // Monorepo root: pnpm's store and packages/* live there.
  turbopack: { root: path.resolve(dirname, '../..') },
}

// withPayload keeps Payload's server-only dependencies (db driver, sharp) out of the bundle.
// Comps serves no Payload admin; it only uses the Local API from its route handlers.
export default withPayload(nextConfig, { devBundleServerPackages: false })
