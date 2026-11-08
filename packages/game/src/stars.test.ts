import { describe, expect, it } from 'vitest'
import { addAttempt, evaluateAttempt, newRun, type ChapterRun } from './attempt'
import {
  STAR_RULES,
  isUnlocked,
  mergeProgress,
  recordResult,
  runResult,
  starsFor,
  type ChapterProgress,
} from './stars'

const analysis = (score: number, errors = 0) => ({
  score,
  differences: { errors: Array.from({ length: errors }, () => ({})) },
})
const play = (scores: [number, number?][]): ChapterRun =>
  scores.reduce((run, [s, e]) => addAttempt(run, evaluateAttempt(analysis(s, e ?? 0))), newRun())

describe('starsFor', () => {
  it.each([
    // [avgScore, attempts, stars]
    [100, 5, 3],
    [85, 7, 3],
    [85, 8, 2],
    [84.99, 7, 2],
    [90, 12, 2],
    [90, 13, 1],
    [65, 12, 2],
    [65, 13, 1],
    [64.99, 5, 1],
    [50, 5, 1],
    [50, 100, 1],
  ])('avg %f over %i attempts earns %i star(s)', (avgScore, attempts, stars) => {
    expect(starsFor({ avgScore, attempts })).toBe(stars)
  })

  it('exposes the tiers as constants', () => {
    expect(STAR_RULES).toEqual({
      three: { minAvg: 85, maxAttempts: 7 },
      two: { minAvg: 65, maxAttempts: 12 },
    })
  })
})

describe('runResult', () => {
  it('is null until the run is passed', () => {
    expect(runResult(play([[90], [90], [90], [90]]))).toBeNull()
  })
  it('summarises a passed run, counting incorrect attempts', () => {
    const run = play([[90], [30], [80], [100, 1], [70], [90], [60]])
    expect(runResult(run)).toEqual({
      stars: 2,
      avgScore: 78,
      bestScore: 90,
      attempts: 7,
    })
  })
})

const result = (over = {}) => ({
  stars: 2 as const,
  avgScore: 70,
  bestScore: 80,
  attempts: 9,
  ...over,
})

describe('recordResult', () => {
  it('creates progress on the first pass', () => {
    expect(recordResult(null, result(), 1000)).toEqual({
      stars: 2,
      avgScore: 70,
      bestScore: 80,
      attempts: 9,
      firstPassedAt: 1000,
      lastPassedAt: 1000,
    })
  })

  it('a worse replay never lowers stars or scores but still counts attempts', () => {
    const first = recordResult(
      null,
      result({ stars: 3, avgScore: 92, bestScore: 99, attempts: 6 }),
      1000,
    )
    const worse = recordResult(
      first,
      result({ stars: 1, avgScore: 55, bestScore: 60, attempts: 20 }),
      2000,
    )
    expect(worse).toEqual({
      stars: 3,
      avgScore: 92,
      bestScore: 99,
      attempts: 26,
      firstPassedAt: 1000,
      lastPassedAt: 2000,
    })
  })

  it('a better replay raises stars and scores', () => {
    const first = recordResult(null, result(), 1000)
    const better = recordResult(
      first,
      result({ stars: 3, avgScore: 88, bestScore: 95, attempts: 5 }),
      2000,
    )
    expect(better).toMatchObject({ stars: 3, avgScore: 88, bestScore: 95, firstPassedAt: 1000 })
  })
})

describe('mergeProgress', () => {
  const a: ChapterProgress = {
    stars: 2,
    avgScore: 70,
    bestScore: 80,
    attempts: 9,
    firstPassedAt: 1000,
    lastPassedAt: 3000,
  }
  const b: ChapterProgress = {
    stars: 3,
    avgScore: 60,
    bestScore: 99,
    attempts: 4,
    firstPassedAt: 500,
    lastPassedAt: 2000,
  }
  it('keeps the best of both and is commutative and idempotent', () => {
    const m = mergeProgress(a, b)
    expect(m).toEqual({
      stars: 3,
      avgScore: 70,
      bestScore: 99,
      attempts: 9,
      firstPassedAt: 500,
      lastPassedAt: 3000,
    })
    expect(mergeProgress(b, a)).toEqual(m)
    expect(mergeProgress(m, a)).toEqual(m)
  })
})

describe('isUnlocked', () => {
  it('opens chapter 1 always and the next one once the previous is passed', () => {
    const passed = new Set([1, 2])
    expect(isUnlocked(1, new Set())).toBe(true)
    expect(isUnlocked(2, new Set())).toBe(false)
    expect(isUnlocked(3, passed)).toBe(true)
    expect(isUnlocked(4, passed)).toBe(false)
  })
  it('keeps a passed chapter open even if its predecessor is missing', () => {
    expect(isUnlocked(5, new Set([5]))).toBe(true)
  })
})
