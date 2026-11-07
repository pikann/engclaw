import { describe, expect, it, vi } from 'vitest'
import { lookupCandidates, normalizeWord, resolveWord, segmentText } from './words'

const words = (text: string) =>
  segmentText(text)
    .filter((p) => p.word)
    .map((p) => p.word)

describe('segmentText', () => {
  it('round-trips the original text', () => {
    const text = 'Hello,  "world"! It’s a well-known — thing (really)… 42.'
    expect(
      segmentText(text)
        .map((p) => p.text)
        .join(''),
    ).toBe(text)
  })

  it('strips surrounding punctuation from words', () => {
    expect(words('"Hello," she said.')).toEqual(['hello', 'she', 'said'])
    expect(words('(really?!)')).toEqual(['really'])
  })

  it('keeps contractions whole and normalizes curly apostrophes', () => {
    expect(words("don't")).toEqual(["don't"])
    expect(words('It’s fine')).toEqual(["it's", 'fine'])
    expect(words("rock 'n' roll")).toEqual(['rock', 'n', 'roll'])
  })

  it('keeps hyphenated compounds whole but splits on dashes', () => {
    expect(words('a well-known fact')).toEqual(['a', 'well-known', 'fact'])
    expect(words('wait — what')).toEqual(['wait', 'what'])
    expect(words('end-')).toEqual(['end'])
  })

  it('skips numbers, symbols and empty text', () => {
    expect(words('in 2024, 3.5 % more')).toEqual(['in', 'more'])
    expect(segmentText('')).toEqual([])
    expect(words('— … !?')).toEqual([])
  })

  it('handles accented letters', () => {
    expect(words('Café naïve')).toEqual(['café', 'naïve'])
  })
})

describe('normalizeWord', () => {
  it('lowercases and straightens apostrophes', () => {
    expect(normalizeWord('Don’t')).toBe("don't")
  })
})

describe('lookupCandidates', () => {
  it('tries the surface form first', () => {
    expect(lookupCandidates('Running')[0]).toBe('running')
  })

  it('falls back to simple stems', () => {
    expect(lookupCandidates('running')).toContain('run')
    expect(lookupCandidates('stopped')).toContain('stop')
    expect(lookupCandidates('studies')).toContain('study')
    expect(lookupCandidates('makes')).toContain('make')
    expect(lookupCandidates('walked')).toContain('walk')
  })

  it('falls back for possessives and hyphen parts', () => {
    expect(lookupCandidates("dog's")).toContain('dog')
    expect(lookupCandidates('well-known')).toEqual(['well-known', 'well', 'known'])
  })

  it('does not stem very short words', () => {
    expect(lookupCandidates('is')).toEqual(['is'])
    expect(lookupCandidates('bed')).toEqual(['bed'])
  })
})

describe('resolveWord', () => {
  it('returns the exact entry for the surface form', async () => {
    const search = vi.fn().mockResolvedValue([
      { id: 2, word: 'runner' },
      { id: 1, word: 'Run' },
    ])
    expect(await resolveWord('run', search)).toEqual({ id: 1, word: 'Run' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('tries the stem when the surface form is missing', async () => {
    const search = vi.fn(async (q: string) => (q === 'run' ? [{ id: 1, word: 'run' }] : []))
    expect(await resolveWord('running', search)).toEqual({ id: 1, word: 'run' })
  })

  it('ignores fuzzy and prefix hits that are not the word', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 9, word: 'zzzzed' }])
    expect(await resolveWord('zzzz', search)).toBeNull()
  })
})
