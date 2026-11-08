import { describe, expect, it } from 'vitest'
import { SpeechSummary, type PronunciationResult } from '@engclaw/ipc-contract'
import {
  approxTokens,
  formatSpeechContext,
  SPEECH_CONTEXT_TOKEN_BUDGET,
} from '../../../main/agent/speech-context'
import { buildSpeechSummary } from './speech-summary'

const FRAME = 512 / 16000
const frames = (sec: number, v: number) => new Array<number>(Math.round(sec / FRAME)).fill(v)

const err = (word: string, confidence: number, position: number) => ({
  position,
  word,
  expected: 'ˈmɑːkɪt',
  actual: 'x',
  actual_word: '',
  phone_distance: 1,
  confidence,
  phones: [
    { expected: 'm', heard: 'm', confidence: 0 },
    { expected: 'ɑː', heard: 'æ', confidence },
  ],
})

/** A 4.5 s clip: 0.5 s lead silence, speech, a 0.6 s pause, speech, 0.5 s tail; rising pitch. */
function golden(errors: PronunciationResult['differences']['errors']): PronunciationResult {
  const energy = [
    ...frames(0.5, 2),
    ...frames(1.6, 120),
    ...frames(0.6, 3),
    ...frames(1.3, 120),
    ...frames(0.5, 2),
  ]
  const f0 = Array.from({ length: 200 }, (_, i) => 120 + i * 0.4)
  return {
    score: 72.5,
    distance: 10,
    acoustic_distance: 8,
    differences: {
      word_distance: 2,
      phoneme_distance: 3,
      word_error_rate: 0.2,
      phoneme_error_rate: 0.15,
      errors,
      feedback: { code: 'NEEDS_WORK', words: errors.map((e) => e.word) },
      transcribe: 'yesterday i go to the market and buy some fruits',
      expected_vector: [],
      transcribed_vector: [],
      expected_phonemes: [],
      transcribed_phonemes: [],
      words_with_errors: errors.map((e) => e.word),
      expected_phones: [],
      heard_phones: [],
      heard_phones_confidence: [],
    },
    feedback: { code: 'NEEDS_WORK', words: errors.map((e) => e.word) },
    transcribe: 'yesterday i go to the market and buy some fruits',
    language: 'en',
    prosody: { f0, energy },
  }
}

describe('buildSpeechSummary', () => {
  it('matches the schema, keeps the worst words first and measures pace and pauses', () => {
    const errors = ['a', 'b', 'market', 'd', 'e', 'f', 'g'].map((w, i) =>
      err(w, w === 'market' ? 0.9 : 0.2 + i * 0.01, i),
    )
    const s = buildSpeechSummary(golden(errors))
    expect(SpeechSummary.safeParse(s).success).toBe(true)
    expect(s.v).toBe(1)
    expect(s.flaggedWords).toBe(7)
    expect(s.words).toHaveLength(5)
    expect(s.words[0]).toMatchObject({ word: 'market', heard: 'mæ', confidence: 0.9 })
    expect(s.pace.pauses).toBe(1)
    expect(s.pace.longestPauseSec).toBeCloseTo(0.6, 1)
    expect(s.pace.wpm).toBeGreaterThan(160)
    expect(s.pace.wpm).toBeLessThan(180)
    expect(s.intonation.ending).toBe('rising')
  })

  it('stays under the token budget even with long words', () => {
    const errors = Array.from({ length: 12 }, (_, i) => ({
      ...err('extraordinarily'.repeat(3), 0.5 + i * 0.01, i),
      expected: 'e'.repeat(40),
      phones: [{ expected: 'e', heard: 'h'.repeat(60), confidence: 0.9 }],
    }))
    const text = formatSpeechContext(buildSpeechSummary(golden(errors)))
    expect(approxTokens(text)).toBeLessThanOrEqual(SPEECH_CONTEXT_TOKEN_BUDGET)
    expect(text).toContain('[speech analysis v1')
  })

  it('handles a clip with nothing to fix and silence only', () => {
    const r = golden([])
    r.prosody = { f0: [], energy: frames(1, 0) }
    const s = buildSpeechSummary(r)
    expect(s.words).toEqual([])
    expect(s.pace.pauses).toBe(0)
    expect(s.intonation).toEqual({ ending: 'flat', rangeSemitones: 0 })
    expect(formatSpeechContext(s)).toContain('mispronounced (0 flagged): none')
  })
})
