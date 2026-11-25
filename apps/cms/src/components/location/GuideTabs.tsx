'use client'

import { useState, type ReactNode } from 'react'

/** The city guide (the location post's own tabs): one panel shown at a time, all server-rendered. */
export function GuideTabs({ tabs }: { tabs: { label: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(0)
  return (
    <div className="guide-tabs">
      <div className="seg-tabs seg-tabs-wrap" role="tablist" aria-label="City guide">
        {tabs.map((t, i) => (
          <button key={t.label} type="button" role="tab" aria-selected={i === active} className={i === active ? 'is-on' : ''} onClick={() => setActive(i)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={i !== active} className="rich">
          {t.panel}
        </div>
      ))}
    </div>
  )
}
