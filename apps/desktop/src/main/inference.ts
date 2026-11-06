import {
  IPC,
  type InferenceErrorCode,
  type InferenceResult,
  type IntonationResult,
  type ContourData,
  type PhonemizeResult,
} from '@engclaw/ipc-contract'
import type { ModelManager } from '@engclaw/models'
import { DEFAULT_LANGUAGE, LANGUAGES, TARGET_SAMPLE_RATE, getLanguage } from '@engclaw/pronounce'
import { handle } from './ipc'
import type { VideoStore } from './store/videos'
import { transcriptIpa } from './transcript-ipa'
import { kokoroLocation, KOKORO_MODEL_ID } from './tts'
import { RpcFailure, type UtilityClient } from './utility-client'

const MIN_SAMPLES = Math.round(TARGET_SAMPLE_RATE * 0.2)

const fail = (code: InferenceErrorCode, message: string, modelId?: string) =>
  ({ ok: false, code, message, ...(modelId ? { modelId } : {}) }) as const

/** Folder of an installed catalog model, or null. */
async function installed(models: ModelManager, id: string): Promise<string | null> {
  const m = (await models.list()).find((x) => x.id === id)
  return m?.state === 'ready' && m.path ? m.path : null
}

/**
 * The OpenPronounce endpoints (`/pronunciation`, `/speech2text`, `/phonemes`, `/languages`) as
 * contract channels, forwarded to the inference service in the utility process.
 */
export function registerInferenceHandlers(
  client: UtilityClient,
  models: ModelManager,
  videos: VideoStore,
): void {
  const active = new Map<string, number>()

  async function run<T>(
    event: Electron.IpcMainInvokeEvent,
    requestId: string | null,
    method: 'analyze' | 'transcribe' | 'phonemize' | 'intonation',
    params: Record<string, unknown>,
  ): Promise<InferenceResult<T>> {
    try {
      const { id, result } = client.call<T>(method, params, {
        onProgress: (stage) => {
          if (requestId && !event.sender.isDestroyed())
            event.sender.send(IPC.inferenceProgress, { requestId, stage })
        },
      })
      if (requestId) active.set(requestId, id)
      try {
        return { ok: true, value: await result }
      } finally {
        if (requestId) active.delete(requestId)
      }
    } catch (e) {
      if (e instanceof RpcFailure) return fail(e.code, e.message, e.modelId)
      return fail('FAILED', e instanceof Error ? e.message : String(e))
    }
  }

  /** Model folders the language needs, or the first missing model as a MODEL_MISSING result. */
  async function needs(language: string | undefined, withVoice: boolean, withPhone: boolean) {
    const lang = getLanguage(language)
    if (!lang) return { error: fail('UNSUPPORTED_LANGUAGE', `unsupported language: ${language}`) }
    const phone = withPhone ? await installed(models, lang.phoneModelId) : null
    const asr = await installed(models, lang.asrModelId)
    const kokoro = withVoice ? await kokoroLocation(models) : null
    const missing = [
      withPhone && !phone && lang.phoneModelId,
      !asr && lang.asrModelId,
      withVoice && !kokoro && KOKORO_MODEL_ID,
    ].find(Boolean)
    if (missing) return { error: fail('MODEL_MISSING', `model not installed: ${missing}`, missing) }
    return {
      lang,
      params: { models: { phone: phone ?? undefined, asr }, kokoro, language: lang.code },
    }
  }

  handle(IPC.inferenceAnalyze, async ({ requestId, audio, text, language }, event) => {
    if (audio.length < MIN_SAMPLES) return fail('INVALID_INPUT', 'the recording is too short')
    const n = await needs(language, true, true)
    if (n.error) return n.error
    return run(event, requestId, 'analyze', { ...n.params, audio, text })
  })
  handle(IPC.inferenceTranscribe, async ({ requestId, audio, language }, event) => {
    if (audio.length < MIN_SAMPLES) return fail('INVALID_INPUT', 'the recording is too short')
    const n = await needs(language, false, false)
    if (n.error) return n.error
    return run(event, requestId, 'transcribe', { ...n.params, audio })
  })
  handle(IPC.inferenceIntonation, async ({ requestId, audio, reference, cacheKey }, event) => {
    if (audio.length < MIN_SAMPLES) return fail('INVALID_INPUT', 'the recording is too short')
    let ref: { audio: Float32Array } | { contour: ContourData }
    if ('audio' in reference) ref = reference
    else {
      const cached = cacheKey && videos.getContour(cacheKey.videoId, cacheKey.start, cacheKey.end)
      if (!cached) return fail('INVALID_INPUT', 'no cached reference contour')
      ref = { contour: cached }
    }
    const out = await run<{ result: IntonationResult; referenceContour: ContourData }>(
      event,
      requestId,
      'intonation',
      { audio, reference: ref },
    )
    if (!out.ok) return out
    if ('audio' in ref && cacheKey)
      videos.putContour(cacheKey.videoId, cacheKey.start, cacheKey.end, out.value.referenceContour)
    return { ok: true, value: out.value.result }
  })
  handle(
    IPC.contoursHas,
    ({ videoId, start, end }) => videos.getContour(videoId, start, end) !== null,
  )
  handle(IPC.inferencePhonemize, ({ text, language }, event) => {
    if (!getLanguage(language))
      return fail('UNSUPPORTED_LANGUAGE', `unsupported language: ${language}`)
    return run(event, null, 'phonemize', { text, language: language ?? DEFAULT_LANGUAGE })
  })
  handle(IPC.youtubeIpa, ({ videoId, texts, cachedOnly }, event) =>
    transcriptIpa(
      videos,
      (text) =>
        run<PhonemizeResult>(event, null, 'phonemize', { text, language: DEFAULT_LANGUAGE }),
      videoId,
      texts,
      cachedOnly,
    ),
  )
  handle(IPC.inferenceLanguages, () =>
    Object.values(LANGUAGES).map(({ code, name, experimental }) => ({ code, name, experimental })),
  )
  handle(IPC.inferenceCancel, ({ requestId }) => {
    const id = active.get(requestId)
    if (id !== undefined) client.cancel(id)
    return null
  })
}
