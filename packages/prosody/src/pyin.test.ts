import { expect, it } from 'vitest'
import { pyin, rms } from './index'

const sr = 22050

function tone(f: number, seconds: number, amp = 0.5): Float32Array {
  const y = new Float32Array(Math.round(sr * seconds))
  for (let i = 0; i < y.length; i++) y[i] = amp * Math.sin((2 * Math.PI * f * i) / sr)
  return y
}

it('tracks a steady tone within a few cents', () => {
  const r = pyin(tone(150, 0.6), { sampleRate: sr })
  const mid = r.f0.slice(5, r.f0.length - 5)
  for (const f of mid) expect(Math.abs(1200 * Math.log2(f / 150))).toBeLessThan(15)
})

it('marks silence as unvoiced (NaN)', () => {
  const r = pyin(new Float32Array(sr / 2), { sampleRate: sr })
  expect(r.f0.every(Number.isNaN)).toBe(true)
  expect(r.voicedFlag.every((v) => v === 0)).toBe(true)
})

it('produces 1 + floor(n / hop) frames and rms of a sine ~ amp/sqrt2', () => {
  const y = tone(200, 0.5)
  expect(pyin(y, { sampleRate: sr }).f0.length).toBe(1 + Math.floor(y.length / 512))
  expect(rms(y)[10]).toBeCloseTo(0.5 / Math.SQRT2, 2)
})
