export const YOUTUBE_ERROR_CODES = [
  'NOT_FOUND',
  'NO_CAPTIONS',
  'RATE_LIMITED',
  'EXTRACTOR_BROKEN',
  'NETWORK',
] as const
export type YouTubeErrorCode = (typeof YOUTUBE_ERROR_CODES)[number]

export class YouTubeError extends Error {
  constructor(
    readonly code: YouTubeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'YouTubeError'
  }
}

export interface CaptionTrack {
  lang: string
  auto: boolean
}
export interface VideoMeta {
  videoId: string
  title: string
  durationSec: number
  captionTracks: CaptionTrack[]
}
export interface TranscriptCue {
  start: number
  dur: number
  text: string
}
export interface AudioRange {
  /** Encoded audio (container as reported by `mime`), covering at least [start, end]. */
  bytes: Uint8Array
  mime: string
  /** Offset in seconds of the first sample in `bytes` relative to the video start. */
  offsetSec: number
}

/** The only surface the rest of the app sees; the extractor library stays behind it. */
export interface YouTubeAdapter {
  meta(videoId: string): Promise<VideoMeta>
  transcript(videoId: string, lang: string): Promise<TranscriptCue[]>
  audioRange(videoId: string, startSec: number, endSec: number): Promise<AudioRange>
}
