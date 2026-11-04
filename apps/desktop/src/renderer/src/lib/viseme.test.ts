import { describe, expect, it } from 'vitest'
import { phoneDuration, splitPhones, visemeFrames, visemeFor, wordDuration } from './viseme'

describe('visemeFor', () => {
  it('maps IPA to a CMU39 mouth shape', () => {
    expect(visemeFor('θ')).toBe('TH')
    expect(visemeFor('ɹ')).toBe('R')
    expect(visemeFor('æ')).toBe('AE')
    expect(visemeFor('tʃ')).toBe('CH')
  })
  it('ignores length and stress marks', () => {
    expect(visemeFor('iː')).toBe('IY')
    expect(visemeFor('ˈɑ')).toBe('AA')
  })
  it('falls back to rest for unknown sounds', () => {
    expect(visemeFor('☃')).toBe('rest')
  })
})

describe('splitPhones', () => {
  it('keeps a known single or affricate phone whole', () => {
    expect(splitPhones('tʃ')).toEqual(['tʃ'])
    expect(splitPhones('eɪ')).toEqual(['eɪ'])
  })
  it('splits compound phones into parts that have a mouth shape', () => {
    expect(splitPhones('ɪə')).toEqual(['ɪ', 'ə'])
    expect(splitPhones('oɹ')).toEqual(['o', 'ɹ'])
  })
  it('greedily splits an unseparated phone string', () => {
    expect(splitPhones('ʃɪp')).toEqual(['ʃ', 'ɪ', 'p'])
  })
})

describe('durations', () => {
  it('sums a word from its phones', () => {
    expect(wordDuration(['b', 'ɪ'])).toBe(phoneDuration('b') + phoneDuration('ɪ'))
  })
  it('uses a default for unknown phones', () => {
    expect(phoneDuration('☃')).toBe(200)
  })
})

describe('visemeFrames', () => {
  it('builds a timed sequence ending on rest', () => {
    const frames = visemeFrames(['ð', 'ə'])
    expect(frames.map((f) => f.viseme)).toEqual(['DH', 'AH', 'rest'])
    expect(frames.slice(0, -1).every((f) => f.ms >= 150)).toBe(true)
  })
  it('is empty-safe', () => {
    expect(visemeFrames([])).toEqual([{ viseme: 'rest', ms: 0 }])
  })
})
