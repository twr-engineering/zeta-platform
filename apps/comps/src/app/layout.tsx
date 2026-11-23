import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import type { ReactNode } from 'react'

import './comps.css'

// Poppins 300-700, display swap (app PRD §10.3), exposed to the stylesheet as --font-poppins.
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap', variable: '--font-poppins' })

// Every page renders per request, so each one carries the request's CSP nonce (NFR-010); even the
// two redirect-only pages would otherwise be prerendered without it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Zeta Comps' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
