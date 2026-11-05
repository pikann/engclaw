/** Acoustic distance and final score (port of OpenPronounce `speech.py`, constants recalibrated for Kokoro). */

import { fastDtw, type DtwResult } from './dtw'

/** Distance at or below which the acoustic component is 100 (upstream gTTS: 6; Kokoro `af_heart`: 7). */
export const ACOUSTIC_GOOD = 7
/** Width of the distance range over which the acoustic component falls from 100 to 0. */
export const ACOUSTIC_SPAN = 9
export const ACOUSTIC_WEIGHT = 0.3
export const PHONEME_WEIGHT = 0.4
export const WORD_WEIGHT = 0.3

const clip = (x: number) => Math.min(100, Math.max(0, x))

/**
 * FastDTW (euclidean, radius 1) between two embedding sequences (`dim`-wide frames), normalised by
 * path length. The path is returned so callers can build DTW-aligned chart vectors.
 */
export function acousticDistance(
  user: Float32Array,
  reference: Float32Array,
  dim: number,
  radius = 1,
): { distance: number; path: DtwResult['path'] } {
  const { distance, path } = fastDtw(user, reference, dim, radius)
  return { distance: distance / path.length, path }
}

export interface ScoreInputs {
  acousticDistance: number
  phonemeErrorRate: number
  wordErrorRate: number
}

export interface ScoreParts {
  /** How close the voice is to the reference (the spoken-rhythm and sound component), 0–100. */
  acoustic: number
  /** Share of sounds produced as expected, 0–100. */
  phoneme: number
  /** Share of words recognised as expected, 0–100. */
  word: number
}

/** The three 0–100 components that `computePronunciationScore` blends. */
export function scoreParts(inputs: ScoreInputs): ScoreParts {
  return {
    acoustic: clip(100 * (1 - (inputs.acousticDistance - ACOUSTIC_GOOD) / ACOUSTIC_SPAN)),
    phoneme: clip(100 * (1 - inputs.phonemeErrorRate)),
    word: clip(100 * (1 - inputs.wordErrorRate)),
  }
}

/** Weighted blend of acoustic, phoneme and word scores (0–100, 2 dp). */
export function computePronunciationScore(inputs: ScoreInputs): number {
  const { acoustic, phoneme, word } = scoreParts(inputs)
  const score = ACOUSTIC_WEIGHT * acoustic + PHONEME_WEIGHT * phoneme + WORD_WEIGHT * word
  return Math.round(score * 100) / 100
}
