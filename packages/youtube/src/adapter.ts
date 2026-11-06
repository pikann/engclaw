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
  if (/status code (429)|automated queries/i.test(msg))
    return new YouTubeError('RATE_LIMITED', msg, { cause: e })
  if (/unavailable|not found|status code 404/i.test(msg))
    return new YouTubeError('NOT_FOUND', msg, { cause: e })
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|ECONNREFUSED/i.test(msg))
    return new YouTubeError('NETWORK', msg, { cause: e })
  return new YouTubeError('EXTRACTOR_BROKEN', msg, { cause: e })
}

/** Wraps youtubei.js. Only ever called with a parsed 11-char id. */
export class InnertubeAdapter implements YouTubeAdapter {
  private yt: Promise<Innertube> | null = null
  private readonly streams = new Map<string, { at: number; stream: Promise<AudioStream> }>()
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
        if (status === 'ERROR')
          throw new YouTubeError('NOT_FOUND', info.playability_status?.reason ?? 'unavailable')
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
      const res = await this.fetchFn(
        `${new URL(track.base_url, 'https://www.youtube.com').href}&fmt=json3`,
      )
      if (!res.ok) throw new Error(`timedtext status code ${res.status}`)
      const json = (await res.json()) as {
        events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[]
      }
      const cues = (json.events ?? [])
        .filter((e) => e.segs)
        .map((e) => ({
          start: e.tStartMs / 1000,
          dur: (e.dDurationMs ?? 0) / 1000,
          text: e
            .segs!.map((s) => s.utf8)
            .join('')
            .replace(/\s+/g, ' ')
            .trim(),
        }))
        .filter((c) => c.text)
      if (!cues.length) throw new YouTubeError('NO_CAPTIONS', 'Empty caption track')
      return cues
    } catch (e) {
      throw classify(e)
    }
  }

  async audioRange(videoId: string, startSec: number, endSec: number): Promise<AudioRange> {
    if (!(endSec > startSec) || endSec - startSec > 120)
      throw new YouTubeError('NOT_FOUND', 'Invalid range')
    // A cached stream's URL can have expired: drop it and look the video up once more.
    for (const attempt of [0, 1]) {
      let stream: AudioStream
      try {
        stream = await this.audioStream(videoId)
      } catch (e) {
        throw classify(e)
      }
      try {
        return await this.fetchRange(stream, startSec, endSec)
      } catch (e) {
        this.streams.delete(videoId)
        if (attempt === 1 || e instanceof YouTubeError) throw classify(e)
      }
    }
    throw new YouTubeError('EXTRACTOR_BROKEN', 'unreachable')
  }

  /**
   * The audio stream of a video: its URL and fragment index. Looked up once per video and shared,
   * because every lookup is a player request that YouTube throttles when a transcript is walked.
   */
  private audioStream(videoId: string): Promise<AudioStream> {
    const hit = this.streams.get(videoId)
    if (hit && Date.now() - hit.at < STREAM_TTL_MS) return hit.stream
    const stream = this.lookupStream(videoId)
    this.streams.set(videoId, { at: Date.now(), stream })
    // A failed lookup is remembered briefly too, so a throttled video is not asked again per segment.
    stream.catch(() => {
      const entry = this.streams.get(videoId)
      if (entry?.stream === stream) entry.at = Date.now() - STREAM_TTL_MS + FAILED_LOOKUP_TTL_MS
    })
    return stream
  }

  private async lookupStream(videoId: string): Promise<AudioStream> {
    let last: unknown
    // A client can hand out audio URLs that then 403, so each one gets its chance.
    for (const client of this.clients) {
      try {
        return await this.streamVia(client, videoId)
      } catch (e) {
        last = e
      }
    }
    throw classify(last)
  }

  private async streamVia(client: Client, videoId: string): Promise<AudioStream> {
    const pickAudio = (i: Info) =>
      i.streaming_data?.adaptive_formats
        .filter((f) => f.has_audio && !f.has_video && f.url && f.init_range && f.index_range)
        .sort((a, b) => a.bitrate - b.bitrate)[0]
    const info = await this.info(videoId, (i) => !!pickAudio(i), [client])
    const fmt = pickAudio(info)
    if (!fmt?.url || !fmt.init_range || !fmt.index_range)
      throw new YouTubeError('EXTRACTOR_BROKEN', 'No usable audio format')
    const url = fmt.url
    const head = await this.getBytes(url, 0, fmt.index_range.end)
    const frags = parseSidx(head.subarray(fmt.index_range.start), fmt.index_range.end + 1)
    if (!frags.length) throw new YouTubeError('EXTRACTOR_BROKEN', 'No fragment index')
    return { url, mime: fmt.mime_type, init: head.subarray(0, fmt.init_range.end + 1), frags }
  }

  private async getBytes(url: string, from: number, to: number): Promise<Uint8Array> {
    const res = await this.fetchFn(url, { headers: { range: `bytes=${from}-${to}` } })
    if (!res.ok) throw new Error(`audio status code ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  /** Init segment plus only the fragments covering the range: a standalone fMP4 the browser can decode. */
  private async fetchRange(
    stream: AudioStream,
    startSec: number,
    endSec: number,
  ): Promise<AudioRange> {
    const picked = stream.frags.filter((f) => f.start + f.dur > startSec && f.start < endSec)
    const first = picked[0]
    const lastFrag = picked[picked.length - 1]
    if (!first || !lastFrag) throw new YouTubeError('NOT_FOUND', 'Range outside the audio')
    const body = await this.getBytes(stream.url, first.offset, lastFrag.offset + lastFrag.size - 1)
    const bytes = new Uint8Array(stream.init.length + body.length)
    bytes.set(stream.init)
    bytes.set(body, stream.init.length)
    return { bytes, mime: stream.mime, offsetSec: first.start }
  }
}

interface AudioStream {
  url: string
  mime: string
  init: Uint8Array
  frags: SidxFragment[]
}

/** Stream URLs live for hours; this keeps well inside that. */
const STREAM_TTL_MS = 20 * 60_000
const FAILED_LOOKUP_TTL_MS = 20_000

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
