import { expect, it } from 'vitest'
import { SilenceDetector, frameRms } from './vad'

const sr = 16000
const frame = (amp: number, n = 1600) => new Float32Array(n).fill(amp) // 100 ms

it('computes rms', () => {
  expect(frameRms(frame(0.5))).toBeCloseTo(0.5)
  expect(frameRms(new Float32Array(0))).toBe(0)
})

it('does not auto-stop before any speech, however long the silence', () => {
  const d = new SilenceDetector({ sampleRate: sr })
  for (let i = 0; i < 100; i++) expect(d.push(frame(0))).toBe(false)
})

it('auto-stops after 2 s of silence following speech', () => {
  const d = new SilenceDetector({ sampleRate: sr })
  for (let i = 0; i < 5; i++) expect(d.push(frame(0.2))).toBe(false)
  let stoppedAt = -1
  for (let i = 1; i <= 25; i++) if (d.push(frame(0.001)) && stoppedAt < 0) stoppedAt = i
  expect(stoppedAt).toBe(20) // 20 x 100 ms
})

it('speech resets the silence timer', () => {
  const d = new SilenceDetector({ sampleRate: sr })
  d.push(frame(0.2))
  for (let i = 0; i < 15; i++) d.push(frame(0))
  d.push(frame(0.2))
  for (let i = 0; i < 19; i++) expect(d.push(frame(0))).toBe(false)
  expect(d.push(frame(0))).toBe(true)
})
