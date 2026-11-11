import { describe, expect, it } from 'vitest'
import {
  INITIAL_STAR_STATE,
  MAX_ASKS,
  MOMENTS_BEFORE_FIRST_ASK,
  recordMoment,
} from './star-prompt'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

describe('recordMoment', () => {
  it('ignores weak results', () => {
    const r = recordMoment(INITIAL_STAR_STATE, 40, NOW)
    expect(r).toEqual({ state: INITIAL_STAR_STATE, show: false })
  })

  it('stays quiet until enough good results, then asks once', () => {
    let state = INITIAL_STAR_STATE
    for (let i = 1; i < MOMENTS_BEFORE_FIRST_ASK; i++) {
      const r = recordMoment(state, 90, NOW)
      expect(r.show).toBe(false)
      state = r.state
    }
    const r = recordMoment(state, 90, NOW)
    expect(r.show).toBe(true)
    expect(r.state).toMatchObject({ shown: 1, lastShownAt: NOW, done: false })
    expect(recordMoment(r.state, 90, NOW + DAY).show).toBe(false)
  })

  it('asks again only after the cool-down, and never more than MAX_ASKS', () => {
    let state = { ...INITIAL_STAR_STATE, moments: 50 }
    let now = NOW
    let asks = 0
    for (let i = 0; i < 10; i++) {
      const r = recordMoment(state, 95, now)
      if (r.show) asks++
      state = r.state
      now += 31 * DAY
    }
    expect(asks).toBe(MAX_ASKS)
    expect(state.done).toBe(true)
  })

  it('does nothing once done', () => {
    const done = { ...INITIAL_STAR_STATE, done: true, moments: 99 }
    expect(recordMoment(done, 100, NOW)).toEqual({ state: done, show: false })
  })
})
