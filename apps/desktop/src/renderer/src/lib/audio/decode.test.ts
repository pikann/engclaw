import { describe, expect, it } from 'vitest'
import { rangeSamples } from './decode'

describe('rangeSamples', () => {
  it('maps the segment onto audio that starts before it', () => {
    expect(rangeSamples(16000 * 10, 2, 4, 7)).toEqual([32000, 80000])
  })
  it('clamps to the decoded length and never inverts', () => {
    expect(rangeSamples(16000, 0, 0.5, 5)).toEqual([8000, 16000])
    expect(rangeSamples(1000, 0, 5, 6)).toEqual([1000, 1000])
  })
})
