import { describe, expect, it } from 'vitest'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { detailSeries, domainOf, linePath } from './charts'

describe('domainOf', () => {
  it('spans all series', () => {
    expect(domainOf([1, 5], [-2, 3])).toEqual([-2, 5])
  })
  it('widens a flat series so it can be drawn', () => {
    const [lo, hi] = domainOf([4, 4])
    expect(hi).toBeGreaterThan(lo)
  })
  it('handles no data', () => {
    expect(domainOf([])).toEqual([0, 1])
  })
})

describe('linePath', () => {
  it('maps the first/last values to the chart corners (y flipped)', () => {
    expect(linePath([0, 10], 100, 50, [0, 10])).toBe('M0,50 L100,0')
  })
  it('is empty without data', () => {
    expect(linePath([], 100, 50, [0, 1])).toBe('')
  })
  it('draws a single point as a dot-length segment', () => {
    expect(linePath([3], 100, 50, [0, 10])).toMatch(/^M0,/)
  })
})

describe('detailSeries', () => {
  const result = {
    differences: { expected_vector: [1, 2], transcribed_vector: [1, 3] },
    prosody: { f0: [100, 120, 110], energy: [10, 50] },
  } as unknown as PronunciationResult
  it('pulls the three charts out of the result', () => {
    const s = detailSeries(result)
    expect(s.phoneme).toEqual({ reference: [1, 2], you: [1, 3] })
    expect(s.f0).toEqual([100, 120, 110])
    expect(s.energy).toEqual([10, 50])
  })
})
