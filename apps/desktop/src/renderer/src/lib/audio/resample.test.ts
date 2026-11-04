import { expect, it } from 'vitest'
import { downmixToMono, resampleLinear, TARGET_SAMPLE_RATE } from './resample'

function tone(f: number, sr: number, seconds: number, amp = 0.5): Float32Array {
  const y = new Float32Array(Math.round(sr * seconds))
  for (let i = 0; i < y.length; i++) y[i] = amp * Math.sin((2 * Math.PI * f * i) / sr)
  return y
}

it('targets 16 kHz', () => expect(TARGET_SAMPLE_RATE).toBe(16000))

it('downmix averages channels and passes mono through', () => {
  const l = Float32Array.from([1, 0, -1])
  const r = Float32Array.from([0, 1, -1])
  expect(Array.from(downmixToMono([l, r]))).toEqual([0.5, 0.5, -1])
  expect(downmixToMono([l])).toBe(l)
  expect(downmixToMono([]).length).toBe(0)
})

it('downsampling 48 kHz -> 16 kHz gives a third of the samples and keeps a tone', () => {
  const out = resampleLinear(tone(440, 48000, 1), 48000, 16000)
  expect(out.length).toBe(16000)
  const ref = tone(440, 16000, 1)
  let err = 0
  for (let i = 100; i < 15900; i++) err = Math.max(err, Math.abs(out[i]! - ref[i]!))
  expect(err).toBeLessThan(0.05)
})

it('upsampling 8 kHz -> 16 kHz doubles the length', () => {
  expect(resampleLinear(tone(200, 8000, 0.5), 8000, 16000).length).toBe(8000)
})

it('same rate returns the input; invalid rates throw', () => {
  const x = tone(100, 16000, 0.1)
  expect(resampleLinear(x, 16000, 16000)).toBe(x)
  expect(() => resampleLinear(x, 0, 16000)).toThrow()
})

it('attenuates content above the new Nyquist (anti-alias)', () => {
  const out = resampleLinear(tone(15000, 48000, 0.5, 1), 48000, 16000)
  let peak = 0
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  expect(peak).toBeLessThan(0.3)
})
