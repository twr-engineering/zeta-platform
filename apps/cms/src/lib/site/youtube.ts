/** YouTube id from a watch, youtu.be or /shorts/ URL. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/.exec(url)
  return m ? m[1] : null
}
export const youtubeThumb = (url: string | null | undefined) => {
  const id = youtubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}
