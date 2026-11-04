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

export const ModelErrorCode = z.enum([
  'UNKNOWN_MODEL',
  'BUSY',
  'DISK_SPACE',
  'NETWORK',
  'CHECKSUM',
  'CANCELLED',
])
export const ModelRef = z.object({ id: z.string().min(1).max(64) }).strict()
export const ModelStatus = z.object({
  id: z.string(),
  name: z.string(),
  license: z.string(),
  revision: z.string(),
  sizeBytes: z.number(),
  state: z.enum(['not-installed', 'downloading', 'ready']),
  installedRevision: z.string().nullable(),
  updateAvailable: z.boolean(),
  path: z.string().nullable(),
})
export const ModelProgress = z.object({
  id: z.string(),
  phase: z.enum(['downloading', 'verifying', 'ready', 'error', 'cancelled']),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  error: ModelErrorCode.optional(),
})
export const ModelOpResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: ModelErrorCode, message: z.string() }),
])
export type ModelStatus = z.infer<typeof ModelStatus>
export type ModelProgress = z.infer<typeof ModelProgress>
export type ModelOpResult = z.infer<typeof ModelOpResult>

export const IPC = {
  ping: 'app:ping',
  settingsGetLanguage: 'settings:getLanguage',
  settingsSetLanguage: 'settings:setLanguage',
  settingsLanguageChanged: 'settings:languageChanged',
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsRemove: 'models:remove',
  modelsGetDir: 'models:getDir',
  modelsChooseDir: 'models:chooseDir',
  modelsOpenFolder: 'models:openFolder',
  modelsProgress: 'models:progress',
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
  [IPC.modelsList]: { request: noArgs, response: z.array(ModelStatus) },
  [IPC.modelsDownload]: { request: ModelRef, response: ModelOpResult },
  [IPC.modelsCancel]: { request: ModelRef, response: z.null() },
  [IPC.modelsRemove]: { request: ModelRef, response: ModelOpResult },
  [IPC.modelsGetDir]: { request: noArgs, response: z.string() },
  /** Opens a folder picker; resolves to the chosen dir, or null if dismissed. */
  [IPC.modelsChooseDir]: { request: noArgs, response: z.string().nullable() },
  [IPC.modelsOpenFolder]: { request: noArgs, response: z.null() },
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
  [IPC.modelsProgress]: ModelProgress,
} as const

export type InvokeChannel = keyof typeof invokeChannels
export type EventChannel = keyof typeof eventChannels
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventChannels)[C]>
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
  models: {
    list(): Promise<ModelStatus[]>
    download(req: z.infer<typeof ModelRef>): Promise<ModelOpResult>
    cancel(req: z.infer<typeof ModelRef>): Promise<null>
    remove(req: z.infer<typeof ModelRef>): Promise<ModelOpResult>
    getDir(): Promise<string>
    chooseDir(): Promise<string | null>
    openFolder(): Promise<null>
    onProgress(cb: (e: ModelProgress) => void): () => void
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
