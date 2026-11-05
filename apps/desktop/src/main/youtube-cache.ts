import type { TranscriptCue, VideoMeta, YouTubeAdapter } from '@engclaw/youtube'
import type { RecentVideo, VideoStore } from './store/videos'

/** Cache-first view of the YouTube adapter: a video seen once opens again without the network. */
export class CachedYouTube {
  constructor(
    private readonly adapter: YouTubeAdapter,
    private readonly videos: VideoStore,
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

  recent(limit?: number): RecentVideo[] {
    return this.videos.recent(limit)
  }
}
