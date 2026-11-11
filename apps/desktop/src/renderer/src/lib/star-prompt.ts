import type { StarPromptState } from '@engclaw/ipc-contract'

export const REPO_URL = 'https://github.com/pikann/engclaw'
/** Fired on `window` (detail: score 0-100) after a practice attempt is saved. */
export const STAR_MOMENT_EVENT = 'engclaw:star-moment'
/** A result at or above this score counts as a good moment to ask. */
export const GOOD_SCORE = 70
/** Good results needed before the first ask. */
export const MOMENTS_BEFORE_FIRST_ASK = 10
/** Never ask more than this many times in total. */
export const MAX_ASKS = 3
export const MIN_DAYS_BETWEEN_ASKS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export const INITIAL_STAR_STATE: StarPromptState = {
  done: false,
  moments: 0,
  shown: 0,
  lastShownAt: 0,
}

/** Reports a saved attempt; a good score may make the star reminder appear. */
export function notifyStarMoment(score: number): void {
  window.dispatchEvent(new CustomEvent<number>(STAR_MOMENT_EVENT, { detail: score }))
}

/**
 * Pure decision: record one finished attempt and say whether to show the reminder now.
 * Only good results count, so the ask lands after a win, never after a failure.
 */
export function recordMoment(
  state: StarPromptState,
  score: number,
  now: number,
): { state: StarPromptState; show: boolean } {
  if (state.done || score < GOOD_SCORE) return { state, show: false }
  const moments = state.moments + 1
  const due =
    moments >= MOMENTS_BEFORE_FIRST_ASK &&
    state.shown < MAX_ASKS &&
    now - state.lastShownAt >= MIN_DAYS_BETWEEN_ASKS * DAY_MS
  if (!due) return { state: { ...state, moments }, show: false }
  const shown = state.shown + 1
  return {
    state: { ...state, moments, shown, lastShownAt: now, done: shown >= MAX_ASKS },
    show: true,
  }
}
