import { describe, expect, it } from 'vitest'
import { contrastRatio, parseOklch } from './color'

describe('contrastRatio', () => {
  const white = parseOklch('oklch(1 0 0)')
  const black = parseOklch('oklch(0 0 0)')
  it('is 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })
  it('matches a known mid grey (#767676 on white is ~4.54:1)', () => {
    expect(contrastRatio(parseOklch('oklch(0.5681 0 0)'), white)).toBeCloseTo(4.54, 1)
  })
  it('rejects non-oklch input and parses alpha', () => {
    expect(() => parseOklch('#fff')).toThrow()
    expect(parseOklch('oklch(50% 0.1 20 / 0.4)')).toEqual({ l: 0.5, c: 0.1, h: 20, alpha: 0.4 })
  })
})
