import { Innertube, UniversalCache } from 'youtubei.js'
import {
  YouTubeError,
  type AudioRange,
  type TranscriptCue,
  type VideoMeta,
  type YouTubeAdapter,
} from './types'
import { parseVideoId } from './videoId'

type Info = Awaited<ReturnType<Innertube['getBasicInfo']>>
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
    this.clients = opts.clients ?? ['MWEB', 'IOS', 'WEB']
    this.fetchFn = opts.fetch ?? fetch
  }

  private innertube(): Promise<Innertube> {
    this.yt ??= Innertube.create({ cache: new UniversalCache(false) })
    return this.yt
  }

  private async info(
    videoId: string,
    usable: (info: Info) => boolean = () => true,
    clients: Client[] = this.clients,
  ) {
    const id = parseVideoId(videoId)
    let last: unknown
    for (const client of clients) {
      try {
        const info = await (await this.innertube()).getBasicInfo(id, { client })
        const status = info.playability_status?.status
        if (status === 'ERROR') throw new YouTubeError('NOT_FOUND', info.playability_status?.reason ?? 'unavailable')
        if (status !== 'OK') last = new Error(`playability ${status}`)
        else if (usable(info)) return info
        else last = new Error('no usable format')
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
      const res = await this.fetchFn(`${new URL(track.base_url, 'https://www.youtube.com').href}&fmt=json3`)
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
    let last: unknown
    // A client can hand out audio URLs that then 403, so each one gets its chance.
    for (const client of this.clients) {
      try {
        return await this.audioRangeVia(client, videoId, startSec, endSec)
      } catch (e) {
        last = e
      }
    }
    throw classify(last)
  }

  /** Init segment plus only the fragments covering the range: a standalone fMP4 the browser can decode. */
  private async audioRangeVia(client: Client, videoId: string, startSec: number, endSec: number): Promise<AudioRange> {
    const pickAudio = (i: Info) =>
      i.streaming_data?.adaptive_formats
        .filter((f) => f.has_audio && !f.has_video && f.url && f.init_range && f.index_range)
        .sort((a, b) => a.bitrate - b.bitrate)[0]
    const info = await this.info(videoId, (i) => !!pickAudio(i), [client])
    const fmt = pickAudio(info)
    if (!fmt?.url || !fmt.init_range || !fmt.index_range) throw new YouTubeError('EXTRACTOR_BROKEN', 'No usable audio format')
    const url = fmt.url
    const get = async (from: number, to: number) => {
      const res = await this.fetchFn(url, { headers: { range: `bytes=${from}-${to}` } })
      if (!res.ok) throw new Error(`audio status code ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    }
    const head = await get(0, fmt.index_range.end)
    const frags = parseSidx(head.subarray(fmt.index_range.start), fmt.index_range.end + 1)
    if (!frags.length) throw new YouTubeError('EXTRACTOR_BROKEN', 'No fragment index')
    const picked = frags.filter((f) => f.start + f.dur > startSec && f.start < endSec)
    const first = picked[0]
    const lastFrag = picked[picked.length - 1]
    if (!first || !lastFrag) throw new YouTubeError('NOT_FOUND', 'Range outside the audio')
    const body = await get(first.offset, lastFrag.offset + lastFrag.size - 1)
    const init = head.subarray(0, fmt.init_range.end + 1)
    const bytes = new Uint8Array(init.length + body.length)
    bytes.set(init)
    bytes.set(body, init.length)
    return { bytes, mime: fmt.mime_type, offsetSec: first.start }
  }
}

export interface SidxFragment {
  start: number
  dur: number
  offset: number
  size: number
}

/** Fragment table of an MP4 `sidx` box; `anchor` is the byte just after the box (first_offset is relative to it). */
export function parseSidx(box: Uint8Array, anchor: number): SidxFragment[] {
  const v = new DataView(box.buffer, box.byteOffset, box.byteLength)
  if (box.length < 32 || v.getUint32(4) !== 0x73696478) return []
  const version = v.getUint8(8)
  const timescale = v.getUint32(16)
  let p = 20
  let time: number
  let offset: number
  if (version === 0) {
    time = v.getUint32(p)
    offset = anchor + v.getUint32(p + 4)
    p += 8
  } else {
    time = Number(v.getBigUint64(p))
    offset = anchor + Number(v.getBigUint64(p + 8))
    p += 16
  }
  const count = v.getUint16(p + 2)
  p += 4
  const out: SidxFragment[] = []
  for (let i = 0; i < count && p + 12 <= box.length; i++, p += 12) {
    const size = v.getUint32(p) & 0x7fffffff
    const dur = v.getUint32(p + 4)
    out.push({ start: time / timescale, dur: dur / timescale, offset, size })
    time += dur
    offset += size
  }
  return out
}
