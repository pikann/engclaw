import { describe, expect, it } from 'vitest'
import { MATURE_DAYS, newCard, review, studyDay, type CardState } from './sm2'

const day = 100
const reviewed = (c: CardState, ...grades: Parameters<typeof review>[1][]): CardState =>
  grades.reduce((s, g) => review(s, g, day), c)

describe('sm2 review', () => {
  it('first Good review schedules for tomorrow, then 6 days, then grows by ease', () => {
    const first = review(newCard(day), 'good', day)
    expect(first).toMatchObject({ repetitions: 1, interval: 1, due: day + 1 })
    const second = review(first, 'good', day + 1)
    expect(second).toMatchObject({ repetitions: 2, interval: 6, due: day + 7 })
    const third = review(second, 'good', day + 7)
    expect(third.interval).toBe(Math.round(6 * second.ease))
    expect(third.due).toBe(day + 7 + third.interval)
  })

  it('Easy raises ease, Hard lowers it, Good leaves it unchanged', () => {
    const base = newCard(day)
    expect(review(base, 'easy', day).ease).toBeCloseTo(2.6)
    expect(review(base, 'good', day).ease).toBeCloseTo(2.5)
    expect(review(base, 'hard', day).ease).toBeCloseTo(2.36)
  })

  it('Again resets repetitions, schedules for 1 day, counts a lapse and keeps ease', () => {
    const grown = reviewed(newCard(day), 'good', 'good', 'good')
    const lapsed = review(grown, 'again', day + 30)
    expect(lapsed).toMatchObject({
      repetitions: 0,
      interval: 1,
      due: day + 31,
      lapses: 1,
      ease: grown.ease,
    })
  })

  it('failing a brand-new card is not a lapse', () => {
    expect(review(newCard(day), 'again', day).lapses).toBe(0)
  })

  it('ease never drops below 1.3', () => {
    const hard = reviewed(newCard(day), ...Array<'hard'>(30).fill('hard'))
    expect(hard.ease).toBe(1.3)
  })

  it('intervals grow by at least one day even with a low ease', () => {
    let s = reviewed(newCard(day), 'good', 'good')
    s = { ...s, ease: 1.3, interval: 1 }
    expect(review(s, 'good', day).interval).toBeGreaterThanOrEqual(2)
  })

  it('a card becomes mature at the configured interval', () => {
    expect(MATURE_DAYS).toBe(21)
  })
})

describe('studyDay', () => {
  const at = (iso: string): number => new Date(iso).getTime()
  const utc = 0
  it('rolls over at 04:00 local time, not midnight', () => {
    expect(studyDay(at('2026-03-10T03:59:00Z'), utc)).toBe(
      studyDay(at('2026-03-09T12:00:00Z'), utc),
    )
    expect(studyDay(at('2026-03-10T04:00:00Z'), utc)).toBe(
      studyDay(at('2026-03-09T12:00:00Z'), utc) + 1,
    )
  })

  it('uses the local offset (minutes behind UTC, like getTimezoneOffset)', () => {
    // 02:00 UTC is 21:00 the previous evening at UTC-5, so it is still the previous study day
    expect(studyDay(at('2026-03-10T02:00:00Z'), 300)).toBe(
      studyDay(at('2026-03-09T20:00:00Z'), 300),
    )
    // 09:00 UTC is 04:00 at UTC-5: the new study day has started
    expect(studyDay(at('2026-03-10T09:00:00Z'), 300)).toBe(
      studyDay(at('2026-03-09T20:00:00Z'), 300) + 1,
    )
  })
})
