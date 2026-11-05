import type { PronunciationResult } from '@engclaw/ipc-contract'
import { scoreParts } from '@engclaw/pronounce/src/score'

/** Pure view-model helpers for the result card (OpenPronounce result UI parity). */

type WordError = PronunciationResult['differences']['errors'][number]

/** A phone is shown as wrong (underlined) from this confidence up. */
export const WRONG_PHONE_CONFIDENCE = 0.5
/** A heard phone below this recognizer confidence is greyed out in "Your sounds". */
export const HEARD_PHONE_CONFIDENCE = 0.5

export interface WordChip {
  position: number
  word: string
  error: WordError | null
}

/** One chip per reference word (same split as the phonemizer); flagged words carry their error. */
export function wordChips(result: PronunciationResult, text: string): WordChip[] {
  const { errors, expected_phones } = result.differences
  const words = (text.match(/\b[\w']+\b/g) ?? []).map((w) => w.toLowerCase())
  const count = Math.max(expected_phones.length, words.length)
  return Array.from({ length: count }, (_, position) => {
    const error = errors.find((e) => e.position === position) ?? null
    return { position, word: words[position] ?? error?.word ?? '', error }
  })
}

/** Position of the first flagged word, or null when every word is fine. */
export const firstFlagged = (chips: readonly WordChip[]): number | null =>
  chips.find((c) => c.error)?.position ?? null

export interface Verdict {
  flagged: number
  total: number
}

export const verdictOf = (chips: readonly WordChip[]): Verdict => ({
  flagged: chips.filter((c) => c.error).length,
  total: chips.length,
})

export const isWrongPhone = (confidence: number): boolean => confidence >= WRONG_PHONE_CONFIDENCE

export interface HeardSound {
  phone: string
  confident: boolean
}

export function heardSounds(result: PronunciationResult): HeardSound[] {
  const { heard_phones, heard_phones_confidence } = result.differences
  return heard_phones.map((phone, i) => ({
    phone,
    confident: (heard_phones_confidence[i] ?? 1) >= HEARD_PHONE_CONFIDENCE,
  }))
}

/** The ring's value after `elapsedMs` of an ease-out count-up to `score` over `durationMs`. */
export function countUp(score: number, elapsedMs: number, durationMs = 900): number {
  const target = Math.max(0, Math.min(100, score))
  const p = Math.max(0, Math.min(1, elapsedMs / durationMs))
  return target * (1 - Math.pow(1 - p, 3))
}

export type ScoreTone = 'good' | 'ok' | 'poor'
export const scoreTone = (score: number): ScoreTone =>
  score >= 80 ? 'good' : score >= 60 ? 'ok' : 'poor'

/** Sentence shown under "We heard": the recognizer's text, if any. */
export const heardText = (result: PronunciationResult): string => result.transcribe.trim()

export interface SubScores {
  accuracy: number
  fluency: number
  prosody: number
}

/** The tiles beside the ring: the same three components the overall score blends. */
export function subScores(result: PronunciationResult): SubScores {
  const p = scoreParts({
    acousticDistance: result.acoustic_distance,
    phonemeErrorRate: result.differences.phoneme_error_rate,
    wordErrorRate: result.differences.word_error_rate,
  })
  return {
    accuracy: Math.round(p.phoneme),
    fluency: Math.round(p.word),
    prosody: Math.round(p.acoustic),
  }
}
