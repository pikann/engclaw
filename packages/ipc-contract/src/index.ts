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

export const SpeakRequest = z.object({ text: z.string().min(1).max(1000) }).strict()
export const SpeakErrorCode = z.enum(['MODEL_MISSING', 'FAILED'])
export const SpeakResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** Mono float32 PCM. */
    samples: z.custom<Float32Array>((v) => v instanceof Float32Array),
    sampleRate: z.number(),
    cached: z.boolean(),
  }),
  z.object({ ok: z.literal(false), code: SpeakErrorCode, message: z.string() }),
])
export type SpeakResponse = z.infer<typeof SpeakResponse>

export const LanguageInfo = z.object({
  code: z.string(),
  name: z.string(),
  /** Experimental languages are not calibrated; only English is in the PoC. */
  experimental: z.boolean(),
})
export type LanguageInfo = z.infer<typeof LanguageInfo>

/** 16 kHz mono float32 PCM, at most 60 s. */
const Pcm16k = z.custom<Float32Array>((v) => v instanceof Float32Array && v.length <= 16000 * 60)
const RequestId = z.string().min(1).max(64)
const LanguageCode = z.string().min(2).max(16)

export const AnalyzeRequest = z
  .object({
    requestId: RequestId,
    audio: Pcm16k,
    text: z.string().min(1).max(1000),
    language: LanguageCode.optional(),
  })
  .strict()
export const TranscribeRequest = z
  .object({ requestId: RequestId, audio: Pcm16k, language: LanguageCode.optional() })
  .strict()
export const PhonemizeRequest = z
  .object({ text: z.string().min(1).max(1000), language: LanguageCode.optional() })
  .strict()
export const CancelRequest = z.object({ requestId: RequestId }).strict()

/** Staged loading messages the UI maps to `pronounce.stage.<stage>`. */
export const InferenceStage = z.enum([
  'loading-phone-model',
  'loading-asr-model',
  'loading-voice',
  'synthesizing',
  'recognizing-phones',
  'transcribing',
  'scoring',
])
export const InferenceProgress = z.object({ requestId: z.string(), stage: InferenceStage })
export type InferenceProgress = z.infer<typeof InferenceProgress>

export const InferenceErrorCode = z.enum([
  'MODEL_MISSING',
  'INVALID_INPUT',
  'UNSUPPORTED_LANGUAGE',
  'CANCELLED',
  'PROCESS_CRASHED',
  'FAILED',
])
export type InferenceErrorCode = z.infer<typeof InferenceErrorCode>

const inferenceResult = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({
      ok: z.literal(false),
      code: InferenceErrorCode,
      message: z.string(),
      /** Catalog id of the model to download, for MODEL_MISSING. */
      modelId: z.string().optional(),
    }),
  ])
export type InferenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: InferenceErrorCode; message: string; modelId?: string }

const PhoneReport = z.object({ expected: z.string(), heard: z.string(), confidence: z.number() })
/** OpenPronounce `/pronunciation` body (snake_case, as the Python reference emits it). */
export const PronunciationResult = z.object({
  score: z.number(),
  distance: z.number(),
  acoustic_distance: z.number(),
  differences: z.object({
    word_distance: z.number(),
    phoneme_distance: z.number(),
    word_error_rate: z.number(),
    phoneme_error_rate: z.number(),
    errors: z.array(
      z.object({
        position: z.number(),
        word: z.string(),
        expected: z.string(),
        actual: z.string(),
        actual_word: z.string(),
        phone_distance: z.number(),
        confidence: z.number(),
        phones: z.array(PhoneReport),
      }),
    ),
    /** Locale-neutral (the UI renders `pronounce.feedback.<code>`); upstream sends English prose. */
    feedback: z.object({ code: z.enum(['EXCELLENT', 'NEEDS_WORK']), words: z.array(z.string()) }),
    transcribe: z.string(),
    expected_vector: z.array(z.number()),
    transcribed_vector: z.array(z.number()),
    expected_phonemes: z.array(z.string()),
    transcribed_phonemes: z.array(z.string()),
    words_with_errors: z.array(z.string()),
    expected_phones: z.array(z.array(z.string())),
    heard_phones: z.array(z.string()),
    heard_phones_confidence: z.array(z.number()),
  }),
  feedback: z.object({ code: z.enum(['EXCELLENT', 'NEEDS_WORK']), words: z.array(z.string()) }),
  transcribe: z.string(),
  language: z.string(),
  prosody: z.object({ f0: z.array(z.number()), energy: z.array(z.number()) }),
})
export type PronunciationResult = z.infer<typeof PronunciationResult>
export const TranscribeResult = z.object({ text: z.string(), language: z.string() })
export const PhonemizeResult = z.object({
  words: z.array(z.object({ word: z.string(), phones: z.array(z.string()) })),
  language: z.string(),
})
export type PhonemizeResult = z.infer<typeof PhonemizeResult>

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
/** Where models are stored and whether that folder is usable. */
export const ModelsDiskInfo = z.object({
  dir: z.string(),
  writable: z.boolean(),
  freeBytes: z.number(),
})
/** Outcome of the "choose models folder" dialog; a rejected folder is not saved. */
export const ModelsDirChoice = z.discriminatedUnion('status', [
  z.object({ status: z.literal('cancelled') }),
  z.object({ status: z.literal('chosen'), info: ModelsDiskInfo }),
  z.object({
    status: z.literal('rejected'),
    reason: z.enum(['NOT_WRITABLE', 'DISK_SPACE']),
    info: ModelsDiskInfo,
    /** Bytes still to download; the folder has less than this free. */
    neededBytes: z.number(),
  }),
])
export type ModelStatus = z.infer<typeof ModelStatus>
export type ModelsDiskInfo = z.infer<typeof ModelsDiskInfo>
export type ModelsDirChoice = z.infer<typeof ModelsDirChoice>
export type ModelProgress = z.infer<typeof ModelProgress>
export type ModelOpResult = z.infer<typeof ModelOpResult>

export const HistoryError = z.object({
  word: z.string(),
  expected: z.string(),
  actual: z.string(),
  confidence: z.number(),
})
export const HistoryAttempt = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.number().int().nonnegative(),
  mode: z.enum(['sentence', 'free']),
  text: z.string().max(1000),
  language: z.string().min(2).max(16),
  score: z.number(),
  errors: z.array(HistoryError).max(500),
  hasAudio: z.boolean(),
})
export type HistoryAttempt = z.infer<typeof HistoryAttempt>
export const HistorySaveRequest = HistoryAttempt.omit({ id: true, createdAt: true, hasAudio: true })
  .extend({ audio: Pcm16k.optional() })
  .strict()
export type HistorySaveRequest = z.infer<typeof HistorySaveRequest>
export const HistoryListRequest = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict()
export const HistoryIdRequest = z.object({ id: z.string().min(1).max(64) }).strict()
/** The on-disk export format. `audio` is a base64 16 kHz mono WAV, or null. */
export const HistoryExport = z.object({
  format: z.literal('engclaw-history'),
  version: z.literal(1),
  exportedAt: z.number(),
  attempts: z.array(
    HistoryAttempt.omit({ hasAudio: true }).extend({ audio: z.string().nullable() }),
  ),
})
export type HistoryExportFile = z.infer<typeof HistoryExport>
export const HistoryFileResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('cancelled') }),
  z.object({ status: z.literal('error'), message: z.string() }),
  z.object({ status: z.literal('exported'), count: z.number(), path: z.string() }),
  z.object({ status: z.literal('imported'), imported: z.number(), skipped: z.number() }),
])
export type HistoryFileResult = z.infer<typeof HistoryFileResult>

export const AppSettings = z.object({
  /** Stop recording after ~2 s of silence once speech was heard. */
  silenceAutoStop: z.boolean().default(true),
  /** Check GitHub releases for a newer version on launch. */
  checkForUpdates: z.boolean().default(true),
})
export type AppSettings = z.infer<typeof AppSettings>
export const AppSettingsPatch = AppSettings.partial().strict()

export const IPC = {
  ping: 'app:ping',
  settingsGetLanguage: 'settings:getLanguage',
  settingsSetLanguage: 'settings:setLanguage',
  settingsLanguageChanged: 'settings:languageChanged',
  historySave: 'history:save',
  historyList: 'history:list',
  historyAudio: 'history:audio',
  historyDelete: 'history:delete',
  historyExport: 'history:export',
  historyImport: 'history:import',
  appGetSettings: 'app:getSettings',
  appUpdateSettings: 'app:updateSettings',
  appDeleteAllData: 'app:deleteAllData',
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsRemove: 'models:remove',
  modelsGetDir: 'models:getDir',
  modelsChooseDir: 'models:chooseDir',
  modelsDiskInfo: 'models:diskInfo',
  modelsOpenFolder: 'models:openFolder',
  modelsProgress: 'models:progress',
  youtubeMeta: 'youtube:meta',
  youtubeTranscript: 'youtube:transcript',
  youtubeAudioRange: 'youtube:audioRange',
  ttsSpeak: 'tts:speak',
  inferenceAnalyze: 'inference:analyze',
  inferenceTranscribe: 'inference:transcribe',
  inferencePhonemize: 'inference:phonemize',
  inferenceLanguages: 'inference:languages',
  inferenceCancel: 'inference:cancel',
  inferenceProgress: 'inference:progress',
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
  [IPC.historySave]: { request: HistorySaveRequest, response: HistoryAttempt },
  [IPC.historyList]: {
    request: HistoryListRequest.optional(),
    response: z.object({ attempts: z.array(HistoryAttempt), total: z.number() }),
  },
  [IPC.historyAudio]: {
    request: HistoryIdRequest,
    response: z.custom<Float32Array>((v) => v instanceof Float32Array).nullable(),
  },
  [IPC.historyDelete]: { request: HistoryIdRequest, response: z.boolean() },
  /** Opens a save dialog and writes every attempt (with recordings) as JSON. */
  [IPC.historyExport]: { request: noArgs, response: HistoryFileResult },
  /** Opens a file picker and merges attempts from an export (existing ids are skipped). */
  [IPC.historyImport]: { request: noArgs, response: HistoryFileResult },
  [IPC.appGetSettings]: { request: noArgs, response: AppSettings },
  [IPC.appUpdateSettings]: { request: AppSettingsPatch, response: AppSettings },
  /** Deletes history, recordings and preferences (not downloaded models). */
  [IPC.appDeleteAllData]: { request: noArgs, response: z.null() },
  [IPC.modelsList]: { request: noArgs, response: z.array(ModelStatus) },
  [IPC.modelsDownload]: { request: ModelRef, response: ModelOpResult },
  [IPC.modelsCancel]: { request: ModelRef, response: z.null() },
  [IPC.modelsRemove]: { request: ModelRef, response: ModelOpResult },
  [IPC.modelsGetDir]: { request: noArgs, response: z.string() },
  /** Opens a folder picker and saves the folder if it is writable with enough room. */
  [IPC.modelsChooseDir]: { request: noArgs, response: ModelsDirChoice },
  /** Writability and free space of the current models folder. */
  [IPC.modelsDiskInfo]: { request: noArgs, response: ModelsDiskInfo },
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
  [IPC.ttsSpeak]: { request: SpeakRequest, response: SpeakResponse },
  [IPC.inferenceAnalyze]: {
    request: AnalyzeRequest,
    response: inferenceResult(PronunciationResult),
  },
  [IPC.inferenceTranscribe]: {
    request: TranscribeRequest,
    response: inferenceResult(TranscribeResult),
  },
  [IPC.inferencePhonemize]: {
    request: PhonemizeRequest,
    response: inferenceResult(PhonemizeResult),
  },
  [IPC.inferenceLanguages]: { request: noArgs, response: z.array(LanguageInfo) },
  [IPC.inferenceCancel]: { request: CancelRequest, response: z.null() },
} as const

/** Main -> renderer push channels and their payload schemas. */
export const eventChannels = {
  [IPC.settingsLanguageChanged]: z.string(),
  [IPC.modelsProgress]: ModelProgress,
  [IPC.inferenceProgress]: InferenceProgress,
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
  history: {
    save(req: HistorySaveRequest): Promise<HistoryAttempt>
    list(
      req?: z.infer<typeof HistoryListRequest>,
    ): Promise<{ attempts: HistoryAttempt[]; total: number }>
    /** 16 kHz mono PCM of a stored recording, or null if the attempt has none. */
    audio(req: z.infer<typeof HistoryIdRequest>): Promise<Float32Array | null>
    delete(req: z.infer<typeof HistoryIdRequest>): Promise<boolean>
    export(): Promise<HistoryFileResult>
    import(): Promise<HistoryFileResult>
  }
  app: {
    getSettings(): Promise<AppSettings>
    updateSettings(req: z.infer<typeof AppSettingsPatch>): Promise<AppSettings>
    deleteAllData(): Promise<null>
  }
  models: {
    list(): Promise<ModelStatus[]>
    download(req: z.infer<typeof ModelRef>): Promise<ModelOpResult>
    cancel(req: z.infer<typeof ModelRef>): Promise<null>
    remove(req: z.infer<typeof ModelRef>): Promise<ModelOpResult>
    getDir(): Promise<string>
    chooseDir(): Promise<ModelsDirChoice>
    diskInfo(): Promise<ModelsDiskInfo>
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
  tts: {
    /** Reference-voice audio (16 kHz mono) for a sentence; repeats are served from a disk cache. */
    speak(req: z.infer<typeof SpeakRequest>): Promise<SpeakResponse>
  }
  inference: {
    /** OpenPronounce `/pronunciation`: score a recording against the sentence it should say. */
    analyze(req: z.infer<typeof AnalyzeRequest>): Promise<InferenceResult<PronunciationResult>>
    /** `/speech2text`. */
    transcribe(
      req: z.infer<typeof TranscribeRequest>,
    ): Promise<InferenceResult<z.infer<typeof TranscribeResult>>>
    /** `/phonemes`. */
    phonemize(
      req: z.infer<typeof PhonemizeRequest>,
    ): Promise<InferenceResult<z.infer<typeof PhonemizeResult>>>
    /** `/languages`. */
    languages(): Promise<LanguageInfo[]>
    /** Aborts a running analyze/transcribe; that call resolves with code CANCELLED. */
    cancel(req: z.infer<typeof CancelRequest>): Promise<null>
    onProgress(cb: (e: InferenceProgress) => void): () => void
  }
}
