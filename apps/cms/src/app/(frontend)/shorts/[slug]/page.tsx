import { notFound } from 'next/navigation'

import { payload } from '@/lib/site/payload'
import { youtubeId } from '@/lib/site/youtube'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const findShort = async (slug: string) => (await (await payload()).find({ collection: 'shorts', where: { slug: { equals: slug } }, depth: 0, limit: 1 })).docs[0] ?? null

export async function generateMetadata({ params }: Props) {
  const s = await findShort((await params).slug)
  return s ? { title: s.title } : {}
}

/** /shorts/{slug}/ — a video short (YouTube) with its description. */
export default async function ShortPage({ params }: Props) {
  const short = await findShort((await params).slug)
  if (!short) notFound()
  const id = youtubeId(short.videoUrl)
  return (
    <article className="short-page">
      <h1>{short.title}</h1>
      {id && (
        <iframe
          className="short-video"
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={short.title}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
      {short.description && <p>{short.description}</p>}
    </article>
  )
}
