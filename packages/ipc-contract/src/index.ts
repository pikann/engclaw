import { z } from 'zod'

export const PingRequest = z.object({ message: z.string().max(200) })
export const PingResponse = z.object({ echo: z.string(), platform: z.string() })

export type PingRequest = z.infer<typeof PingRequest>
export type PingResponse = z.infer<typeof PingResponse>

export const YouTubeErrorCode = z.enum(['NOT_FOUND', 'NO_CAPTIONS', 'RATE_LIMITED', 'EXTRACTOR_BROKEN', 'NETWORK'])
export const VideoRef = z.object({ videoId: z.string().min(1).max(200) })
export const TranscriptRequest = VideoRef.extend({ lang: z.string().min(2).max(16) })
export const AudioRangeRequest = VideoRef.extend({ start: z.number().min(0), end: z.number().min(0) })
export const VideoMeta = z.object({
  videoId: z.string(),
  title: z.string(),
  durationSec: z.number(),
  captionTracks: z.array(z.object({ lang: z.string(), auto: z.boolean() })),
})
export const TranscriptCue = z.object({ start: z.number(), dur: z.number(), text: z.string() })
export const AudioRangeResponse = z.object({ bytes: z.instanceof(Uint8Array), mime: z.string(), offsetSec: z.number() })
export type YouTubeResult<T> = { ok: true; value: T } | { ok: false; code: z.infer<typeof YouTubeErrorCode>; message: string }

export const IPC = {
  ping: 'app:ping',
  youtubeMeta: 'youtube:meta',
  youtubeTranscript: 'youtube:transcript',
  youtubeAudioRange: 'youtube:audioRange',
} as const

export interface EngclawApi {
  ping(req: PingRequest): Promise<PingResponse>
  youtube: {
    meta(req: z.infer<typeof VideoRef>): Promise<YouTubeResult<z.infer<typeof VideoMeta>>>
    transcript(req: z.infer<typeof TranscriptRequest>): Promise<YouTubeResult<z.infer<typeof TranscriptCue>[]>>
    audioRange(req: z.infer<typeof AudioRangeRequest>): Promise<YouTubeResult<z.infer<typeof AudioRangeResponse>>>
  }
}
