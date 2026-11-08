import { averageCorrectScore, isPassed, totalAttempts, type ChapterRun } from './attempt'

/** Star tiers, see the game spec "Rules". Both conditions of a tier must hold. */
export const STAR_RULES = {
  three: { minAvg: 85, maxAttempts: 7 },
  two: { minAvg: 65, maxAttempts: 12 },
} as const

export type Stars = 1 | 2 | 3

export function starsFor(run: { avgScore: number; attempts: number }): Stars {
  const { three, two } = STAR_RULES
  if (run.avgScore >= three.minAvg && run.attempts <= three.maxAttempts) return 3
  if (run.avgScore >= two.minAvg && run.attempts <= two.maxAttempts) return 2
  return 1
}

/** What one passed run earned. */
export interface RunResult {
  stars: Stars
  /** Average score of the correct attempts. */
  avgScore: number
  /** Highest score among the correct attempts. */
  bestScore: number
  /** Every attempt of the run, correct or not. */
  attempts: number
}

export function runResult(run: ChapterRun): RunResult | null {
  if (!isPassed(run)) return null
  const avgScore = averageCorrectScore(run)
  const attempts = totalAttempts(run)
  return {
    stars: starsFor({ avgScore, attempts }),
    avgScore,
    bestScore: Math.max(...run.attempts.filter((a) => a.correct).map((a) => a.score)),
    attempts,
  }
}

/** Stored per passed chapter. Stars and scores only ever improve. */
export interface ChapterProgress {
  stars: Stars
  /** Best run average. */
  avgScore: number
  /** Best single correct score. */
  bestScore: number
  /** Attempts across all runs. */
  attempts: number
  firstPassedAt: number
  lastPassedAt: number
}

export function recordResult(
  prev: ChapterProgress | null,
  res: RunResult,
  now: number,
): ChapterProgress {
  if (!prev) {
    return {
      stars: res.stars,
      avgScore: res.avgScore,
      bestScore: res.bestScore,
      attempts: res.attempts,
      firstPassedAt: now,
      lastPassedAt: now,
    }
  }
  return {
    stars: Math.max(prev.stars, res.stars) as Stars,
    avgScore: Math.max(prev.avgScore, res.avgScore),
    bestScore: Math.max(prev.bestScore, res.bestScore),
    attempts: prev.attempts + res.attempts,
    firstPassedAt: prev.firstPassedAt,
    lastPassedAt: now,
  }
}

/** Whether a run beats the stored best on stars or average score (a first pass always does). */
export const isNewBest = (
  prev: Pick<ChapterProgress, 'stars' | 'avgScore'> | null,
  res: Pick<RunResult, 'stars' | 'avgScore'>,
): boolean => !prev || res.stars > prev.stars || res.avgScore > prev.avgScore

/** Combines two records of the same chapter (import); commutative and idempotent. */
export function mergeProgress(a: ChapterProgress, b: ChapterProgress): ChapterProgress {
  return {
    stars: Math.max(a.stars, b.stars) as Stars,
    avgScore: Math.max(a.avgScore, b.avgScore),
    bestScore: Math.max(a.bestScore, b.bestScore),
    attempts: Math.max(a.attempts, b.attempts),
    firstPassedAt: Math.min(a.firstPassedAt, b.firstPassedAt),
    lastPassedAt: Math.max(a.lastPassedAt, b.lastPassedAt),
  }
}

/** Chapter 1 is always open; otherwise the previous chapter must be passed. */
export const isUnlocked = (order: number, passed: ReadonlySet<number>): boolean =>
  order <= 1 || passed.has(order - 1) || passed.has(order)
