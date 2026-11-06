import { describe, expect, it } from 'vitest'
import { analyzeIntonation } from './intonation'

/** A voiced tone whose pitch glides between two frequencies. */
function glide(seconds: number, from: number, to: number, sr = 16000): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const f = from + ((to - from) * i) / out.length
    phase += (2 * Math.PI * f) / sr
    out[i] = 0.5 * Math.sin(phase)
  }
  return out
}

describe('analyzeIntonation', () => {
  it('scores a matching glide high and the opposite glide low', () => {
    const ref = glide(1.5, 110, 200)
    const same = analyzeIntonation(glide(1.5, 110, 200), { audio: ref })
    const opposite = analyzeIntonation(glide(1.5, 200, 110), { audio: ref })
    expect(same.result.score).toBeGreaterThan(85)
    expect(opposite.result.score).toBeLessThan(same.result.score - 25)
  })

  it('reuses a cached reference contour and returns the same score', () => {
    const ref = glide(1.5, 110, 200)
    const first = analyzeIntonation(glide(1.5, 120, 190), { audio: ref })
    const cached = analyzeIntonation(glide(1.5, 120, 190), { contour: first.referenceContour })
    expect(cached.result.score).toBeCloseTo(first.result.score, 0)
  })

  it('rejects a reference that is too short', () => {
    expect(() => analyzeIntonation(glide(1, 100, 150), { audio: new Float32Array(100) })).toThrow(
      /too short/,
    )
  })

  it('rejects a recording or reference without any pitch instead of scoring 0', () => {
    const ref = glide(1.5, 110, 200)
    const silence = new Float32Array(24000)
    expect(() => analyzeIntonation(silence, { audio: ref })).toThrow(/recording/)
    expect(() => analyzeIntonation(ref, { audio: silence })).toThrow(/reference/)
  })
})
