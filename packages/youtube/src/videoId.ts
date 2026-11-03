import { YouTubeError } from './types'

const ID = /^[A-Za-z0-9_-]{11}$/

/** Accepts a bare id or a youtube.com / youtu.be URL; never returns anything but an 11-char id. */
export function parseVideoId(input: string): string {
  const s = input.trim()
  if (ID.test(s)) return s
  let url: URL
  try {
    url = new URL(s)
  } catch {
    throw new YouTubeError('NOT_FOUND', 'Not a YouTube video id or URL')
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  let candidate: string | null = null
  if (host === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com') {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v')
    else {
      const m = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)
      candidate = m?.[1] ?? null
    }
  }
  if (!candidate || !ID.test(candidate)) throw new YouTubeError('NOT_FOUND', 'No video id found')
  return candidate
}
