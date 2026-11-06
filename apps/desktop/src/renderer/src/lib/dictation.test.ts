import { describe, expect, it } from 'vitest'
import {
  blankCount,
  gradeAnswer,
  makeBlanks,
  reviewList,
  scoreSegment,
  seededRandom,
  sessionScore,
  tokenizeSentence,
  type SegmentResult,
} from './dictation'

describe('tokenizeSentence', () => {
  it('keeps surrounding punctuation out of the word that is checked', () => {
    const t = tokenizeSentence('Hello, "world"! It’s fine.')
    expect(t.map((x) => x.word)).toEqual(['Hello', 'world', 'It’s', 'fine'])
    expect(t[0]).toMatchObject({ before: '', after: ',' })
    expect(t[1]).toMatchObject({ before: '"', after: '"!' })
  })

  it('treats tokens with no letters or digits as plain text, not words', () => {
    const t = tokenizeSentence('Wait - what?')
    expect(t.map((x) => x.word)).toEqual(['Wait', '', 'what'])
  })
})

describe('blankCount', () => {
  it('hides the configured share of words, at least one', () => {
    expect(blankCount(10, 30)).toBe(3)
    expect(blankCount(10, 0)).toBe(1)
    expect(blankCount(4, 10)).toBe(1)
  })

  it('hides one word only in a segment with fewer than three words', () => {
    expect(blankCount(2, 100)).toBe(1)
    expect(blankCount(1, 50)).toBe(1)
  })

  it('never hides every word of a longer sentence away unless asked for 100%', () => {
    expect(blankCount(5, 100)).toBe(5)
    expect(blankCount(0, 50)).toBe(0)
  })
})

describe('makeBlanks', () => {
  const text = 'Today we talk about the importance of learning new languages quickly.'

  it('picks the right number of distinct word positions, in order', () => {
    const blanks = makeBlanks(text, 30, seededRandom(1))
    expect(blanks).toHaveLength(3)
    expect([...blanks].sort((a, b) => a - b)).toEqual(blanks)
    expect(new Set(blanks).size).toBe(3)
    const words = tokenizeSentence(text)
    for (const i of blanks) expect(words[i]!.word).not.toBe('')
  })

  it('is deterministic for a seed and varies between seeds', () => {
    expect(makeBlanks(text, 30, seededRandom(7))).toEqual(makeBlanks(text, 30, seededRandom(7)))
    const seen = new Set(
      Array.from({ length: 20 }, (_, s) => makeBlanks(text, 30, seededRandom(s)).join(',')),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('never blanks a non-word token', () => {
    const blanks = makeBlanks('Wait - what - now', 100, seededRandom(3))
    const tokens = tokenizeSentence('Wait - what - now')
    for (const i of blanks) expect(tokens[i]!.word).not.toBe('')
  })

  it('returns nothing for text without words', () => {
    expect(makeBlanks('...', 50, seededRandom(1))).toEqual([])
  })
})

describe('gradeAnswer', () => {
  it('ignores case, punctuation and surrounding spaces', () => {
    expect(gradeAnswer('  TALK. ', 'talk')).toBe('correct')
    expect(gradeAnswer("it's", 'It’s')).toBe('correct')
  })

  it('accepts a near miss by edit distance, scaled to the word length', () => {
    expect(gradeAnswer('importence', 'importance')).toBe('near')
    expect(gradeAnswer('languges', 'languages')).toBe('near')
    expect(gradeAnswer('tack', 'talk')).toBe('near')
  })

  it('does not allow near misses on very short words', () => {
    expect(gradeAnswer('at', 'it')).toBe('wrong')
    expect(gradeAnswer('cat', 'cut')).toBe('wrong')
  })

  it('marks different or empty answers wrong', () => {
    expect(gradeAnswer('banana', 'talk')).toBe('wrong')
    expect(gradeAnswer('', 'talk')).toBe('wrong')
    expect(gradeAnswer('   ', 'talk')).toBe('wrong')
  })

  it('treats digits as part of the word', () => {
    expect(gradeAnswer('2024', '2024')).toBe('correct')
    expect(gradeAnswer('2025', '2024')).toBe('wrong')
  })
})

describe('scoring', () => {
  const res = (grades: SegmentResult['grades'], words = ['a', 'b', 'c', 'd']): SegmentResult => ({
    grades,
    answers: words.map(() => ''),
    expected: words,
  })

  it('counts correct and near-miss blanks as right', () => {
    expect(scoreSegment(res(['correct', 'near', 'wrong']))).toBeCloseTo(2 / 3)
    expect(scoreSegment(res([]))).toBe(0)
  })

  it('averages the blanks of all checked segments, not the segments', () => {
    const results = new Map<number, SegmentResult>([
      [0, res(['correct', 'correct', 'correct', 'wrong'])],
      [2, res(['wrong'])],
    ])
    expect(sessionScore(results)).toEqual({ right: 3, total: 5, checked: 2, ratio: 0.6 })
    expect(sessionScore(new Map())).toEqual({ right: 0, total: 0, checked: 0, ratio: 0 })
  })

  it('lists the missed words with what was typed, in segment order', () => {
    const results = new Map<number, SegmentResult>([
      [3, { grades: ['wrong'], answers: ['imp'], expected: ['import'] }],
      [1, { grades: ['correct', 'wrong'], answers: ['x', 'tack'], expected: ['x', 'talk'] }],
    ])
    expect(reviewList(results)).toEqual([
      { segment: 1, expected: 'talk', answered: 'tack' },
      { segment: 3, expected: 'import', answered: 'imp' },
    ])
  })
})
