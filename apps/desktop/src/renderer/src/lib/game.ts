/** Pure state mapping for the pronunciation-game components (kept free of React for testing). */

export const MAX_STARS = 3
export const ATTEMPT_SLOTS = 5

export type NodeState = 'locked' | 'current' | 'passed'
export type AttemptSlot = 'empty' | 'correct' | 'filled-pulse'
export type StarState = 'filled' | 'empty'

/** Clamps to a whole number of stars in 0..3 (NaN counts as 0). */
export function clampStars(stars: number): number {
  if (!Number.isFinite(stars)) return 0
  return Math.min(MAX_STARS, Math.max(0, Math.round(stars)))
}

export const starStates = (stars: number): StarState[] =>
  Array.from({ length: MAX_STARS }, (_, i) => (i < clampStars(stars) ? 'filled' : 'empty'))

/**
 * The five attempt slots: `correct` slots already earned, then (while the chapter is still
 * running) the next slot pulses as the one being filled; the rest are empty.
 */
export function attemptSlots(correct: number, active: boolean): AttemptSlot[] {
  const done = Math.min(ATTEMPT_SLOTS, Math.max(0, Math.floor(correct) || 0))
  return Array.from({ length: ATTEMPT_SLOTS }, (_, i) =>
    i < done ? 'correct' : i === done && active ? 'filled-pulse' : 'empty',
  )
}

/** Chapter nodes up to the first unpassed one are reachable; later ones are locked. */
export function nodeStates(stars: readonly (number | null)[]): NodeState[] {
  let currentSeen = false
  return stars.map((s) => {
    if (s !== null && s > 0) return 'passed'
    if (!currentSeen) {
      currentSeen = true
      return 'current'
    }
    return 'locked'
  })
}

/** Total stars earned over total available, for the progress summary. */
export function progressOf(stars: readonly (number | null)[]): { earned: number; total: number } {
  return {
    earned: stars.reduce<number>((n, s) => n + clampStars(s ?? 0), 0),
    total: stars.length * MAX_STARS,
  }
}
