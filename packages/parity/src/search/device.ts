import type { Device } from './params'

/**
 * BPM-006a — the device class behind the phone page size.
 *
 * Production runs Mobile_Detect 2.8.37 (`Detect::deviceType()`, respacio includes/detect.php:66–68):
 * Phone = isMobile() && !isTablet(). This is a compact equivalent for current user agents, not the
 * full Mobile_Detect pattern list — a recorded R-class deviation (matrix BPM-006a). Also not
 * reproduced: the unsanitised `?device=` override and the macOS `?res_dev=` width round-trip
 * (respacio.php:17–95), both debugging aids with no user-facing contract.
 */
const TABLET = /iPad|Tablet|Kindle|Silk|PlayBook|Nexus (7|9|10)|SM-T\d|Android(?!.*Mobile)/i
const MOBILE = /Mobi|iPhone|iPod|Android|BlackBerry|BB10|IEMobile|Opera Mini|webOS|Windows Phone/i

export function deviceType(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? ''
  if (TABLET.test(ua)) return 'Tablet'
  if (MOBILE.test(ua)) return 'Phone'
  return 'Computer'
}
