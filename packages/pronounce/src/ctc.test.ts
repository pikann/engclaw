import { describe, expect, it } from 'vitest'
import { decodeCtc, logSoftmax, parseVocab } from './ctc'

const vocab = parseVocab({
  '<pad>': 0,
  '<s>': 1,
  '</s>': 2,
  '<unk>': 3,
  a: 4,
  b: 5,
  ɔɹ: 6,
  ɚ: 7,
  ɹ: 8,
})

/** One-hot-ish logits: each frame puts a strong peak on the given token id. */
function peaks(ids: number[], v = 9, strength = 10): Float32Array {
  const out = new Float32Array(ids.length * v)
  ids.forEach((id, f) => (out[f * v + id] = strength))
  return out
}

describe('logSoftmax', () => {
  it('normalizes each frame', () => {
    const lp = logSoftmax(Float32Array.from([1, 2, 3, 0, 0, 0]), 2, 3)
    expect(Math.exp(lp[0]!) + Math.exp(lp[1]!) + Math.exp(lp[2]!)).toBeCloseTo(1, 5)
    expect(lp[3]).toBeCloseTo(Math.log(1 / 3), 5)
  })
  it('is stable for large logits', () => {
    const lp = logSoftmax(Float32Array.from([1000, 1000]), 1, 2)
    expect(lp[0]).toBeCloseTo(Math.log(0.5), 5)
  })
})

describe('decodeCtc', () => {
  it('collapses repeats, drops blank and specials, records max posterior and span', () => {
    const lp = logSoftmax(peaks([0, 4, 4, 0, 4, 3, 5, 5, 1]), 9, 9)
    const hits = decodeCtc(lp, 9, vocab)
    expect(hits.map((h) => h.phone)).toEqual(['a', 'a', 'b'])
    expect(hits[0]).toMatchObject({ start: 1, end: 3 })
    expect(hits[1]).toMatchObject({ start: 4, end: 5 })
    expect(hits[2]).toMatchObject({ start: 6, end: 8 })
    expect(hits[0]!.confidence).toBeGreaterThan(0.99)
  })
  it('takes the max posterior across the run', () => {
    const logits = Float32Array.from([
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0, // frame 0: weak 'a'
      0,
      0,
      0,
      0,
      5,
      0,
      0,
      0,
      0, // frame 1: strong 'a'
    ])
    const [hit] = decodeCtc(logSoftmax(logits, 2, 9), 2, vocab)
    const strong = Math.exp(5) / (Math.exp(5) + 8)
    expect(hit!.confidence).toBeCloseTo(strong, 5)
  })
})
