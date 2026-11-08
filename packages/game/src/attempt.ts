/** Score an attempt must reach to count as correct. Calibration: see the game spec, "Attempt threshold". */
export const CORRECT_SCORE_THRESHOLD = 50

/** Correct attempts (not necessarily consecutive) that pass a chapter. */
export const REQUIRED_CORRECT = 5

/** The part of a pronunciation analysis the game looks at. */
export interface AttemptAnalysis {
  score: number
  differences: { errors: readonly unknown[] }
}

export interface Attempt {
  score: number
  flaggedWords: number
  correct: boolean
}

export function evaluateAttempt(
  analysis: AttemptAnalysis,
  threshold: number = CORRECT_SCORE_THRESHOLD,
): Attempt {
  const flaggedWords = analysis.differences.errors.length
  return {
    score: analysis.score,
    flaggedWords,
    correct: analysis.score >= threshold && flaggedWords === 0,
  }
}

export interface ChapterRun {
  attempts: readonly Attempt[]
}

export const newRun = (): ChapterRun => ({ attempts: [] })

/** Appends an attempt; once the chapter is passed the run is frozen. */
export function addAttempt(run: ChapterRun, attempt: Attempt): ChapterRun {
  return isPassed(run) ? run : { attempts: [...run.attempts, attempt] }
}

export const correctCount = (run: ChapterRun): number =>
  Math.min(REQUIRED_CORRECT, run.attempts.filter((a) => a.correct).length)

export const isPassed = (run: ChapterRun): boolean =>
  run.attempts.filter((a) => a.correct).length >= REQUIRED_CORRECT

/** Every attempt, correct or not, counts toward the star rule. */
export const totalAttempts = (run: ChapterRun): number => run.attempts.length

export function averageCorrectScore(run: ChapterRun): number {
  const scores = run.attempts.filter((a) => a.correct).map((a) => a.score)
  return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length
}
