'use client'

import { useState } from 'react'

/** Share: the device share sheet, else copy the link. (CD-27: the live modal's links are fixed to /r/ZTP116/; the real URL is used.) */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = location.href.split('?')[0]
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button type="button" className="btn btn-soft" onClick={share} aria-live="polite">
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
