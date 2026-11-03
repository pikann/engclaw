import { z } from 'zod'

export const PingRequest = z.object({ message: z.string().max(200) }).strict()
export const PingResponse = z.object({ echo: z.string(), platform: z.string() })

export type PingRequest = z.infer<typeof PingRequest>
export type PingResponse = z.infer<typeof PingResponse>

export const YouTubeErrorCode = z.enum([
  'NOT_FOUND',
  'NO_CAPTIONS',
  'RATE_LIMITED',
  'EXTRACTOR_BROKEN',
  'NETWORK',
])
export const VideoRef = z.object({ videoId: z.string().min(1).max(200) }).strict()
export const TranscriptRequest = VideoRef.extend({ lang: z.string().min(2).max(16) })
export const AudioRangeRequest = VideoRef.extend({
  start: z.number().min(0),
  end: z.number().min(0),
})
export const VideoMeta = z.object({
  videoId: z.string(),
  title: z.string(),
  durationSec: z.number(),
  captionTracks: z.array(z.object({ lang: z.string(), auto: z.boolean() })),
})
export const TranscriptCue = z.object({ start: z.number(), dur: z.number(), text: z.string() })
export const AudioRangeResponse = z.object({
  bytes: z.custom<Uint8Array>((v) => v instanceof Uint8Array),
  mime: z.string(),
  offsetSec: z.number(),
})
export type YouTubeResult<T> =
  { ok: true; value: T } | { ok: false; code: z.infer<typeof YouTubeErrorCode>; message: string }

const youtubeResult = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), code: YouTubeErrorCode, message: z.string() }),
  ])

export const LanguageRequest = z.object({ language: z.string().min(2).max(16) }).strict()

export const IPC = {
  ping: 'app:ping',
  settingsGetLanguage: 'settings:getLanguage',
  settingsSetLanguage: 'settings:setLanguage',
  settingsLanguageChanged: 'settings:languageChanged',
  youtubeMeta: 'youtube:meta',
  youtubeTranscript: 'youtube:transcript',
  youtubeAudioRange: 'youtube:audioRange',
} as const

const noArgs = z.undefined()

/**
 * Every renderer -> main request/response channel. This registry is the single source of truth:
 * main registers handlers only for these channels, and preload exposes only methods built from
 * them. A channel without an entry here cannot be wired up (the types stop it).
 */
export const invokeChannels = {
  [IPC.ping]: { request: PingRequest, response: PingResponse },
  [IPC.settingsGetLanguage]: { request: noArgs, response: z.string() },
  [IPC.settingsSetLanguage]: { request: LanguageRequest, response: z.string() },
  [IPC.youtubeMeta]: { request: VideoRef, response: youtubeResult(VideoMeta) },
  [IPC.youtubeTranscript]: {
    request: TranscriptRequest,
    response: youtubeResult(z.array(TranscriptCue)),
  },
  [IPC.youtubeAudioRange]: {
    request: AudioRangeRequest,
    response: youtubeResult(AudioRangeResponse),
  },
} as const

/** Main -> renderer push channels and their payload schemas. */
export const eventChannels = {
  [IPC.settingsLanguageChanged]: z.string(),
} as const

export type InvokeChannel = keyof typeof invokeChannels
export type EventChannel = keyof typeof eventChannels
export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeChannels)[C]['request']>
export type InvokeResponse<C extends InvokeChannel> = z.infer<
  (typeof invokeChannels)[C]['response']
>

export const isInvokeChannel = (channel: string): channel is InvokeChannel =>
  Object.prototype.hasOwnProperty.call(invokeChannels, channel)

export const isEventChannel = (channel: string): channel is EventChannel =>
  Object.prototype.hasOwnProperty.call(eventChannels, channel)

export interface EngclawApi {
  ping(req: PingRequest): Promise<PingResponse>
  settings: {
    getLanguage(): Promise<string>
    setLanguage(req: z.infer<typeof LanguageRequest>): Promise<string>
    /** Subscribes to language changes made anywhere (e.g. the app menu); returns an unsubscribe fn. */
    onLanguageChanged(cb: (language: string) => void): () => void
  }
  youtube: {
    meta(req: z.infer<typeof VideoRef>): Promise<YouTubeResult<z.infer<typeof VideoMeta>>>
    transcript(
      req: z.infer<typeof TranscriptRequest>,
    ): Promise<YouTubeResult<z.infer<typeof TranscriptCue>[]>>
    audioRange(
      req: z.infer<typeof AudioRangeRequest>,
    ): Promise<YouTubeResult<z.infer<typeof AudioRangeResponse>>>
  }
}
