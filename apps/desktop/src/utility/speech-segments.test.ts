import { describe, expect, it } from 'vitest'
import { VAD_FRAME } from '@engclaw/pronounce'
import { splitSpeech } from './speech-segments'

const RATE = 16000
const seconds = (s: number) => Math.round((s * RATE) / VAD_FRAME)
/** Speech probabilities from `[seconds, probability]` stretches. */
const probs = (...stretches: [number, number][]) =>
  stretches.flatMap(([s, p]) => Array<number>(seconds(s)).fill(p))
const split = (p: number[], maxSeconds?: number) =>
  splitSpeech(p, p.length * VAD_FRAME, maxSeconds ? { maxSeconds } : {}).map((s) => ({
    from: s.start / RATE,
    to: s.end / RATE,
  }))

describe('splitSpeech', () => {
  it('returns nothing when nobody speaks', () => {
    expect(split(probs([5, 0.02]))).toEqual([])
  })

  it('ignores a blip too short to be a word', () => {
    expect(split([...probs([1, 0.02]), 0.9, ...probs([1, 0.02])])).toEqual([])
  })

  it('keeps one stretch of speech, with a little silence on each side', () => {
    const [only, ...rest] = split(probs([2, 0.02], [3, 0.9], [2, 0.02]))
    expect(rest).toEqual([])
    expect(only!.from).toBeGreaterThan(1.7)
    expect(only!.from).toBeLessThan(2)
    expect(only!.to).toBeGreaterThan(5)
    expect(only!.to).toBeLessThan(5.3)
  })

  it('joins sentences separated by a short pause', () => {
    const out = split(probs([3, 0.9], [0.5, 0.02], [3, 0.9]), 15)
    expect(out).toHaveLength(1)
  })

  it('starts a new segment after a long silence', () => {
    expect(split(probs([3, 0.9], [5, 0.02], [3, 0.9]), 15)).toHaveLength(2)
  })

  it('splits at a pause rather than exceed the maximum length', () => {
    const out = split(probs([9, 0.9], [0.5, 0.02], [9, 0.9]), 15)
    expect(out).toHaveLength(2)
    expect(out[0]!.to).toBeLessThanOrEqual(out[1]!.from)
    // The cut falls inside the pause, so neither sentence loses audio.
    expect(out[0]!.to).toBeGreaterThanOrEqual(8.99)
    expect(out[1]!.from).toBeLessThanOrEqual(9.52)
  })

  it('cuts speech with no pause at its least speech-like moment', () => {
    const out = split(probs([11, 0.9], [0.07, 0.2], [11, 0.9]), 15)
    expect(out).toHaveLength(2)
    expect(out[0]!.to).toBeCloseTo(11.03, 0)
    expect(out[1]!.from).toBe(out[0]!.to)
  })

  it('never exceeds the maximum, overlaps or drops speech, whatever the input', () => {
    let seed = 7
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    for (let run = 0; run < 200; run++) {
      const p = probs(
        ...Array.from({ length: 12 }, (): [number, number] => [random() * 12, random()]),
      )
      const total = p.length * VAD_FRAME
      const max = 2 + random() * 18
      const out = splitSpeech(p, total, { maxSeconds: max })
      out.forEach((s, i) => {
        expect(s.end - s.start).toBeLessThanOrEqual(max * RATE)
        expect(s.start).toBeGreaterThanOrEqual(i ? out[i - 1]!.end : 0)
        expect(s.end).toBeLessThanOrEqual(total)
        expect(s.end).toBeGreaterThan(s.start)
      })
      // Every stretch of clear speech is inside some segment.
      for (let f = 0; f + 3 <= p.length; f++) {
        if (!(p[f]! >= 0.3 && p[f + 1]! >= 0.3 && p[f + 2]! >= 0.3)) continue
        const at = (f + 1) * VAD_FRAME
        expect(out.some((s) => s.start <= at && at < s.end)).toBe(true)
      }
    }
  })
})
