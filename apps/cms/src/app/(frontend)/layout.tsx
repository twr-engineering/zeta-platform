import { Poppins } from 'next/font/google'
import React from 'react'

import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteHeader, type MenuItem } from '@/components/site/SiteHeader'
import { CURRENCIES } from '@/lib/site/currencies'
import { resolveDisplayCurrency } from '@/lib/site/currency'
import { getLocationMenu, getSiteSettings } from '@/lib/site/settings'
import { resolveMeasurement } from '@/lib/site/units'

import './styles.css'

// The live site's only text face (measured 23 Nov 2026): Poppins 400/500/600/700.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-poppins' })

export const metadata = {
  title: { default: 'Zeta Group', template: '%s | Zeta Group' },
  description: 'Zeta Group is the ultimate resource for buyers and sellers of real property in the Philippines.',
}

/** WP-03 shell: the live zetagroup.ph header, drawer and footer (FR-G01..G12). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, locations, currency, measurement] = await Promise.all([
    getSiteSettings(),
    getLocationMenu(),
    resolveDisplayCurrency(),
    resolveMeasurement(),
  ])
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader
          menu={(settings.mainMenu ?? []) as MenuItem[]}
          cta={settings.headerCta ?? {}}
          locations={locations}
          currency={currency}
          currencies={CURRENCIES}
          measurement={measurement}
        />
        <main id="main">{children}</main>
        <SiteFooter
          explore={settings.exploreColumns ?? []}
          columns={settings.footerColumns ?? []}
          tagline={settings.footerTagline}
          newsletter={settings.newsletter ?? {}}
          social={settings.social ?? {}}
          brokerLicence={settings.brokerLicence}
        />
      </body>
    </html>
  )
}
