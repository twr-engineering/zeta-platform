'use client'

import { useState, type ReactNode } from 'react'

/** Tabbed listing modules (BPM-017): every panel is server-rendered; the tabs only switch which shows. */
export function ListingTabs({ label, tabs }: { label: string; tabs: { label: string; count: number; panel: ReactNode }[] }) {
  const [active, setActive] = useState(0)
  return (
    <div className="listing-tabs">
      <div className="seg-tabs" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button key={t.label} type="button" role="tab" aria-selected={i === active} className={i === active ? 'is-on' : ''} onClick={() => setActive(i)}>
            {t.label} <span className="opt-count">({t.count})</span>
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={i !== active}>
          {t.panel}
        </div>
      ))}
    </div>
  )
}
