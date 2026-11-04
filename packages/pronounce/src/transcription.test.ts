import { describe, expect, it } from 'vitest'
import { cleanTranscription, compareTranscriptions, feedbackText } from './transcription'
import type { WordPhones } from './phonemizer'

const lexicon: Record<string, string[]> = {
  hello: ['h', 'ə', 'l', 'oʊ'],
  world: ['w', 'ɚ', 'l', 'd'],
  word: ['w', 'ɚ', 'd'],
  bird: ['b', 'ɚ', 'd'],
}
const phonemize = (text: string): WordPhones[] =>
  text
    .match(/\b[\w']+\b/g)!
    .map((w) => ({ word: w.toLowerCase(), phones: lexicon[w.toLowerCase()]! }))

const compare = (heard: string, reference: string) =>
  compareTranscriptions(heard.toUpperCase(), reference, phonemize(reference), phonemize(heard))

describe('cleanTranscription', () => {
  it('lower-cases and keeps letters, apostrophes and single spaces', () => {
    expect(cleanTranscription("  HELLO,   World! It's 42 ")).toBe("hello world it's")
  })
  it('returns empty for nothing speakable', () => {
    expect(cleanTranscription(' 123 !? ')).toBe('')
  })
})

describe('feedbackText', () => {
  it('lists flagged words', () => {
    expect(feedbackText(['a', 'b'])).toBe(
      '🔊 Feedback on your pronunciation:\n❌ You need to better pronounce these words: a, b\n',
    )
  })
  it('praises a clean reading', () => {
    expect(feedbackText([])).toBe(
      '🔊 Feedback on your pronunciation:\n✅ Your pronunciation is excellent! 🎉\n',
    )
  })
})

describe('compareTranscriptions', () => {
  it('perfect match: zero rates, no errors', () => {
    const r = compare('hello world', 'Hello world')
    expect(r).toMatchObject({
      wordDistance: 0,
      wordErrorRate: 0,
      phonemeErrorRate: 0,
      errors: [],
      wordsWithErrors: [],
    })
    expect(r.feedback).toContain('excellent')
  })

  it('one dropped phone stays under the word threshold but counts in WER/PER', () => {
    const r = compare('hello word', 'hello world')
    expect(r.wordDistance).toBe(1)
    expect(r.wordErrorRate).toBe(0.5)
    expect(r.phonemeErrorRate).toBe(0.125)
    expect(r.errors).toEqual([])
  })

  it('missing word is flagged with no heard phones', () => {
    const r = compare('hello', 'hello world')
    expect(r.wordErrorRate).toBe(0.5)
    expect(r.phonemeErrorRate).toBe(0.5)
    expect(r.errors).toEqual([
      { position: 4, expected: 'wɚld', actual: '', word: 'world', actualWord: '' },
    ])
    expect(r.wordsWithErrors).toEqual(['world'])
    expect(r.feedback).toContain('world')
  })

  it('substituted word reports what was heard', () => {
    const r = compare('hello bird', 'hello world')
    expect(r.wordErrorRate).toBe(0.5)
    expect(r.phonemeErrorRate).toBe(0.25)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ word: 'world', position: 4, actualWord: 'bird' })
  })

  it('de-duplicates repeated flagged words in order', () => {
    const r = compareTranscriptions('', 'world hello world', phonemize('world hello world'), [])
    expect(r.wordsWithErrors).toEqual(['world', 'hello'])
    expect(r.errors).toHaveLength(3)
    expect(r.wordErrorRate).toBe(1)
    expect(r.phonemeErrorRate).toBe(1)
  })
})
