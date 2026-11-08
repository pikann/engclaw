import { describe, expect, it } from 'vitest'
import {
  CORRECT_SCORE_THRESHOLD,
  REQUIRED_CORRECT,
  addAttempt,
  correctCount,
  evaluateAttempt,
  isPassed,
  newRun,
  totalAttempts,
  type ChapterRun,
} from './attempt'

const analysis = (score: number, errors = 0) => ({
  score,
  differences: { errors: Array.from({ length: errors }, () => ({})) },
})

const play = (scores: [number, number?][]): ChapterRun =>
  scores.reduce((run, [s, e]) => addAttempt(run, evaluateAttempt(analysis(s, e ?? 0))), newRun())

describe('evaluateAttempt', () => {
  it('is correct at the threshold with no flagged word', () => {
    expect(evaluateAttempt(analysis(CORRECT_SCORE_THRESHOLD)).correct).toBe(true)
  })
  it('is incorrect just below the threshold', () => {
    expect(evaluateAttempt(analysis(CORRECT_SCORE_THRESHOLD - 0.1)).correct).toBe(false)
  })
  it('is incorrect when a word is flagged, however high the score', () => {
    expect(evaluateAttempt(analysis(99, 1)).correct).toBe(false)
  })
  it('accepts a custom threshold', () => {
    expect(evaluateAttempt(analysis(60), 60).correct).toBe(true)
  })
})

describe('chapter run', () => {
  it('passes on the 5th correct attempt, not before', () => {
    expect(isPassed(play([[90], [90], [90], [90]]))).toBe(false)
    expect(isPassed(play([[90], [90], [90], [90], [90]]))).toBe(true)
  })
  it('does not advance on incorrect attempts but counts them', () => {
    const run = play([[90], [49], [85, 1], [90]])
    expect(correctCount(run)).toBe(2)
    expect(totalAttempts(run)).toBe(4)
  })
  it('does not need the correct attempts to be consecutive', () => {
    expect(isPassed(play([[90], [10], [90], [10], [90], [10], [90], [10], [90]]))).toBe(true)
  })
  it('ignores attempts after the chapter is passed', () => {
    const passed = play(Array.from({ length: REQUIRED_CORRECT }, () => [95] as [number]))
    expect(addAttempt(passed, evaluateAttempt(analysis(10)))).toBe(passed)
  })
})
