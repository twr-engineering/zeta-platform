import type { SVGProps } from 'react'

/**
 * Every icon from app PRD Appendix C, inner markup copied exactly. viewBox 0 0 24 24,
 * aria-hidden, stroke currentColor; sizes and stroke widths come from the CSS classes that
 * wrap them (as in the reference build).
 */
const PATHS = {
  tabDeals: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v12h14V9" /><path d="m9 15 2 2 4-4" /></>,
  tabRates: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-7" /><path d="M16 7h4v4" /></>,
  tabCma: <><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M8.5 7h7" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  filters: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  info: <><circle cx="12" cy="12" r="9.5" /><path d="M12 11v6" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  kebab: <><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></>,
  sortDesc: <path d="M6 9l6 6 6-6" />,
  sortAsc: <path d="M6 15l6-6 6 6" />,
  logout: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      {PATHS[name]}
    </svg>
  )
}
