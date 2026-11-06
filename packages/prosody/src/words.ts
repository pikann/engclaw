import { extractF0, interpolateF0 } from './contour'
import { rms } from './energy'
import { toSemitones } from './intonation'

/**
 * Per-word prosody of one speech segment from word timings that were aligned elsewhere
 * (forced CTC alignment of the caption text). All times are seconds from the start of the audio.
 *
 * Heuristic thresholds (tune against real videos, not derived from a model):
 * - Pause: a gap of at least MIN_PAUSE_SEC between two aligned words that the audio confirms with a
 *   silent run (frame RMS under SILENCE_RATIO of the loud level) of at least that length. The
 *   reported duration is the silent run, not the alignment gap, which also holds the words' tails.
 * - Stress: needs at least MIN_WORDS_FOR_STRESS words. Score per word = 0.4 z(peak loudness in dB)
 *   + 0.3 z(duration per syllable) + 0.3 z(pitch peak in semitones from the median), z-scored within
 *   the segment; a word is stressed when its score is at least STRESS_Z, at most MAX_STRESSED_SHARE
 *   of the words (highest scores first).
 * - Pitch direction: change of the contour from the mean of its first two to the mean of its last two points, at least
 *   DIRECTION_SEMITONES up or down; anything smaller is "flat".
 */
export const MIN_PAUSE_SEC = 0.2
export const SILENCE_RATIO = 0.1
export const MIN_WORDS_FOR_STRESS = 3
export const STRESS_Z = 0.5
export const MAX_STRESSED_SHARE = 0.35
export const DIRECTION_SEMITONES = 1
export const CONTOUR_POINTS = 5

const F0_MIN = 75
const F0_MAX = 500
/** 16 ms pitch frames: at 32 ms most short words had under two voiced frames and got no contour. */
const F0_HOP = 256
/** 25 ms frames every 10 ms for loudness and silence. */
const FRAME = 400
const HOP = 160
const STRESS_WEIGHTS = { loudness: 0.4, duration: 0.3, pitch: 0.3 }

export interface TimedWord {
  text: string
  start: number
  end: number
}

export type PitchDirection = 'rising' | 'falling' | 'flat'

export interface WordProsody extends TimedWord {
  stressed: boolean
  pitch: {
    direction: PitchDirection
    /** Semitones from the speaker's median at CONTOUR_POINTS evenly spaced points; empty when the word is unvoiced. */
    contour: number[]
  }
}

export interface Pause {
  /** The pause follows `words[afterWordIndex]`. */
  afterWordIndex: number
  duration: number
}

export interface SegmentProsody {
  words: WordProsody[]
  pauses: Pause[]
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits

function zScores(values: readonly number[]): number[] {
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  return values.map((v) => (sd > 1e-9 ? (v - mean) / sd : 0))
}

function syllables(text: string): number {
  return Math.max(1, (text.toLowerCase().match(/[aeiouy]+/g) ?? []).length)
}

/** Linear interpolation of `series` at fractional index `pos`. */
function at(series: ArrayLike<number>, pos: number): number {
  const i = Math.min(series.length - 1, Math.max(0, Math.floor(pos)))
  const j = Math.min(series.length - 1, i + 1)
  return series[i]! + (series[j]! - series[i]!) * Math.min(1, Math.max(0, pos - i))
}

function pitchOf(
  word: TimedWord,
  frameSec: number,
  st: Float32Array,
  filled: Float32Array,
): WordProsody['pitch'] {
  const from = Math.max(0, Math.ceil(word.start / frameSec))
  const to = Math.min(st.length - 1, Math.floor(word.end / frameSec))
  const voiced: number[] = []
  for (let f = from; f <= to; f++) if (!Number.isNaN(st[f]!)) voiced.push(st[f]!)
  if (voiced.length < 2) return { direction: 'flat', contour: [] }

  const contour = Array.from({ length: CONTOUR_POINTS }, (_, k) => {
    const t = word.start + ((word.end - word.start) * k) / (CONTOUR_POINTS - 1)
    return round(at(filled, t / frameSec), 1)
  })
  const change =
    (contour[CONTOUR_POINTS - 1]! + contour[CONTOUR_POINTS - 2]!) / 2 -
    (contour[0]! + contour[1]!) / 2
  const direction: PitchDirection =
    change >= DIRECTION_SEMITONES ? 'rising' : change <= -DIRECTION_SEMITONES ? 'falling' : 'flat'
  return { direction, contour }
}

/** Longest silent run (seconds) of the frames fully inside `[from, to]`. */
function longestSilence(
  silent: readonly boolean[],
  hopSec: number,
  from: number,
  to: number,
): number {
  let best = 0
  let run = 0
  const first = Math.max(0, Math.ceil(from / hopSec))
  const last = Math.min(silent.length - 1, Math.floor(to / hopSec))
  for (let f = first; f <= last; f++) {
    run = silent[f] ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

export function analyzeSegmentProsody(
  audio: Float32Array,
  sampleRate: number,
  words: readonly TimedWord[],
): SegmentProsody {
  if (!words.length) return { words: [], pauses: [] }
  const hopSec = HOP / sampleRate

  // Loudness and silence on a fine grid.
  const frameRms = rms(audio, FRAME, HOP)
  const sorted = Array.from(frameRms).sort((a, b) => a - b)
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  const silent = Array.from(frameRms, (v) => v < loud * SILENCE_RATIO)

  // Pitch in semitones from this speaker's median, unvoiced frames held by interpolation.
  const f0 = extractF0(audio, { sampleRate, fmin: F0_MIN, fmax: F0_MAX, hopLength: F0_HOP })
  const frameSec = F0_HOP / sampleRate
  const st = toSemitones(f0)
  const filled = new Float32Array(st.length)
  const interpolated = interpolateF0(f0)
  const median = medianVoiced(f0)
  for (let i = 0; i < st.length; i++)
    filled[i] = interpolated[i]! > 0 ? 12 * Math.log2(interpolated[i]! / median) : 0

  const peakDb = words.map((w) => {
    const from = Math.max(0, Math.floor(w.start / hopSec))
    const to = Math.min(frameRms.length - 1, Math.max(from, Math.ceil(w.end / hopSec)))
    let peak = 0
    for (let f = from; f <= to; f++) peak = Math.max(peak, frameRms[f]!)
    return 20 * Math.log10(Math.max(peak, 1e-5))
  })
  const perSyllable = words.map((w) => Math.max(0, w.end - w.start) / syllables(w.text))
  const pitchPeak = words.map((w) => {
    const from = Math.max(0, Math.ceil(w.start / frameSec))
    const to = Math.min(st.length - 1, Math.floor(w.end / frameSec))
    let peak = -Infinity
    for (let f = from; f <= to; f++) if (!Number.isNaN(st[f]!)) peak = Math.max(peak, st[f]!)
    return peak
  })
  const stressed = new Set<number>()
  if (words.length >= MIN_WORDS_FOR_STRESS) {
    const voicedPeaks = pitchPeak.filter(Number.isFinite)
    const fallback = voicedPeaks.length
      ? voicedPeaks.reduce((s, v) => s + v, 0) / voicedPeaks.length
      : 0
    const zl = zScores(peakDb)
    const zd = zScores(perSyllable)
    const zp = zScores(pitchPeak.map((p) => (Number.isFinite(p) ? p : fallback)))
    const scores = words.map(
      (_, i) =>
        STRESS_WEIGHTS.loudness * zl[i]! +
        STRESS_WEIGHTS.duration * zd[i]! +
        STRESS_WEIGHTS.pitch * zp[i]!,
    )
    // The terms are correlated, so the weighted sum is re-normalised to a z-like scale.
    const cap = Math.max(1, Math.floor(words.length * MAX_STRESSED_SHARE))
    zScores(scores)
      .map((z, i) => [z, i] as const)
      .filter(([z]) => z >= STRESS_Z)
      .sort((a, b) => b[0] - a[0])
      .slice(0, cap)
      .forEach(([, i]) => stressed.add(i))
  }

  const outWords: WordProsody[] = words.map((w, i) => ({
    text: w.text,
    start: round(w.start, 3),
    end: round(w.end, 3),
    stressed: stressed.has(i),
    pitch: pitchOf(w, frameSec, st, filled),
  }))

  const pauses: Pause[] = []
  for (let i = 0; i + 1 < words.length; i++) {
    const from = words[i]!.end
    const to = words[i + 1]!.start
    if (to - from < MIN_PAUSE_SEC) continue
    const duration = longestSilence(silent, hopSec, from, to) * hopSec
    if (duration >= MIN_PAUSE_SEC) pauses.push({ afterWordIndex: i, duration: round(duration, 2) })
  }
  return { words: outWords, pauses }
}

function medianVoiced(f0: ArrayLike<number>): number {
  const voiced = Array.from(f0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  return voiced.length ? voiced[voiced.length >> 1]! : 1
}
