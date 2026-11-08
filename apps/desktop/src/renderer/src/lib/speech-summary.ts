import {
  SPEECH_SUMMARY_MAX_WORDS,
  SPEECH_SUMMARY_VERSION,
  SpeechSummary,
  type PronunciationResult,
} from '@engclaw/ipc-contract'
import { toSemitones } from '@engclaw/prosody'

/** Seconds per energy frame (hop 512 at 16 kHz, see `extractEnergy`). */
const ENERGY_FRAME_SEC = 512 / 16000
/** Energy is scaled to 0-250; frames under this are silence. */
const SILENCE_ENERGY = 25
const MIN_PAUSE_SEC = 0.3
const DIRECTION_SEMITONES = 1

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

function pace(energy: readonly number[], wordCount: number): SpeechSummary['pace'] {
  let first = energy.findIndex((e) => e >= SILENCE_ENERGY)
  let last = energy.length - 1
  while (last >= 0 && energy[last]! < SILENCE_ENERGY) last--
  if (first < 0) first = 0
  const speakingSec = Math.max(0, (last - first + 1) * ENERGY_FRAME_SEC)
  const pauses: number[] = []
  let run = 0
  for (let i = first; i <= last; i++) {
    if (energy[i]! < SILENCE_ENERGY) run++
    else {
      if (run * ENERGY_FRAME_SEC >= MIN_PAUSE_SEC) pauses.push(run * ENERGY_FRAME_SEC)
      run = 0
    }
  }
  return {
    wpm: speakingSec > 0 ? clamp(Math.round((wordCount * 60) / speakingSec), 0, 400) : 0,
    pauses: Math.min(100, pauses.length),
    longestPauseSec: round(Math.min(60, Math.max(0, ...pauses)), 1),
  }
}

function intonation(f0: readonly number[]): SpeechSummary['intonation'] {
  const st = Array.from(toSemitones(f0)).filter((v) => !Number.isNaN(v))
  if (st.length < 6) return { ending: 'flat', rangeSemitones: 0 }
  const third = Math.max(1, Math.floor(st.length / 3))
  const change = mean(st.slice(-third)) - mean(st.slice(0, third))
  const sorted = [...st].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
  return {
    ending:
      change >= DIRECTION_SEMITONES
        ? 'rising'
        : change <= -DIRECTION_SEMITONES
          ? 'falling'
          : 'flat',
    rangeSemitones: round(clamp(at(0.9) - at(0.1), 0, 48), 1),
  }
}

/**
 * Condenses a local analysis into the schema the agent receives. Only the `SPEECH_SUMMARY_MAX_WORDS`
 * words with the highest error confidence are kept (ties keep sentence order).
 */
export function buildSpeechSummary(result: PronunciationResult): SpeechSummary {
  const { differences, prosody } = result
  const flagged = differences.errors
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.confidence - a.e.confidence || a.i - b.i)
  const words = flagged.slice(0, SPEECH_SUMMARY_MAX_WORDS).map(({ e }) => ({
    word: e.word.slice(0, 40),
    expected: e.expected.slice(0, 40),
    heard: e.phones
      .map((p) => p.heard)
      .join('')
      .slice(0, 40),
    confidence: clamp(e.confidence, 0, 1),
  }))
  const wordCount = result.transcribe.trim().split(/\s+/).filter(Boolean).length
  return SpeechSummary.parse({
    v: SPEECH_SUMMARY_VERSION,
    score: clamp(result.score, 0, 100),
    wer: clamp(differences.word_error_rate, 0, 1),
    per: clamp(differences.phoneme_error_rate, 0, 1),
    flaggedWords: Math.min(1000, differences.errors.length),
    words,
    pace: pace(prosody.energy, wordCount),
    intonation: intonation(prosody.f0),
  })
}
