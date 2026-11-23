import Link from 'next/link'

import { Pending } from '@/components/Pending'

type LinkRow = { label: string; url: string }
type Column = { title: string; links?: LinkRow[] | null }
type Social = { facebook?: string | null; tiktok?: string | null; youtube?: string | null; instagram?: string | null; linkedin?: string | null }

type Props = {
  explore: Column[]
  columns: Column[]
  tagline?: string | null
  newsletter: { heading?: string | null; text?: string | null }
  social: Social
  brokerLicence?: string | null
}

/**
 * WP-03 footer (live zetagroup.ph, Nov 2026), FR-G09: "Explore more Properties" columns, the
 * newsletter band, then the dark footer (logo, tagline, social, editor-managed link columns,
 * broker licence). Every column is editor-managed in Site Settings.
 */
export function SiteFooter({ explore, columns, tagline, newsletter, social, brokerLicence }: Props) {
  return (
    <footer className="site-footer">
      {explore.length > 0 && (
        <section className="explore container" aria-labelledby="explore-heading">
          <h2 id="explore-heading">Explore more Properties</h2>
          <div className="explore-grid">
            {explore.map((col) => (
              <div key={col.title}>
                <h3>{col.title}</h3>
                <ul>{(col.links ?? []).map((l) => <li key={l.url}><Link href={l.url}>{l.label}</Link></li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="newsletter" aria-labelledby="newsletter-heading">
        <div className="container newsletter-inner">
          <div>
            <h2 id="newsletter-heading">{newsletter.heading}</h2>
            {newsletter.text && <p>{newsletter.text}</p>}
          </div>
          <div className="newsletter-form">
            <input aria-label="Your first name" placeholder="Your First Name*" disabled />
            <input aria-label="Your last name" placeholder="Your Last Name*" disabled />
            <input aria-label="Your email address" placeholder="Your Email Address*" type="email" disabled className="span-2" />
            <button type="button" className="btn btn-outline-yellow span-2" disabled>Subscribe</button>
            <Pending id="contact-forms">Newsletter signup is not wired until the live form is confirmed (OQ-17).</Pending>
          </div>
        </div>
      </section>

      <div className="footer-main">
        <div className="container footer-grid">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark */}
            <img src="/zeta-logo-dark.png" alt="Zeta Group" width={118} height={32} />
            {tagline && <p>{tagline}</p>}
            <SocialLinks social={social} />
          </div>
          {columns.map((col) => (
            <div key={col.title} className="footer-col">
              <h3>{col.title}</h3>
              <ul>{(col.links ?? []).map((l) => <li key={l.url}><Link href={l.url}>{l.label}</Link></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="container footer-legal">
          <span>© {new Date().getFullYear()} Zeta Group</span>
          {brokerLicence && <span>PRC Broker Lic. No. {brokerLicence}</span>}
        </div>
      </div>
    </footer>
  )
}

const SOCIAL: [keyof Social, string, string][] = [
  ['facebook', 'Facebook', 'M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z'],
  ['tiktok', 'TikTok', 'M16 3c.4 2.4 1.9 3.9 4 4.2v3.4c-1.5 0-2.9-.5-4-1.3v6.3a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.5a2.2 2.2 0 1 0 1.3 2V3H16z'],
  ['youtube', 'YouTube', 'M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-3.8 31 31 0 0 0-.4-3.8zM10 15V9l5.2 3L10 15z'],
  ['instagram', 'Instagram', 'M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.3-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z'],
  ['linkedin', 'LinkedIn', 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1a4.2 4.2 0 0 1 3.7-2c4 0 4.7 2.6 4.7 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z'],
]

function SocialLinks({ social }: { social: Social }) {
  const items = SOCIAL.filter(([k]) => social[k])
  if (!items.length) return null
  return (
    <ul className="social">
      {items.map(([k, label, d]) => (
        <li key={k}>
          <a href={social[k] as string} target="_blank" rel="noopener noreferrer" aria-label={label}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="currentColor" /></svg>
          </a>
        </li>
      ))}
    </ul>
  )
}
