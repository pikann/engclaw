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

  it.each([
    ['睡著', '睡着', 'shuì zháo', 'shui4zhao2'],
    ['看著', '看着', 'kàn zhe', 'kan4zhe5'],
    ['跟著', '跟着', 'gēn zhe', 'gen1zhe5'],
    ['著急', '着急', 'zháo jí', 'zhao2ji2'],
    ['著火', '着火', 'zháo huǒ', 'zhao2huo3'],
    ['著手', '着手', 'zhuó shǒu', 'zhuo2shou3'],
    ['著重', '着重', 'zhuó zhòng', 'zhuo2zhong4'],
    ['著作', '著作', 'zhù zuò', 'zhu4zuo4'],
    ['著名', '著名', 'zhù míng', 'zhu4ming2'],
    ['著者', '著者', 'zhù zhě', 'zhu4zhe3'],
    ['著譯', '著译', 'zhù yì', 'zhu4yi4'],
  ])(
    'looks up the contextual reading of %s and %s for the guide and speech',
    (traditional, simplified, marked, numbered) => {
      for (const text of [traditional, simplified]) {
        const items = mandarinGuide(text)
        expect(items.map((item) => item.han).join('')).toBe(text)
        expect(items.map((item) => item.marked).join(' ')).toBe(marked)
        expect(pinyinSpeech(items)).toBe(numbered)
      }
    },
  )

  it('resolves several readings in the same sentence', () => {
    const text = '看著銀行的著名建築，他著急了。'
    const items = mandarinGuide(text)
    expect(items.filter((item) => item.han === '著').map((item) => item.marked)).toEqual([
      'zhe',
      'zhù',
      'zháo',
    ])
    expect(items.find((item) => item.han === '行')?.marked).toBe('háng')
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

  it.each([
    ['nue4', 'nüè', 'nve4'],
    ['nuè', 'nüè', 'nve4'],
    ['nve4', 'nüè', 'nve4'],
    ['nu:e4', 'nüè', 'nve4'],
    ['lue4', 'lüè', 'lve4'],
    ['luè', 'lüè', 'lve4'],
  ])('accepts the keyboard spelling %s as a single üe syllable', (text, marked, numbered) => {
    const items = mandarinGuide(text)
    expect(items).toHaveLength(1)
    expect(items[0]?.marked).toBe(marked)
    expect(pinyinSpeech(items)).toBe(numbered)
  })

  it('keeps an explicit boundary between nu and e', () => {
    expect(mandarinGuide('nu e4').map((item) => item.marked)).toEqual(['nu', 'è'])
  })

  it('distinguishes missing tone marks and explicit neutral tone', () => {
    expect(mandarinGuide('ma ma5 ma0').map(({ tone }) => tone)).toEqual([0, 5, 5])
    expect(mandarinGuide('hello')).toEqual([])
  })
})
