import type { IntonationResult } from '@engclaw/ipc-contract'
import { wordErrorRate } from '@engclaw/pronounce'
import type { Segment } from './shadowing'

export type IntonationState =
  | { status: 'loading' }
  | {
      status: 'done'
      result: IntonationResult
      /** Reference came from the TTS voice, not the video. */ fallback: boolean
    }
  | { status: 'failed' }

/** The slice of `window.engclaw` the intonation check needs. */
export interface IntonationApi {
  contours: { has(r: { videoId: string; start: number; end: number }): Promise<boolean> }
  youtube: {
    audioRange(r: {
      videoId: string
      start: number
      end: number
    }): Promise<{ ok: true; value: { bytes: Uint8Array; offsetSec: number } } | { ok: false }>
  }
  tts: { speak(r: { text: string }): Promise<{ ok: true; samples: Float32Array } | { ok: false }> }
  inference: {
    intonation(r: {
      requestId: string
      audio: Float32Array
      reference: { audio: Float32Array } | { cached: true }
      cacheKey?: { videoId: string; start: number; end: number }
    }): Promise<{ ok: true; value: IntonationResult } | { ok: false }>
  }
}

export interface IntonationDeps {
  api: IntonationApi
  decode(bytes: Uint8Array, offsetSec: number, start: number, end: number): Promise<Float32Array>
}

/**
 * Fluency check of one attempt: the reference is the video segment's own speech (cached after the
 * first time); when its audio cannot be fetched or decoded, the TTS voice stands in and the result
 * is flagged `fallback` so the UI can say so.
 */
export async function checkIntonation(
  { api, decode }: IntonationDeps,
  requestId: string,
  videoId: string,
  segment: Pick<Segment, 'start' | 'end' | 'text'>,
  audio: Float32Array,
): Promise<IntonationState> {
  const cacheKey = { videoId, start: segment.start, end: segment.end }
  const run = async (
    reference: { audio: Float32Array } | { cached: true },
    key?: typeof cacheKey,
  ) => {
    const res = await api.inference.intonation({
      requestId,
      audio,
      reference,
      ...(key ? { cacheKey: key } : {}),
    })
    return res.ok ? res.value : null
  }
  try {
    if (await api.contours.has(cacheKey)) {
      const result = await run({ cached: true }, cacheKey)
      if (result) return { status: 'done', result, fallback: false }
    }
    try {
      const range = await api.youtube.audioRange(cacheKey)
      if (range.ok) {
        const ref = await decode(
          range.value.bytes,
          range.value.offsetSec,
          segment.start,
          segment.end,
        )
        const result = await run({ audio: ref }, cacheKey)
        if (result) return { status: 'done', result, fallback: false }
      }
    } catch {
      // fall through to the TTS reference
    }
    const tts = await api.tts.speak({ text: segment.text.trim() })
    if (!tts.ok) return { status: 'failed' }
    const result = await run({ audio: tts.samples })
    return result ? { status: 'done', result, fallback: true } : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  }
}

export interface LightResult {
  /** Detected text vs the sentence, 0-100 (100 = every word right). */
  accuracy: number
  transcript: string
}

export const lightResult = (transcript: string, text: string): LightResult => ({
  accuracy: Math.round((1 - wordErrorRate(transcript, text)) * 100),
  transcript,
})

/** Light-mode headline: Accuracy and Fluency averaged, or Accuracy alone when Fluency is unavailable. */
export const lightScore = (accuracy: number, fluency: number | null): number =>
  fluency === null ? accuracy : Math.round((accuracy + fluency) / 2)
