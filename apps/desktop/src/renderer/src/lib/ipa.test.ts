import { describe, expect, it } from 'vitest'
import { alignIpa } from './ipa'

const w = (word: string, ipa: string) => ({ word, ipa })

describe('alignIpa', () => {
  it('attaches IPA to each piece and keeps punctuation in the text', () => {
    expect(
      alignIpa("Hello, don't go!", [w('hello', 'həloʊ'), w("don't", 'doʊnt'), w('go', 'ɡoʊ')]),
    ).toEqual([
      { text: 'Hello,', ipa: 'həloʊ' },
      { text: "don't", ipa: 'doʊnt' },
      { text: 'go!', ipa: 'ɡoʊ' },
    ])
  })

  it('gives punctuation-only pieces no IPA', () => {
    expect(alignIpa('Yes - no', [w('yes', 'jɛs'), w('no', 'noʊ')])).toEqual([
      { text: 'Yes', ipa: 'jɛs' },
      { text: '-', ipa: null },
      { text: 'no', ipa: 'noʊ' },
    ])
  })

  it('joins hyphenated pieces that hold several words', () => {
    expect(alignIpa('well-known', [w('well', 'wɛl'), w('known', 'noʊn')])?.[0]?.ipa).toBe(
      'wɛl noʊn',
    )
  })

  it('returns null when the word counts differ', () => {
    expect(alignIpa('one two', [w('one', 'wʌn')])).toBeNull()
    expect(alignIpa('one', [w('one', 'wʌn'), w('two', 'tuː')])).toBeNull()
  })
})
