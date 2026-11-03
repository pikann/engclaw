import { Innertube, UniversalCache } from 'youtubei.js'
import {
  YouTubeError,
  type AudioRange,
  type TranscriptCue,
  type VideoMeta,
  type YouTubeAdapter,
} from './types'
import { parseVideoId } from './videoId'

type Client = 'WEB' | 'MWEB' | 'IOS' | 'ANDROID' | 'TV'
export interface InnertubeAdapterOptions {
  /** Tried in order. Which clients YouTube accepts varies by network; see docs. */
  clients?: Client[]
  /** Injectable for tests. */
  fetch?: typeof fetch
}

function classify(e: unknown): YouTubeError {
  if (e instanceof YouTubeError) return e
  const msg = String(e)
  if (/status code (429)|automated queries/i.test(msg)) return new YouTubeError('RATE_LIMITED', msg, { cause: e })
  if (/unavailable|not found|status code 404/i.test(msg)) return new YouTubeError('NOT_FOUND', msg, { cause: e })
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|ECONNREFUSED/i.test(msg)) return new YouTubeError('NETWORK', msg, { cause: e })
  return new YouTubeError('EXTRACTOR_BROKEN', msg, { cause: e })
}

/** Wraps youtubei.js. Only ever called with a parsed 11-char id. */
export class InnertubeAdapter implements YouTubeAdapter {
  private yt: Promise<Innertube> | null = null
  private readonly clients: Client[]
  private readonly fetchFn: typeof fetch

  constructor(opts: InnertubeAdapterOptions = {}) {
    this.clients = opts.clients ?? ['WEB']
    this.fetchFn = opts.fetch ?? fetch
  }

  private innertube(): Promise<Innertube> {
    this.yt ??= Innertube.create({ cache: new UniversalCache(false) })
    return this.yt
  }

  private async info(videoId: string) {
    const id = parseVideoId(videoId)
    let last: unknown
    for (const client of this.clients) {
      try {
        const info = await (await this.innertube()).getBasicInfo(id, { client })
        const status = info.playability_status?.status
        if (status === 'ERROR') throw new YouTubeError('NOT_FOUND', info.playability_status?.reason ?? 'unavailable')
        if (status === 'OK') return info
        last = new Error(`playability ${status}`)
      } catch (e) {
        last = e
      }
    }
    throw classify(last)
  }

  async meta(videoId: string): Promise<VideoMeta> {
    const info = await this.info(videoId)
    return {
      videoId,
      title: info.basic_info.title ?? '',
      durationSec: info.basic_info.duration ?? 0,
      captionTracks: (info.captions?.caption_tracks ?? []).map((t) => ({
        lang: t.language_code,
        auto: t.kind === 'asr',
      })),
    }
  }

  async transcript(videoId: string, lang: string): Promise<TranscriptCue[]> {
    const info = await this.info(videoId)
    const track = info.captions?.caption_tracks?.find((t) => t.language_code === lang)
    if (!track) throw new YouTubeError('NO_CAPTIONS', `No ${lang} captions`)
    try {
      const res = await this.fetchFn(`${track.base_url}&fmt=json3`)
      if (!res.ok) throw new Error(`timedtext status code ${res.status}`)
      const json = (await res.json()) as { events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[] }
      const cues = (json.events ?? [])
        .filter((e) => e.segs)
        .map((e) => ({
          start: e.tStartMs / 1000,
          dur: (e.dDurationMs ?? 0) / 1000,
          text: e.segs!.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim(),
        }))
        .filter((c) => c.text)
      if (!cues.length) throw new YouTubeError('NO_CAPTIONS', 'Empty caption track')
      return cues
    } catch (e) {
      throw classify(e)
    }
  }

  async audioRange(videoId: string, startSec: number, endSec: number): Promise<AudioRange> {
    if (!(endSec > startSec) || endSec - startSec > 120) throw new YouTubeError('NOT_FOUND', 'Invalid range')
    const info = await this.info(videoId)
    const fmt = info.streaming_data?.adaptive_formats
      .filter((f) => f.has_audio && !f.has_video && f.url && f.content_length)
      .sort((a, b) => a.bitrate - b.bitrate)[0]
    if (!fmt?.url || !fmt.content_length) throw new YouTubeError('EXTRACTOR_BROKEN', 'No usable audio format')
    // Coarse byte window by average bitrate with padding; decoder trims to exact times downstream.
    const total = fmt.content_length
    const dur = (fmt.approx_duration_ms ?? 0) / 1000 || info.basic_info.duration || 1
    const bps = total / dur
    const pad = 2
    const from = Math.max(0, Math.floor((startSec - pad) * bps))
    const to = Math.min(total - 1, Math.ceil((endSec + pad) * bps))
    try {
      const res = await this.fetchFn(fmt.url, { headers: { range: `bytes=${from}-${to}` } })
      if (!res.ok) throw new Error(`audio status code ${res.status}`)
      return { bytes: new Uint8Array(await res.arrayBuffer()), mime: fmt.mime_type, offsetSec: Math.max(0, startSec - pad) }
    } catch (e) {
      throw classify(e)
    }
  }
}
