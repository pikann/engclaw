import type { WordImage } from '@engclaw/ipc-contract'
import type { ImageCredit, WordImageStore } from './store/word-images'

const API_HOSTS = new Set(['en.wikipedia.org', 'commons.wikimedia.org'])
const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org'])
const MAX_IMAGE_BYTES = 1024 * 1024
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Outbound requests are limited to HTTPS on the Wikimedia hosts this feature needs. */
export function isAllowedWikimediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (
      u.protocol === 'https:' &&
      u.username === '' &&
      u.password === '' &&
      (API_HOSTS.has(u.hostname) || IMAGE_HOSTS.has(u.hostname))
    )
  } catch {
    return false
  }
}

const ABSTRACT_SUFFIX = /(ness|ity|tion|sion|ism|ment|ship|hood|ance|ence|dom|ics)$/i
const ABSTRACT_DESCRIPTION =
  /\b(concept|abstract|emotion|feeling|philosoph\w*|quality|state of|term|ideology|theory|disambiguation)\b/i

/** Only plausibly concrete nouns get a picture; "nothing" beats a wrong or vague one. */
export function isConcreteCandidate(word: string, hasNounSense: boolean): boolean {
  return hasNounSense && /^[a-z][a-z' -]{1,40}$/i.test(word) && !ABSTRACT_SUFFIX.test(word)
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Free-to-reuse licenses only: CC BY / BY-SA / CC0 / public domain; never NC or ND. */
export function isFreeLicense(name: string): boolean {
  return /^(cc[ -]by|cc0|public domain|pd\b|attribution)/i.test(name) && !/-(nc|nd)\b/i.test(name)
}

/** Commons file name behind an `upload.wikimedia.org/wikipedia/commons/...` URL; null for non-Commons files. */
export function commonsFileName(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (!IMAGE_HOSTS.has(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'wikipedia' || parts[1] !== 'commons') return null
    const name = parts[2] === 'thumb' ? parts[5] : parts[4]
    return name ? decodeURIComponent(name) : null
  } catch {
    return null
  }
}

interface Summary {
  type?: string
  title?: string
  description?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

interface Meta {
  Artist?: { value?: string }
  LicenseShortName?: { value?: string }
  LicenseUrl?: { value?: string }
  NonFree?: { value?: string }
  Restrictions?: { value?: string }
}

export interface WordImageOptions {
  store: WordImageStore
  fetch: typeof fetch
  enabled: () => boolean
  userAgent: string
  minIntervalMs?: number
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const toWordImage = (bytes: Uint8Array, mime: string, c: ImageCredit): WordImage => ({
  src: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
  author: c.author,
  license: c.license,
  licenseUrl: c.licenseUrl,
  pageUrl: c.pageUrl,
})

/** Finds a freely licensed Wikimedia illustration for a word; cache-first, rate-limited, never throws. */
export class WordImageService {
  private last = 0
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly o: WordImageOptions) {}

  async get(word: string, hasNounSense: boolean): Promise<WordImage | null> {
    if (!this.o.enabled()) return null
    const key = word.toLowerCase()
    const cached = this.o.store.get(key)
    if (cached?.kind === 'none') return null
    if (cached) return toWordImage(cached.bytes, cached.mime, cached)
    if (!isConcreteCandidate(key, hasNounSense)) return null
    try {
      const found = await this.lookup(key)
      if (!found) {
        this.o.store.putNone(key)
        return null
      }
      this.o.store.putFound(key, found.bytes, found.mime, found.credit)
      return toWordImage(found.bytes, found.mime, found.credit)
    } catch {
      return null
    }
  }

  private async lookup(word: string) {
    const summary = await this.json<Summary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
    )
    if (!summary || summary.type !== 'standard') return null
    const title = (summary.title ?? '').replace(/\s*\(.*\)$/, '').toLowerCase()
    if (title !== word || ABSTRACT_DESCRIPTION.test(summary.description ?? '')) return null
    const thumb = summary.thumbnail?.source
    const file = thumb ? commonsFileName(thumb) : null
    if (!thumb || !file) return null

    const meta = await this.commonsMeta(file)
    const license = meta?.LicenseShortName?.value?.trim() ?? ''
    if (
      !meta ||
      meta.NonFree?.value === 'true' ||
      (meta.Restrictions?.value ?? '') !== '' ||
      !isFreeLicense(license)
    )
      return null

    const image = await this.image(thumb)
    if (!image) return null
    const credit: ImageCredit = {
      author: stripHtml(meta.Artist?.value ?? '').slice(0, 120) || 'Unknown author',
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
      pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
    }
    return { ...image, credit }
  }

  private async commonsMeta(file: string): Promise<Meta | null> {
    const q = new URLSearchParams({
      action: 'query',
      titles: `File:${file}`,
      prop: 'imageinfo',
      iiprop: 'extmetadata',
      format: 'json',
      formatversion: '2',
    })
    const res = await this.json<{
      query?: { pages?: { imageinfo?: { extmetadata?: Meta }[] }[] }
    }>(`https://commons.wikimedia.org/w/api.php?${q}`)
    return res?.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata ?? null
  }

  private async image(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    const res = await this.request(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!IMAGE_MIMES.has(mime)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? { bytes, mime } : null
  }

  /** null on 404 (a definitive "no page"); throws on any other failure so nothing is cached. */
  private async json<T>(url: string): Promise<T | null> {
    const res = await this.request(url, 'application/json')
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  }

  private request(url: string, accept = 'image/*'): Promise<Response> {
    if (!isAllowedWikimediaUrl(url)) return Promise.reject(new Error('blocked host'))
    const run = async (): Promise<Response> => {
      const now = this.o.now ?? Date.now
      const wait = this.last + (this.o.minIntervalMs ?? 250) - now()
      if (wait > 0) await (this.o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait)
      this.last = now()
      return this.o.fetch(url, {
        headers: { 'User-Agent': this.o.userAgent, Accept: accept },
        redirect: 'error',
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 6000),
      })
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }
}
