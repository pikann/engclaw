import { expect, it } from 'vitest'
import { capClip, chunkWithOverlap, MAX_CLIP_SECONDS } from './clip'

const sr = 16000
it('default cap is 15 min', () => expect(MAX_CLIP_SECONDS).toBe(900))

it('capClip leaves short clips and truncates long ones', () => {
  const short = new Float32Array(sr * 3)
  expect(capClip(short, sr, 60)).toEqual({ samples: short, truncated: false })
  const r = capClip(new Float32Array(sr * 70), sr, 60)
  expect(r.samples.length).toBe(sr * 60)
  expect(r.truncated).toBe(true)
})

it('chunkWithOverlap returns one chunk for short audio', () => {
  expect(chunkWithOverlap(new Float32Array(sr * 5), sr, 30, 2)).toEqual([{ start: 0, end: sr * 5 }])
})

it('chunks overlap, cover everything and end at the last sample', () => {
  const n = sr * 70
  const c = chunkWithOverlap(new Float32Array(n), sr, 30, 2)
  expect(c[0]).toEqual({ start: 0, end: sr * 30 })
  expect(c[1]!.start).toBe(sr * 28)
  expect(c.at(-1)!.end).toBe(n)
  for (let i = 1; i < c.length; i++) expect(c[i]!.start).toBeLessThan(c[i - 1]!.end)
})

it('rejects overlap >= chunk length', () => {
  expect(() => chunkWithOverlap(new Float32Array(10), sr, 2, 2)).toThrow()
})
