import type { ContourData, IntonationResult } from '@engclaw/ipc-contract'
import { compareIntonation, extractContour, hasPitch, type Contour } from '@engclaw/prosody'
import { InferenceError } from './errors'

const SAMPLE_RATE = 16000
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits
const MIN_SAMPLES = SAMPLE_RATE * 0.2

export interface IntonationOutput {
  result: IntonationResult
  /** The contour the reference side was compared with, so the caller can cache a freshly extracted one. */
  referenceContour: ContourData
}

const toData = (c: Contour): ContourData => ({
  f0: Array.from(c.f0, (v) => round(v, 2)),
  energy: Array.from(c.energy, (v) => round(v, 1)),
  frameSec: c.frameSec,
})

/** Extracts the attempt's (and, unless cached, the reference's) contour and compares them. */
export function analyzeIntonation(
  audio: Float32Array,
  reference: { audio: Float32Array } | { contour: ContourData },
): IntonationOutput {
  if ('audio' in reference && reference.audio.length < MIN_SAMPLES)
    throw new InferenceError('INVALID_INPUT', 'the reference audio is too short')
  const referenceContour =
    'contour' in reference
      ? reference.contour
      : toData(extractContour(reference.audio, SAMPLE_RATE))
  if (!hasPitch(referenceContour))
    throw new InferenceError('INVALID_INPUT', 'no pitch could be found in the reference audio')
  const attempt = extractContour(audio, SAMPLE_RATE)
  if (!hasPitch(attempt))
    throw new InferenceError('INVALID_INPUT', 'no pitch could be found in the recording')
  const r = compareIntonation(referenceContour, attempt)
  return {
    result: {
      score: r.score,
      correlation: round(r.correlation, 3),
      rangeRatio: round(r.rangeRatio, 3),
      rhythm: round(r.rhythm, 3),
      pause: round(r.pause, 3),
      chart: {
        frameSec: r.chart.frameSec,
        reference: r.chart.reference.map((v) => (v === null ? null : round(v, 2))),
        user: r.chart.user.map((v) => (v === null ? null : round(v, 2))),
      },
    },
    referenceContour,
  }
}
