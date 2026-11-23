import { cookies } from 'next/headers'

import { MEASUREMENT_COOKIE, parseMeasurement, type Measurement } from '@zeta/parity/area'

/** FR-G05/G12: the visitor's unit, read server-side so the first paint is in the right unit. */
export async function resolveMeasurement(): Promise<Measurement> {
  return parseMeasurement((await cookies()).get(MEASUREMENT_COOKIE)?.value)
}
