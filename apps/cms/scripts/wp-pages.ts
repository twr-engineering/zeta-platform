/**
 * WP-10 page recomposition: a WordPress page's Gutenberg/UAGB markup → Payload layout blocks.
 * Each top-level section maps to one block by what it contains (an FAQ, tabs, a map, a form, the
 * loan calculator, a location grid, blog/short grids), and everything else becomes "text and
 * media" (its rich text plus the one video or image beside it). Sections holding several videos
 * are split at their child containers, so each video keeps its own text.
 */
export type GBlock = { name: string; attrs: Record<string, unknown>; children: GBlock[]; raw: string; inner: string }

const TOKEN = /<!--\s*(\/)?wp:([a-z0-9/-]+)(?:\s+(\{[\s\S]*?\}))?\s*(\/)?-->/g

/**
 * Gutenberg block tree; `raw` is the block's full markup, `inner` what sits between its comments.
 * Sections hidden on desktop are the mobile copies of a desktop section (UAG responsive
 * conditions): they are cut from the markup first, so neither the tree nor any HTML keeps them.
 */
export function parseBlocks(html: string): GBlock[] {
  const hidden: string[] = []
  const collect = (list: GBlock[]) => list.forEach((b) => (b.attrs.UAGHideDesktop ? hidden.push(b.raw) : collect(b.children)))
  collect(parseTree(html))
  return parseTree(hidden.reduce((h, raw) => h.split(raw).join(''), html))
}

function parseTree(html: string): GBlock[] {
  const root: GBlock = { name: 'root', attrs: {}, children: [], raw: html, inner: html }
  const stack: { block: GBlock; start: number; innerStart: number }[] = [{ block: root, start: 0, innerStart: 0 }]
  for (const m of html.matchAll(TOKEN)) {
    const [whole, close, name, json, selfClose] = m
    const at = m.index ?? 0
    if (close) {
      const top = stack.pop()
      if (!top || top.block.name !== name) throw new Error(`wp-pages: unbalanced </${name}> at ${at}`)
      top.block.raw = html.slice(top.start, at + whole.length)
      top.block.inner = html.slice(top.innerStart, at)
      continue
    }
    let attrs: Record<string, unknown> = {}
    if (json) {
      try {
        attrs = JSON.parse(json)
      } catch {
        attrs = {}
      }
    }
    const block: GBlock = { name, attrs, children: [], raw: whole, inner: '' }
    stack[stack.length - 1].block.children.push(block)
    if (!selfClose) stack.push({ block, start: at, innerStart: at + whole.length })
  }
  return root.children
}

export const descendants = (b: GBlock, name: string | RegExp): GBlock[] =>
  b.children.flatMap((c) => [...((typeof name === 'string' ? c.name === name : name.test(c.name)) ? [c] : []), ...descendants(c, name)])

const youtube = (b: GBlock) => descendants(b, 'embed').filter((e) => e.attrs.providerNameSlug === 'youtube')
const videoUrls = (b: GBlock) => [...new Set(youtube(b).map((e) => String(e.attrs.url ?? '').trim().replace(/\.$/, '')))].filter(Boolean)
const shortcodes = (b: GBlock) => descendants(b, 'shortcode').map((s) => s.inner.trim())
const formTitle = (code: string) => /\[contact-form-7[^\]]*title="([^"]+)"/.exec(code)?.[1]
const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' }
export const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  )
const strip = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
/** Absolute links to the live site become site-relative; uploads keep their URL (the image importer needs it). */
export const relativeLinks = (html: string) => html.replace(/https?:\/\/(?:www\.)?zetagroup\.ph\/(?!wp-content\/)/g, '/')

function without(b: GBlock, removed: GBlock[]): string {
  let html = b.inner
  for (const r of removed) html = html.split(r.raw).join('')
  return html.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '')
}

/** The first heading's text, and the HTML with that heading removed. */
function takeHeading(html: string): { heading?: string; rest: string } {
  const m = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(html)
  if (!m) return { rest: html }
  return { heading: strip(m[2]), rest: html.replace(m[0], '') }
}

export type Plan =
  | { kind: 'content'; html: string; videoUrl?: string; imageFile?: string; buttons: { label: string; url?: string; style: 'primary' | 'secondary' | 'download' }[] }
  | { kind: 'accordion'; heading?: string; introHtml: string; items: { question: string; answerHtml: string }[] }
  | { kind: 'tabs'; heading?: string; introHtml: string; tabs: { label: string; html: string }[] }
  | { kind: 'contactDetails'; html: string; mapAddress?: string }
  | { kind: 'form'; html: string; form: string }
  | { kind: 'calculator'; html: string }
  | { kind: 'homeContent'; heading?: string }
  | { kind: 'homeTestimonials'; heading?: string; intro?: string }
  | { kind: 'homeLocations'; heading?: string; intro?: string; tag: string }

const DROP = /^(spacer|social-links|uagb\/separator)$/

/** Splits sections that carry more than one video so each video keeps the text next to it. */
function sections(b: GBlock): GBlock[] {
  if (DROP.test(b.name)) return []
  const multi = videoUrls(b).length > 1 && descendants(b, 'uagb/tabs').length === 0
  const containers = b.children.filter((c) => !DROP.test(c.name))
  if (multi && containers.length > 1) return containers.flatMap(sections)
  if (multi && containers.length === 1) return sections(containers[0])
  return [b]
}

function plan(b: GBlock): Plan[] {
  const faq = descendants(b, 'uagb/faq')[0]
  if (faq) {
    const { heading, rest } = takeHeading(without(b, [faq]))
    const items = descendants(faq, 'uagb/faq-child').map((c) => ({ question: strip(String(c.attrs.question ?? '')), answerHtml: String(c.attrs.answer ?? '') }))
    return [{ kind: 'accordion', heading, introHtml: rest, items }]
  }
  const tabs = descendants(b, 'uagb/tabs')[0]
  if (tabs) {
    const headers = (tabs.attrs.tabHeaders as string[] | undefined) ?? []
    const { heading, rest } = takeHeading(without(b, [tabs]))
    if (headers.includes('Blogs')) return [{ kind: 'homeContent', heading }]
    if (descendants(tabs, /testimonial-grid$/).length) return [{ kind: 'homeTestimonials', heading, intro: strip(rest) || undefined }]
    const children = tabs.children.filter((c) => c.name === 'uagb/tabs-child')
    return [{ kind: 'tabs', heading, introHtml: rest, tabs: children.map((c, i) => ({ label: String(c.attrs.header ?? headers[i] ?? `Tab ${i + 1}`), html: without(c, []) })) }]
  }
  const grid = descendants(b, 'respacio-blocks/location-grid')[0]
  if (grid) {
    const forms = descendants(b, 'shortcode')
    const { heading, rest } = takeHeading(without(b, [grid, ...forms]))
    return [{ kind: 'homeLocations', heading, intro: strip(rest) || undefined, tag: ((grid.attrs.tag as string[] | undefined) ?? [])[0] ?? '' }]
  }
  const map = descendants(b, 'uagb/google-map')[0]
  if (map) {
    const icons = descendants(b, 'uagb/icon')
    return [{ kind: 'contactDetails', html: without(b, [map, ...icons]), mapAddress: String(map.attrs.address ?? '').replace(/([a-z])([A-Z])/g, '$1, $2') || undefined }]
  }
  const misc = descendants(b, 'respacio-blocks/respacio-misc')
  if (misc.length) {
    // "The Home Loan Process": its video and text, then the calculator (the custom home-loan template).
    const video = videoUrls(b)[0]
    return [{ kind: 'content', html: without(b, [...misc, ...descendants(b, 'embed')]), videoUrl: video, buttons: [] }, { kind: 'calculator', html: '' }]
  }
  const form = shortcodes(b).map(formTitle).find((t) => t && !/^download/i.test(t))
  if (form) return [{ kind: 'form', html: without(b, descendants(b, 'shortcode')), form }]
  if (descendants(b, 'respacio-blocks/post-grid').length) return [{ kind: 'homeContent', heading: takeHeading(without(b, [])).heading }]

  // Text and media.
  const removed: GBlock[] = [...descendants(b, 'embed'), ...descendants(b, 'shortcode'), ...descendants(b, /^(spacer|social-links|buttons)$/)]
  const buttons: Extract<Plan, { kind: 'content' }>['buttons'] = []
  for (const btn of descendants(b, 'button')) {
    const a = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(btn.inner)
    // In-page anchors (#h-get-in-touch, the form section) stay; a bare "#" is no link.
    const href = a ? /\shref="((?!#")[^"]+)"/.exec(a[1])?.[1] : undefined
    if (a && strip(a[2])) buttons.push({ label: strip(a[2]), url: href ? relativeLinks(href) : undefined, style: 'primary' })
  }
  for (const h of descendants(b, 'html')) {
    removed.push(h)
    // Gated downloads: the logged-in and logged-out variants carry the same label.
    const dl = /data-target="#(?:Download_model\w*|loginsignupmodel)"[^>]*>([\s\S]*?)<b>/i.exec(h.inner)
    if (dl) {
      const label = strip(dl[1])
      if (!buttons.some((x) => x.label === label)) buttons.push({ label, style: 'download' })
      continue
    }
    const link = /<a href="([^"]+)"[^>]*>\s*<p class="view-more"><span>([^<]+)/i.exec(h.inner)
    if (link) buttons.push({ label: strip(link[2]), url: relativeLinks(link[1]), style: 'secondary' })
  }
  const videos = videoUrls(b)
  const images = descendants(b, 'image')
  let imageFile: string | undefined
  if (!videos.length && images.length === 1) {
    imageFile = /\/wp-content\/uploads\/([^"?]+)/.exec(images[0].inner)?.[1]
    if (imageFile) removed.push(images[0])
  }
  const html = without(b, removed)
  if (!strip(html) && !videos.length && !imageFile && !buttons.length) return []
  return [{ kind: 'content', html, videoUrl: videos[0], imageFile, buttons }]
}

/** A page's sections as block plans; consecutive plain-text sections are merged into one. */
export function planPage(content: string): Plan[] {
  const out: Plan[] = []
  for (const s of parseBlocks(content).flatMap(sections)) {
    for (const p of plan(s)) {
      const prev = out[out.length - 1]
      const plain = (x: Plan) => x.kind === 'content' && !x.videoUrl && !x.imageFile && x.buttons.length === 0
      if (prev && plain(prev) && plain(p) && prev.kind === 'content' && p.kind === 'content') prev.html += p.html
      else out.push(p)
    }
  }
  return out
}
