import Link from 'next/link'

import { GetInTouch } from '@/components/site/GetInTouch'
import { getLocationMenu } from '@/lib/site/settings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'City Guide' }

/** /location/ — the City Guide index: cities by island group, each with its barangays (FR-G01 data). */
export default async function LocationIndex() {
  const groups = await getLocationMenu()
  return (
    <article>
      <header className="page-hero">
        <div>
          <h1>City Guide</h1>
          <p>Virtually search through the key cities in the Philippines to find the right property for you.</p>
        </div>
      </header>
      {groups.length === 0 && <p className="empty-note">Locations appear here once they are published.</p>}
      {groups.map((g) => (
        <section key={g.key} className="home-section">
          <h2>{g.label}</h2>
          <div className="city-index">
            {g.cities.map((c) => (
              <div key={c.href}>
                <h3><Link href={c.href}>{c.name}</Link></h3>
                {c.children.length > 0 && (
                  <ul className="area-list">{c.children.map((b) => <li key={b.href}><Link href={b.href}>{b.name}</Link></li>)}</ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <GetInTouch />
    </article>
  )
}
