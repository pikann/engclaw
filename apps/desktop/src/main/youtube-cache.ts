import type { AudioRange, TranscriptCue, VideoMeta, YouTubeAdapter } from '@engclaw/youtube'
import type { AudioRangeCache } from './audio-range-cache'
import type { RecentVideo, VideoStore } from './store/videos'

/** Cache-first view of the YouTube adapter: a video seen once opens again without the network. */
export class CachedYouTube {
  constructor(
    private readonly adapter: YouTubeAdapter,
    private readonly videos: VideoStore,
    private readonly audio?: AudioRangeCache,
  ) {}

  async meta(videoId: string): Promise<VideoMeta> {
    const cached = this.videos.getMeta(videoId)
    if (cached) return cached
    const meta = await this.adapter.meta(videoId)
    this.videos.putMeta(meta)
    return meta
  }

  /** Loading a transcript is what opens a session, so it also bumps the video in recents. */
  async transcript(videoId: string, lang: string): Promise<TranscriptCue[]> {
    let cues = this.videos.getTranscript(videoId, lang)
    if (!cues) {
      cues = await this.adapter.transcript(videoId, lang)
      this.videos.putTranscript(videoId, lang, cues)
    }
    this.videos.touch(videoId)
    return cues
  }

  private readonly pendingRanges = new Map<string, Promise<AudioRange>>()

  /** Concurrent requests for the same range share one fetch. */
  audioRange(videoId: string, start: number, end: number): Promise<AudioRange> {
    const key = `${videoId}:${start}:${end}`
    let pending = this.pendingRanges.get(key)
    if (!pending) {
      pending = this.fetchRange(videoId, start, end).finally(() => this.pendingRanges.delete(key))
      this.pendingRanges.set(key, pending)
    }
    return pending
  }

  private async fetchRange(videoId: string, start: number, end: number): Promise<AudioRange> {
    const hit = await this.audio?.get(videoId, start, end)
    if (hit) return hit
    const range = await this.adapter.audioRange(videoId, start, end)
    await this.audio?.put(videoId, start, end, range).catch(() => undefined)
    return range
  }

  recent(limit?: number): RecentVideo[] {
    return this.videos.recent(limit)
  }
}
