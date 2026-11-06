import { describe, expect, it } from 'vitest'
import { compareIntonation, toSemitones, type Contour } from './intonation'

const FRAME = 0.032

/** Contour from a pitch function (Hz or 0 = unvoiced) and an energy function, `n` frames. */
function make(
  n: number,
  f0: (i: number) => number,
  energy: (i: number) => number = () => 200,
): Contour {
  return {
    f0: Float32Array.from({ length: n }, (_, i) => f0(i)),
    energy: Float32Array.from({ length: n }, (_, i) => energy(i)),
    frameSec: FRAME,
  }
}

const rising =
  (n: number, base = 120, top = 200) =>
  (i: number) =>
    base + ((top - base) * i) / (n - 1)
const hill =
  (n: number, base = 120) =>
  (i: number) =>
    base * 2 ** (Math.sin((Math.PI * i) / (n - 1)) * 0.5)

describe('toSemitones', () => {
  it('is relative to the median of the voiced frames and NaN where unvoiced', () => {
    const st = toSemitones(Float32Array.from([100, 0, 200, 100, 100]))
    expect(st[0]).toBeCloseTo(0)
    expect(st[1]).toBeNaN()
    expect(st[2]).toBeCloseTo(12)
  })
})

describe('compareIntonation', () => {
  it('scores an identical contour close to 100', () => {
    const c = make(100, hill(100))
    const r = compareIntonation(c, c)
    expect(r.score).toBeGreaterThanOrEqual(98)
    expect(r.correlation).toBeCloseTo(1, 2)
  })

  it('ignores the speaker base pitch (octave shift)', () => {
    const a = make(100, hill(100, 100))
    const b = make(100, hill(100, 200))
    expect(compareIntonation(a, b).score).toBeGreaterThanOrEqual(95)
  })

  it('tolerates a uniformly slower delivery of the same melody', () => {
    const ref = make(100, hill(100))
    const slow = make(130, hill(130))
    const r = compareIntonation(ref, slow)
    expect(r.score).toBeGreaterThan(80)
  })

  it('penalises a flat (monotone) attempt against a moving reference', () => {
    const ref = make(100, hill(100))
    const flat = make(100, () => 150)
    const r = compareIntonation(ref, flat)
    expect(r.score).toBeLessThan(60)
    expect(r.rangeRatio).toBeLessThan(0.2)
  })

  it('penalises the opposite contour direction', () => {
    const up = make(100, rising(100))
    const down = make(100, rising(100, 200, 120))
    expect(compareIntonation(up, down).score).toBeLessThan(compareIntonation(up, up).score - 30)
  })

  it('compares pauses: an attempt with an extra long pause scores lower', () => {
    const energy = (gap: boolean) => (i: number) => (gap && i >= 45 && i < 65 ? 2 : 200)
    const ref = make(100, hill(100), energy(false))
    const same = compareIntonation(ref, make(100, hill(100), energy(false)))
    const paused = compareIntonation(ref, make(100, hill(100), energy(true)))
    expect(paused.pause).toBeLessThan(same.pause)
    expect(paused.score).toBeLessThan(same.score)
  })

  it('returns equally long chart series on the reference timeline with null for unvoiced frames', () => {
    const ref = make(50, (i) => (i < 5 ? 0 : 150))
    const user = make(70, (i) => (i < 5 ? 0 : 150))
    const r = compareIntonation(ref, user)
    expect(r.chart.reference).toHaveLength(50)
    expect(r.chart.user).toHaveLength(50)
    expect(r.chart.reference[0]).toBeNull()
    expect(r.chart.frameSec).toBe(FRAME)
  })

  it('scores 0 when the attempt has no voiced frames', () => {
    const r = compareIntonation(
      make(60, hill(60)),
      make(60, () => 0),
    )
    expect(r.score).toBe(0)
  })
})
