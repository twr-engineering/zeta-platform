import Link from 'next/link'
import React from 'react'

import './styles.css'

export const metadata = {
  title: { default: 'Zeta Group', template: '%s | Zeta Group' },
  description: 'Zeta Group property portal.',
}

/** Placeholder shell. The real header, mega-menu and footer are WP-03 (FR-G01..G12). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">Zeta Group</Link>
          <nav>
            <Link href="/search_results/?property_for=1">Buy</Link>
            <Link href="/search_results/?property_for=2">Rent</Link>
            <Link href="/buy/">Loan calculator</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
