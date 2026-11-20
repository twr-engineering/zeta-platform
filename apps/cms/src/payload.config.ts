import path from 'path'
import { fileURLToPath } from 'url'

import { createConfig } from '@zeta/cms-config'

// The platform config lives in packages/cms-config. This app serves the Payload admin, so it
// passes where its generated importMap lives.
const dirname = path.dirname(fileURLToPath(import.meta.url))

export default createConfig({ importMapBaseDir: dirname })
