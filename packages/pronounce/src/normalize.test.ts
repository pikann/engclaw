import { describe, expect, it } from 'vitest'
import { normalizeIndexed, normalizePhone } from './normalize'

describe('normalizePhone', () => {
  it('strips digits and length marks', () => {
    expect(normalizePhone('a2')).toBe('a')
    expect(normalizePhone('iː')).toBe('i')
  })
  it('applies token aliases', () => {
    expect(normalizePhone('th')).toBe('t')
    expect(normalizePhone('kh')).toBe('k')
    expect(normalizePhone('ph')).toBe('p')
    expect(normalizePhone('ai')).toBe('aɪ')
    expect(normalizePhone('ei')).toBe('eɪ')
    expect(normalizePhone('au')).toBe('aʊ')
    expect(normalizePhone('ou')).toBe('oʊ')
  })
  it('applies the English phone map', () => {
    expect(['ᵻ', 'ɐ', 'ɔ', 'ɔɹ', 'ɜ', 'ɾ', 'ɫ'].map((p) => normalizePhone(p))).toEqual([
      'ɪ',
      'ə',
      'ɑ',
      'oɹ',
      'ɚ',
      't',
      'l',
    ])
  })
})

describe('normalizeIndexed', () => {
  it('merges repeats created by mapping, keeping max confidence and union span', () => {
    const out = normalizeIndexed([
      { phone: 'ɐ', confidence: 0.6, start: 0, end: 2 },
      { phone: 'ə', confidence: 0.9, start: 2, end: 4 },
    ])
    expect(out).toEqual([{ phone: 'ə', confidence: 0.9, start: 0, end: 4 }])
  })
  it('collapses ɚ ɹ into ɚ', () => {
    const out = normalizeIndexed([
      { phone: 'ɚ', confidence: 0.5, start: 0, end: 1 },
      { phone: 'ɹ', confidence: 0.8, start: 1, end: 2 },
    ])
    expect(out).toEqual([{ phone: 'ɚ', confidence: 0.8, start: 0, end: 2 }])
  })
  it('drops tokens that normalize to nothing', () => {
    expect(normalizeIndexed([{ phone: 'ː', confidence: 1, start: 0, end: 1 }])).toEqual([])
  })
})
