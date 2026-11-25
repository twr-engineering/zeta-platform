'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

type Pane = 'photos' | 'tour' | 'floor' | 'video'

/**
 * BPM-020 rows 12–13 (template 288102): 1 large + 4 small photos with "Show {n} photos and videos",
 * then the media tabs — Overview (scrolls to the description), Photos, 360 Virtual Tour, Floor Plan,
 * Video — each removed when empty; every media tab opens the gallery viewer on its pane.
 */
export function ListingGallery({ title, images, floorPlans, videos, tour }: { title: string; images: string[]; floorPlans: string[]; videos: string[]; tour: string | null }) {
  const [pane, setPane] = useState<Pane | null>(null)
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (pane && !d.open) d.showModal()
    if (!pane && d.open) d.close()
  }, [pane])

  const open = (p: Pane, i = 0) => {
    setIndex(i)
    setPane(p)
  }
  const list = pane === 'floor' ? floorPlans : images
  const step = (d: number) => setIndex((i) => (i + d + list.length) % list.length)

  return (
    <>
      {images.length > 0 && (
        <section className="lp-gallery" aria-label="Photos">
          {images.slice(0, 5).map((src, i) => (
            <button key={src} type="button" className="lp-gallery-item" onClick={() => open('photos', i)} aria-label={`Open photo ${i + 1} of ${images.length}`}>
              <Image src={src} alt={`${title} — photo ${i + 1}`} fill priority={i === 0} sizes={i === 0 ? '(max-width: 991px) 100vw, 760px' : '(max-width: 991px) 50vw, 380px'} />
            </button>
          ))}
          <button type="button" className="lp-all-photos" onClick={() => open('photos')}>
            Show {images.length} photos{videos.length ? ' and videos' : ''}
          </button>
        </section>
      )}

      <nav className="lp-media-tabs" aria-label="Media">
        <a href="#overview" className="is-on">Overview</a>
        {images.length > 0 && <button type="button" onClick={() => open('photos')}>Photos</button>}
        {tour && <button type="button" onClick={() => open('tour')}>360 Virtual Tour</button>}
        {floorPlans.length > 0 && <button type="button" onClick={() => open('floor')}>Floor Plan</button>}
        {videos.length > 0 && <button type="button" onClick={() => open('video')}>Video</button>}
      </nav>

      <dialog ref={dialogRef} className="lp-viewer" aria-label={`${title} — media`} onClose={() => setPane(null)} onCancel={() => setPane(null)}>
        <div className="lp-viewer-bar">
          <div className="lp-viewer-tabs" role="tablist">
            {images.length > 0 && <button type="button" role="tab" aria-selected={pane === 'photos'} onClick={() => open('photos')}>Photos</button>}
            {tour && <button type="button" role="tab" aria-selected={pane === 'tour'} onClick={() => open('tour')}>360 Virtual Tour</button>}
            {floorPlans.length > 0 && <button type="button" role="tab" aria-selected={pane === 'floor'} onClick={() => open('floor')}>Floor Plan</button>}
            {videos.length > 0 && <button type="button" role="tab" aria-selected={pane === 'video'} onClick={() => open('video')}>Video</button>}
          </div>
          <button type="button" className="lp-viewer-close" onClick={() => setPane(null)} aria-label="Close">×</button>
        </div>
        {(pane === 'photos' || pane === 'floor') && list.length > 0 && (
          <div className="lp-viewer-stage">
            <Image key={list[index]} src={list[index]} alt={`${title} — ${pane === 'floor' ? 'floor plan' : 'photo'} ${index + 1}`} fill sizes="100vw" />
            {list.length > 1 && (
              <>
                <button type="button" className="card-arrow is-prev" onClick={() => step(-1)} aria-label="Previous">‹</button>
                <button type="button" className="card-arrow is-next" onClick={() => step(1)} aria-label="Next">›</button>
              </>
            )}
            <p className="lp-viewer-count">{index + 1} / {list.length}</p>
          </div>
        )}
        {pane === 'tour' && tour && <iframe className="lp-viewer-frame" title="360 Virtual Tour" src={tour} allowFullScreen />}
        {pane === 'video' && videos.map((v) => <video key={v} className="lp-viewer-frame" src={v} controls preload="metadata" />)}
      </dialog>
    </>
  )
}
