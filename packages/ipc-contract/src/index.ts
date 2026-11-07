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
}).refine((r) => r.end > r.start && r.end - r.start <= 120, 'invalid range')
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
export const RecentVideo = z.object({
  videoId: z.string(),
  title: z.string(),
  durationSec: z.number(),
  lastOpenedAt: z.number(),
})
export type RecentVideo = z.infer<typeof RecentVideo>

/** Practice settings remembered per video: playback speed, plays per sentence, auto-continue %. */
export const SentenceSettings = z
  .object({
    speed: z.number().min(0.5).max(1.5),
    repeat: z.number().int().min(1).max(10),
    autoContinuePct: z.number().int().min(0).max(200),
  })
  .strict()
export type SentenceSettings = z.infer<typeof SentenceSettings>
export const SentenceSettingsSave = VideoRef.extend({ settings: SentenceSettings })

/** Where the player view sits, in the main window's content coordinates (CSS pixels). */
export const PlayerBounds = z
  .object({
    x: z.number().int().min(0).max(20000),
    y: z.number().int().min(0).max(20000),
    width: z.number().int().min(0).max(20000),
    height: z.number().int().min(0).max(20000),
  })
  .strict()
export type PlayerBounds = z.infer<typeof PlayerBounds>

export const PlayerCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play') }).strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('seek'), seconds: z.number().min(0).max(86_400) }).strict(),
  z.object({ type: z.literal('rate'), rate: z.number().min(0.25).max(2) }).strict(),
])
export type PlayerCommand = z.infer<typeof PlayerCommand>

export const PlayerState = z.enum(['playing', 'paused', 'ended', 'buffering', 'cued'])
export type PlayerState = z.infer<typeof PlayerState>

/** Pushed by the main process from the sandboxed player view. */
export const PlayerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), duration: z.number() }),
  z.object({ type: z.literal('state'), state: PlayerState }),
  z.object({ type: z.literal('time'), seconds: z.number(), duration: z.number() }),
  z.object({
    type: z.literal('error'),
    /** UNAVAILABLE: private, removed, embed-blocked or any player error. NETWORK: YouTube unreachable. */
    code: z.enum(['UNAVAILABLE', 'NETWORK']),
    detail: z.number().optional(),
  }),
])
export type PlayerEvent = z.infer<typeof PlayerEvent>

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

/** Per-frame pitch (Hz, 0 = unvoiced) and energy of a speech clip. */
export interface ContourData {
  f0: number[]
  energy: number[]
  frameSec: number
}
/** Segment time range of a YouTube video, the key of its cached reference contour. */
export const SegmentRange = VideoRef.extend({ start: z.number().min(0), end: z.number().min(0) })
export const IntonationRequest = z
  .object({
    requestId: RequestId,
    audio: Pcm16k,
    /** Reference speech to extract a contour from, or `cached` to use the one stored under `cacheKey`. */
    reference: z.union([
      z.object({ audio: Pcm16k }).strict(),
      z.object({ cached: z.literal(true) }).strict(),
    ]),
    /** Required for `cached`; when given with reference audio, the extracted contour is stored under it. */
    cacheKey: SegmentRange.optional(),
  })
  .strict()
export const IntonationResult = z.object({
  /** Fluency 0-100. */
  score: z.number(),
  correlation: z.number(),
  rangeRatio: z.number(),
  rhythm: z.number(),
  pause: z.number(),
  chart: z.object({
    frameSec: z.number(),
    reference: z.array(z.number().nullable()),
    user: z.array(z.number().nullable()),
  }),
})
export type IntonationResult = z.infer<typeof IntonationResult>

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

export const IpaWord = z.object({ word: z.string(), ipa: z.string() })
export type IpaWord = z.infer<typeof IpaWord>
/** IPA for the sentences of a video's transcript; results are cached per video. */
export const TranscriptIpaRequest = VideoRef.extend({
  texts: z.array(z.string().min(1).max(1000)).min(1).max(5000),
  /** Only read the cache: resolves to [] unless every sentence is already cached. */
  cachedOnly: z.boolean().optional(),
}).strict()

export const PitchDirection = z.enum(['rising', 'falling', 'flat'])
/** Prosody of one shadowing segment; times are seconds from the segment's start. */
export const SegmentProsody = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      start: z.number(),
      end: z.number(),
      stressed: z.boolean(),
      pitch: z.object({
        direction: PitchDirection,
        /** Semitones from the speaker's median at evenly spaced points; empty when the word is unvoiced. */
        contour: z.array(z.number()),
      }),
    }),
  ),
  pauses: z.array(z.object({ afterWordIndex: z.number().int().min(0), duration: z.number() })),
})
export type SegmentProsody = z.infer<typeof SegmentProsody>
/**
 * Prosody of a video segment from its own audio. Results are cached per video, segment and
 * algorithm version: `audio` is only needed on a cache miss, and `cachedOnly` resolves to null
 * instead of failing when there is nothing cached.
 */
export const SegmentProsodyRequest = VideoRef.extend({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().min(1).max(1000),
  /** 16 kHz mono PCM of exactly the segment. */
  audio: Pcm16k.optional(),
  cachedOnly: z.boolean().optional(),
})
  .strict()
  .refine((r) => r.end > r.start, 'invalid range')

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
  /** Set for shadowing attempts: the YouTube video and the sentence's index in its transcript. */
  videoId: z.string().min(1).max(32).nullish(),
  segmentIndex: z.number().int().nonnegative().nullish(),
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
    videoId: z.string().min(1).max(32).optional(),
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

const RootSummarySchema = z.object({
  id: z.number().int(),
  root: z.string(),
  forms: z.array(z.string()),
  meaning: z.string(),
  origins: z.array(z.string()),
})
export const DictionarySearchRequest = z
  .object({ query: z.string().max(100), limit: z.number().int().min(1).max(50).optional() })
  .strict()
export const DictionaryIdRequest = z.object({ id: z.number().int().min(0) }).strict()
export const DictionaryRootsRequest = z
  .object({ origin: z.string().max(40).optional(), query: z.string().max(100).optional() })
  .strict()
export const DictionarySearchResult = z.object({
  id: z.number().int(),
  word: z.string(),
  match: z.enum(['prefix', 'fuzzy']),
  distance: z.number().optional(),
})
export const DictionaryWord = z.object({
  id: z.number().int(),
  word: z.string(),
  pronunciations: z.array(z.string()),
  senses: z.array(
    z.object({ pos: z.string(), definition: z.string(), example: z.string().nullable() }),
  ),
  morphemes: z.array(
    z.object({
      kind: z.enum(['prefix', 'root', 'suffix']),
      form: z.string(),
      root: RootSummarySchema,
    }),
  ),
  etymology: z
    .object({
      chain: z.array(
        z.object({ lang: z.string(), langCode: z.string().optional(), term: z.string() }),
      ),
      pieRoot: z.string().nullable(),
      firstUse: z.string().nullable(),
      sourceUrl: z.string(),
      etymonlineUrl: z.string(),
    })
    .nullable(),
})
export const DictionaryRoot = RootSummarySchema.extend({
  sourceUrl: z.string(),
  words: z.array(z.object({ id: z.number().int(), word: z.string() })),
  total: z.number().int(),
})
export const DictionaryRootListItem = RootSummarySchema.extend({ wordCount: z.number().int() })
export const DictionaryRootList = z.object({
  roots: z.array(DictionaryRootListItem),
  origins: z.array(z.string()),
})
export type DictionarySearchResult = z.infer<typeof DictionarySearchResult>
export type DictionaryWord = z.infer<typeof DictionaryWord>
export type DictionaryRoot = z.infer<typeof DictionaryRoot>
export type DictionaryRootList = z.infer<typeof DictionaryRootList>

export const AppSettings = z.object({
  /** Stop recording after ~2 s of silence once speech was heard. */
  silenceAutoStop: z.boolean().default(true),
  /** Check GitHub releases for a newer version on launch. */
  checkForUpdates: z.boolean().default(true),
  /** Colour theme: follow the OS, or force light/dark. */
  theme: z.enum(['system', 'light', 'dark']).default('system'),
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
  appOpenMicSettings: 'app:openMicSettings',
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
  youtubeRecent: 'youtube:recent',
  youtubeGetSettings: 'youtube:getSettings',
  youtubeSaveSettings: 'youtube:saveSettings',
  youtubeIpa: 'youtube:ipa',
  youtubeProsody: 'youtube:prosody',
  playerLoad: 'player:load',
  playerBounds: 'player:bounds',
  playerCommand: 'player:command',
  playerClose: 'player:close',
  playerEvent: 'player:event',
  ttsSpeak: 'tts:speak',
  dictionarySearch: 'dictionary:search',
  dictionaryWord: 'dictionary:word',
  dictionaryRoot: 'dictionary:root',
  dictionaryRoots: 'dictionary:roots',
  inferenceAnalyze: 'inference:analyze',
  inferenceTranscribe: 'inference:transcribe',
  inferenceIntonation: 'inference:intonation',
  contoursHas: 'contours:has',
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
  /** Opens the OS microphone privacy settings; false where the OS has no such page. */
  [IPC.appOpenMicSettings]: { request: noArgs, response: z.boolean() },
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
  /** Videos opened before (with a cached transcript), newest first. */
  [IPC.youtubeRecent]: { request: noArgs, response: z.array(RecentVideo) },
  /** Remembered practice settings for a video, or null when none were saved. */
  [IPC.youtubeGetSettings]: { request: VideoRef, response: SentenceSettings.nullable() },
  [IPC.youtubeSaveSettings]: { request: SentenceSettingsSave, response: z.null() },
  [IPC.youtubeIpa]: {
    request: TranscriptIpaRequest,
    response: inferenceResult(z.array(z.array(IpaWord))),
  },
  [IPC.youtubeProsody]: {
    request: SegmentProsodyRequest,
    response: inferenceResult(SegmentProsody.nullable()),
  },
  /** Creates (or replaces) the sandboxed player view for a video, hidden until bounds are set. */
  [IPC.playerLoad]: { request: VideoRef, response: z.null() },
  [IPC.playerBounds]: { request: PlayerBounds, response: z.null() },
  [IPC.playerCommand]: { request: PlayerCommand, response: z.null() },
  /** Destroys the player view. */
  [IPC.playerClose]: { request: noArgs, response: z.null() },
  [IPC.ttsSpeak]: { request: SpeakRequest, response: SpeakResponse },
  /** Autocomplete: prefix matches first, then fuzzy (typo-tolerant) ones. */
  [IPC.dictionarySearch]: {
    request: DictionarySearchRequest,
    response: z.array(DictionarySearchResult),
  },
  [IPC.dictionaryWord]: { request: DictionaryIdRequest, response: DictionaryWord.nullable() },
  [IPC.dictionaryRoot]: { request: DictionaryIdRequest, response: DictionaryRoot.nullable() },
  [IPC.dictionaryRoots]: {
    request: DictionaryRootsRequest.optional(),
    response: DictionaryRootList,
  },
  [IPC.inferenceAnalyze]: {
    request: AnalyzeRequest,
    response: inferenceResult(PronunciationResult),
  },
  [IPC.inferenceTranscribe]: {
    request: TranscribeRequest,
    response: inferenceResult(TranscribeResult),
  },
  [IPC.inferenceIntonation]: {
    request: IntonationRequest,
    response: inferenceResult(IntonationResult),
  },
  /** Whether the reference contour of a video segment is already cached. */
  [IPC.contoursHas]: { request: SegmentRange, response: z.boolean() },
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
  [IPC.playerEvent]: PlayerEvent,
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
    openMicSettings(): Promise<boolean>
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
    recent(): Promise<RecentVideo[]>
    getSettings(req: z.infer<typeof VideoRef>): Promise<SentenceSettings | null>
    saveSettings(req: z.infer<typeof SentenceSettingsSave>): Promise<null>
    ipa(
      req: z.infer<typeof TranscriptIpaRequest>,
    ): Promise<InferenceResult<z.infer<typeof IpaWord>[][]>>
    prosody(
      req: z.infer<typeof SegmentProsodyRequest>,
    ): Promise<InferenceResult<SegmentProsody | null>>
  }
  player: {
    load(req: z.infer<typeof VideoRef>): Promise<null>
    setBounds(req: PlayerBounds): Promise<null>
    command(req: PlayerCommand): Promise<null>
    close(): Promise<null>
    onEvent(cb: (e: PlayerEvent) => void): () => void
  }
  contours: {
    /** True when the reference contour for the segment is cached, so no audio fetch is needed. */
    has(req: z.infer<typeof SegmentRange>): Promise<boolean>
  }
  dictionary: {
    search(req: z.infer<typeof DictionarySearchRequest>): Promise<DictionarySearchResult[]>
    word(req: z.infer<typeof DictionaryIdRequest>): Promise<DictionaryWord | null>
    root(req: z.infer<typeof DictionaryIdRequest>): Promise<DictionaryRoot | null>
    roots(req?: z.infer<typeof DictionaryRootsRequest>): Promise<DictionaryRootList>
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
    /** Fluency: compares the attempt's pitch/energy contour with the reference speech's. */
    intonation(req: z.infer<typeof IntonationRequest>): Promise<InferenceResult<IntonationResult>>
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
