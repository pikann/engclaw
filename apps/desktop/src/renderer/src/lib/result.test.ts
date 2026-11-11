import { describe, expect, it } from 'vitest'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import {
  countUp,
  firstFlagged,
  heardSounds,
  isWrongPhone,
  scoreTone,
  subScores,
  verdictOf,
  wordChips,
} from './result'

const err = (position: number, word: string) => ({
  position,
  word,
  expected: 'x',
  actual: 'y',
  actual_word: '',
  phone_distance: 1,
  confidence: 0.6,
  phones: [],
})
const result = (errors: ReturnType<typeof err>[]) =>
  ({
    transcribe: 'the quick',
    differences: {
      errors,
      expected_phones: [
        ['ð', 'ə'],
        ['k', 'w'],
        ['b', 'r'],
      ],
      heard_phones: ['ð', 'ə', 'k'],
      heard_phones_confidence: [0.9, 0.2, 0.5],
    },
  }) as unknown as PronunciationResult

describe('result view model', () => {
  it('builds one chip per word and attaches errors by position', () => {
    const chips = wordChips(result([err(1, 'quick')]), 'The quick, brown!')
    expect(chips.map((c) => c.word)).toEqual(['the', 'quick', 'brown'])
    expect(chips.map((c) => !!c.error)).toEqual([false, true, false])
  })

  it("carries each word's expected sounds, including correct words", () => {
    const chips = wordChips(
      {
        ...result([err(1, 'quick')]),
        differences: {
          ...result([]).differences,
          expected_phones: [['ð', 'ə'], ['k', 'w'], ['b']],
        },
      } as never,
      'the quick brown',
    )
    expect(chips.map((c) => c.expected)).toEqual([['ð', 'ə'], ['k', 'w'], ['b']])
  })

  it('auto-selects the first flagged word and counts the verdict', () => {
    const chips = wordChips(result([err(2, 'brown'), err(1, 'quick')]), 'the quick brown')
    expect(firstFlagged(chips)).toBe(1)
    expect(verdictOf(chips)).toEqual({ flagged: 2, total: 3 })
  })

  it('selects nothing when no word is flagged', () => {
    expect(firstFlagged(wordChips(result([]), 'the quick brown'))).toBeNull()
  })

  it('underlines phones from confidence 0.5', () => {
    expect(isWrongPhone(0.49)).toBe(false)
    expect(isWrongPhone(0.5)).toBe(true)
  })

  it('greys heard phones with low confidence', () => {
    expect(heardSounds(result([])).map((s) => s.confident)).toEqual([true, false, true])
  })

  it('counts up with ease-out and clamps', () => {
    expect(countUp(80, 0)).toBe(0)
    expect(countUp(80, 450)).toBeGreaterThan(40)
    expect(countUp(80, 5000)).toBe(80)
    expect(countUp(130, 5000)).toBe(100)
  })

  it('picks a tone by score', () => {
    expect([90, 70, 30].map(scoreTone)).toEqual(['good', 'ok', 'poor'])
  })
})

describe('subScores', () => {
  it('maps error rates and acoustic distance to 0-100 tiles', () => {
    const r = {
      acoustic_distance: 7,
      differences: { phoneme_error_rate: 0.12, word_error_rate: 0.4 },
    } as unknown as PronunciationResult
    expect(subScores(r)).toEqual({ accuracy: 88, fluency: 60, prosody: 100 })
  })

  it('clamps to the 0-100 range', () => {
    const r = {
      acoustic_distance: 30,
      differences: { phoneme_error_rate: 1.5, word_error_rate: 0 },
    } as unknown as PronunciationResult
    expect(subScores(r)).toEqual({ accuracy: 0, fluency: 100, prosody: 0 })
  })
})
