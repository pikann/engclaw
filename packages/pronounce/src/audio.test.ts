import { describe, expect, it } from 'vitest'
import { normalizeWaveform } from './audio'

describe('normalizeWaveform', () => {
  it('gives zero mean and unit variance', () => {
    const out = normalizeWaveform(Float32Array.from([1, 2, 3, 4]))
    const mean = out.reduce((s, x) => s + x, 0) / out.length
    const variance = out.reduce((s, x) => s + (x - mean) ** 2, 0) / out.length
    expect(mean).toBeCloseTo(0, 6)
    expect(variance).toBeCloseTo(1, 4)
  })
  it('does not blow up on silence', () => {
    expect(Array.from(normalizeWaveform(new Float32Array(4)))).toEqual([0, 0, 0, 0])
  })
})
