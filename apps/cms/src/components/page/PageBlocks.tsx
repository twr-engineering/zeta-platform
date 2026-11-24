import { RichText } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'
import Link from 'next/link'

import { LoanCalculator } from '@/components/LoanCalculator'
import { Pending } from '@/components/Pending'
import { youtubeId } from '@/lib/site/youtube'
import type { Media, Page } from '@/payload-types'

type Block = NonNullable<Page['layout']>[number]
type Rich = Parameters<typeof RichText>[0]['data']

const media = (m: unknown): Media | null => (m && typeof m === 'object' ? (m as Media) : null)
const Body = ({ data }: { data?: Rich | null }) => (data ? <div className="rich"><RichText data={data} /></div> : null)

function Video({ url, title }: { url: string; title: string }) {
  const id = youtubeId(url)
  if (!id) return null
  return (
    <iframe
      className="video-embed"
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title={title}
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}

function Buttons({ items }: { items?: { label: string; url?: string | null; style?: string | null; id?: string | null }[] | null }) {
  if (!items?.length) return null
  return (
    <div className="block-buttons">
      {items.map((b, i) =>
        b.style === 'download' || !b.url ? (
          // Gated downloads need the account area and the download forms (OQ-17).
          <span key={b.id ?? i} className="btn btn-outline is-disabled" title="Available soon" aria-disabled="true" data-pending={b.style === 'download' ? 'gated-downloads' : undefined}>{b.label}</span>
        ) : (
          <Link key={b.id ?? i} href={b.url} className={b.style === 'secondary' ? 'btn btn-outline' : 'btn btn-dark'}>{b.label}</Link>
        ),
      )}
    </div>
  )
}

/** The general page blocks (packages/cms-config/src/blocks/page.ts). */
export function PageBlock({ block: b, incomeMultiple, first }: { block: Block; incomeMultiple: number; first?: boolean }) {
  // A page's opening heading is its title (the legal pages open with their accordion).
  const H = first ? 'h1' : 'h2'
  switch (b.blockType) {
    case 'content': {
      const img = media(b.image)
      const hasMedia = !!b.videoUrl || !!img?.url
      return (
        <section className={`page-block content-block tone-${b.tone ?? 'plain'}${hasMedia ? ' has-media' : ''}${b.mediaSide === 'left' ? ' media-left' : ''}`}>
          <div className="container content-block-inner">
            <div className="content-block-copy">
              <Body data={b.body as Rich} />
              <Buttons items={b.buttons} />
            </div>
            {b.videoUrl ? (
              <div className="content-block-media"><Video url={b.videoUrl} title="Video" /></div>
            ) : img?.url ? (
              <div className="content-block-media">
                <Image src={img.url} alt={img.alt ?? ''} width={img.width ?? 800} height={img.height ?? 600} sizes="(max-width: 991px) 100vw, 560px" />
              </div>
            ) : null}
          </div>
        </section>
      )
    }
    case 'accordion':
      return (
        <section className="page-block container accordion-block">
          {b.heading && <H>{b.heading}</H>}
          <Body data={b.intro as Rich} />
          <div className="faq">
            {(b.items ?? []).map((it, i) => (
              <details key={it.id ?? i} open={i === 0}>
                <summary>{it.question}</summary>
                <Body data={it.answer as Rich} />
              </details>
            ))}
          </div>
        </section>
      )
    case 'tabs':
      return (
        <section className="page-block container tabs-block">
          {b.heading && <H>{b.heading}</H>}
          <Body data={b.intro as Rich} />
          {(b.tabs ?? []).map((t, i) => (
            <details key={t.id ?? i} className="tab-panel" open={i === 0}>
              <summary>{t.label}</summary>
              <Body data={t.body as Rich} />
            </details>
          ))}
        </section>
      )
    case 'contactDetails':
      return (
        <section className="page-block container contact-block">
          <div className="contact-block-copy"><Body data={b.body as Rich} /></div>
          {b.mapAddress && (
            <iframe
              className="contact-map"
              title={`Map: ${b.mapAddress}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(b.mapAddress)}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </section>
      )
    case 'form':
      return (
        // id: the live pages' "Speak to a Property Specialist" buttons jump to #h-get-in-touch.
        <section id="h-get-in-touch" className="page-block container form-block">
          <Body data={b.body as Rich} />
          <Pending id="contact-forms">The live “{b.form}” form: fields and destination are not captured yet (OQ-17).</Pending>
        </section>
      )
    case 'calculator':
      return (
        <section className="page-block container calculator-block">
          <Body data={b.body as Rich} />
          <LoanCalculator incomeMultiple={incomeMultiple} />
        </section>
      )
    default:
      return null
  }
}
