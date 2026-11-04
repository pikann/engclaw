import { describe, expect, it } from 'vitest'
import golden from '../test-data/golden.json'
import { ENERGY_MAX, extractEnergy, extractF0, interpolateF0 } from './index'

function corr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]!
    mb += b[i]!
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb)
    saa += (a[i]! - ma) ** 2
    sbb += (b[i]! - mb) ** 2
  }
  return sab / Math.sqrt(saa * sbb)
}

describe('interpolateF0', () => {
  it('fills unvoiced gaps linearly and holds the edges', () => {
    expect(Array.from(interpolateF0([0, 0, 100, 0, 0, 160, 0]))).toEqual([
      100, 100, 100, 120, 140, 160, 160,
    ])
  })
  it('treats NaN as unvoiced and leaves an all-unvoiced contour at 0', () => {
    expect(Array.from(interpolateF0([NaN, 100, NaN, 200]))).toEqual([100, 100, 150, 200])
    expect(Array.from(interpolateF0([0, 0, 0]))).toEqual([0, 0, 0])
    expect(interpolateF0([]).length).toBe(0)
  })
})

describe('extractEnergy', () => {
  it('scales RMS to 0..250 with the minimum at 0 and the maximum at 250', () => {
    const y = new Float32Array(22050)
    for (let i = 0; i < y.length; i++) y[i] = Math.sin(i / 10) * (i / y.length)
    const e = extractEnergy(y)
    expect(Math.min(...e)).toBe(0)
    expect(Math.max(...e)).toBeCloseTo(ENERGY_MAX, 3)
  })
  it('returns zeros for a flat signal', () => {
    expect(extractEnergy(new Float32Array(4096)).every((v) => v === 0)).toBe(true)
  })
})

describe('golden audio vs librosa 0.11', () => {
  const pcm = Buffer.from(golden.pcm16, 'base64')
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2)
  const y = Float32Array.from(int16, (v) => v / 32767)
  const sampleRate = golden.sampleRate
  const refF0 = golden.f0.map((v) => v ?? 0)

  it('F0 contour correlates >= 0.95 (raw and interpolated)', () => {
    const f0 = extractF0(y, { sampleRate })
    expect(f0.length).toBe(refF0.length)
    expect(corr(f0, refF0)).toBeGreaterThanOrEqual(0.95)
    expect(corr(interpolateF0(f0), golden.f0Interp)).toBeGreaterThanOrEqual(0.95)
  })
  it('energy contour correlates >= 0.95', () => {
    const e = extractEnergy(y)
    expect(e.length).toBe(golden.energy.length)
    expect(corr(e, golden.energy)).toBeGreaterThanOrEqual(0.95)
  })
})
