import type { ReactNode } from 'react'

/** Page head (app PRD §6.1): one h1 per page (A11Y-003), subtitle in --muted. */
export function PageHead({ title, sub, after, style }: { title: string; sub?: string | null; after?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="pagehead" style={style}>
      <h1>
        {title}
        {after}
      </h1>
      {sub && <p>{sub}</p>}
    </div>
  )
}
