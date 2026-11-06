import { describe, expect, it } from 'vitest'
import { logSoftmax, parseVocab } from './ctc'
import { forcedAlignWords } from './forced-align'

const vocab = parseVocab({ '<pad>': 0, '|': 1, A: 2, B: 3, C: 4, "'": 5 })
const V = 6

/** Log-posteriors where each frame strongly favours the given token id. */
function emissions(ids: number[]): Float32Array {
  const logits = new Float32Array(ids.length * V)
  ids.forEach((id, f) => (logits[f * V + id] = 8))
  return logSoftmax(logits, ids.length, V)
}

describe('forcedAlignWords', () => {
  it('finds each word where its characters are emitted', () => {
    // frames: 0-1 blank, 2-3 "A", 4 "|", 5-7 "B C" (B at 5-6, C at 7), 8 blank
    const lp = emissions([0, 0, 2, 2, 1, 3, 3, 4, 0])
    const spans = forcedAlignWords(lp, 9, vocab, ['a', 'bc'])
    expect(spans).toEqual([
      { start: 2, end: 4 },
      { start: 5, end: 8 },
    ])
  })

  it('handles repeated letters, which CTC separates with a blank', () => {
    const lp = emissions([2, 0, 2, 0, 3])
    expect(forcedAlignWords(lp, 5, vocab, ['aa', 'b'])).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 5 },
    ])
  })

  it('keeps the order of words and leaves a gap where the audio has silence', () => {
    const lp = emissions([2, 0, 0, 0, 0, 0, 3])
    const [a, b] = forcedAlignWords(lp, 7, vocab, ['a', 'b'])
    expect(a!.end).toBeLessThanOrEqual(b!.start)
    expect(b!.start - a!.end).toBeGreaterThanOrEqual(4)
  })

  it('returns null for words without any token in the vocab and ignores case and punctuation', () => {
    const lp = emissions([2, 1, 3])
    expect(forcedAlignWords(lp, 3, vocab, ['A.', '42', 'b!'])).toEqual([
      { start: 0, end: 1 },
      null,
      { start: 2, end: 3 },
    ])
  })

  it('returns all null for a transcript with no speakable word', () => {
    expect(forcedAlignWords(emissions([0, 0]), 2, vocab, ['123'])).toEqual([null])
  })

  it('throws when there are fewer frames than characters', () => {
    expect(() => forcedAlignWords(emissions([2, 3]), 2, vocab, ['abc'])).toThrow(/too short/)
  })
})
