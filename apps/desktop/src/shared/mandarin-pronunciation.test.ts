import { describe, expect, it } from 'vitest'
import { mandarinGuide, pinyinSpeech } from './mandarin-pronunciation'

describe('Mandarin pronunciation guide', () => {
  it.each(['面条', 'miàntiáo', 'mian4 tiao2', 'mian4tiao2'])('breaks down %s', (input) => {
    const items = mandarinGuide(input)
    expect(items).toMatchObject([
      { marked: 'miàn', tone: 4, initial: 'm', final: 'ian' },
      { marked: 'tiáo', tone: 2, initial: 't', final: 'iao' },
    ])
    expect(pinyinSpeech(items)).toBe('mian4tiao2')
  })

  it('keeps traditional characters while looking up contextual readings', () => {
    expect(mandarinGuide('銀行')).toMatchObject([
      { han: '銀', marked: 'yín' },
      { han: '行', marked: 'háng' },
    ])
  })

  it.each([
    ['显著', 'zhù'],
    ['顯著', 'zhù'],
    ['土著', 'zhù'],
    ['著稱', 'zhù'],
    ['論著', 'zhù'],
    ['原著', 'zhù'],
    ['著書', 'zhù'],
    ['編著', 'zhù'],
    ['著', 'zhù'],
  ])('keeps the lexical reading of 著 in %s', (text, expected) => {
    expect(mandarinGuide(text).find((item) => item.han === '著')?.marked).toBe(expected)
  })

  it('keeps word breaks, punctuation pauses and ü when converting to speech', () => {
    const items = mandarinGuide('xī’ān，lüè')
    expect(items.map(({ marked, pauseBefore }) => [marked, pauseBefore])).toEqual([
      ['xī', false],
      ['ān', false],
      ['lüè', true],
    ])
    expect(pinyinSpeech(items)).toBe('xi1an1, lve4')
  })

  it('distinguishes missing tone marks and explicit neutral tone', () => {
    expect(mandarinGuide('ma ma5 ma0').map(({ tone }) => tone)).toEqual([0, 5, 5])
    expect(mandarinGuide('hello')).toEqual([])
  })
})
