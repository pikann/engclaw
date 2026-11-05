import { describe, expect, it } from 'vitest'
import { attemptSlots, clampStars, nodeStates, progressOf, starStates } from './game'

describe('stars', () => {
  it('clamps to 0..3 and treats junk as 0', () => {
    expect([clampStars(-1), clampStars(2), clampStars(7), clampStars(NaN)]).toEqual([0, 2, 3, 0])
  })
  it('maps a count to filled/empty slots', () => {
    expect(starStates(2)).toEqual(['filled', 'filled', 'empty'])
    expect(starStates(0)).toEqual(['empty', 'empty', 'empty'])
  })
})

describe('attemptSlots', () => {
  it('fills earned slots and pulses the next one while active', () => {
    expect(attemptSlots(2, true)).toEqual(['correct', 'correct', 'filled-pulse', 'empty', 'empty'])
  })
  it('does not pulse once the chapter has ended', () => {
    expect(attemptSlots(2, false)).toEqual(['correct', 'correct', 'empty', 'empty', 'empty'])
  })
  it('caps at five and never pulses past the last slot', () => {
    expect(attemptSlots(9, true)).toEqual(Array(5).fill('correct'))
  })
})

describe('nodeStates', () => {
  it('passed, then one current, then locked', () => {
    expect(nodeStates([3, 1, null, null])).toEqual(['passed', 'passed', 'current', 'locked'])
  })
  it('first node is current when nothing is passed', () => {
    expect(nodeStates([null, null])).toEqual(['current', 'locked'])
  })
  it('a played-but-failed (0 star) node stays the current one', () => {
    expect(nodeStates([2, 0, null])).toEqual(['passed', 'current', 'locked'])
  })
})

describe('progressOf', () => {
  it('sums earned stars over 3 per chapter', () => {
    expect(progressOf([3, 1, null])).toEqual({ earned: 4, total: 9 })
  })
})
