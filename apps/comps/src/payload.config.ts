import { createConfig } from '@zeta/cms-config'

// The platform Payload config (packages/cms-config). Comps does not serve the admin panel,
// so no importMap. Schema and migrations are owned by the package; apps/cms runs them.
export default createConfig()
