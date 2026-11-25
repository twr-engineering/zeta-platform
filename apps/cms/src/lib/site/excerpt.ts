type Node = { text?: string; type?: string; children?: Node[] }

const textOf = (n: Node): string => (n.text ?? '') + (n.children ?? []).map(textOf).join(n.type === 'root' ? ' ' : '')

/**
 * WordPress's automatic excerpt (get_the_excerpt → wp_trim_excerpt): the post's own excerpt when
 * set, else the first 55 words of the content followed by " […]". The live Featured Content
 * cards show this text (CSS clamps it).
 */
export function wpExcerpt(excerpt: string | null | undefined, content: unknown, words = 55): string {
  if (excerpt?.trim()) return excerpt.trim()
  const root = (content as { root?: Node } | null)?.root
  if (!root) return ''
  const all = (root.children ?? []).map(textOf).join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  return all.length > words ? `${all.slice(0, words).join(' ')} […]` : all.join(' ')
}
