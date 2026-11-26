import { describe, expect, it } from 'vitest'
import { ChineseDictionary, parseCedict, readCedict } from './chinese-dictionary'

const source =
  '# CC-CEDICT\n你好 你好 [ni3 hao3] /hello/hi/\n學習 学习 [xue2 xi2] /to study/to learn/\n女 女 [nu:3] /woman/female/\n略 略 [lu:e4] /brief/\n綠 绿 [lu:4] /green/\n'

describe('Chinese dictionary', () => {
  it('searches simplified, traditional, pinyin and definitions in a separate id range', () => {
    const dict = new ChineseDictionary(() => source)
    for (const query of ['你好', 'ni hao', 'nǐ hǎo', 'ni3hao3', 'hello']) {
      const hit = dict.search(query)[0]!
      expect(hit.word).toBe('你好')
      expect(hit.id).toBeGreaterThanOrEqual(1_000_000_000)
      expect(dict.word(hit.id)?.pinyin).toBe('nǐ hǎo')
    }
    expect(dict.search('學習')[0]?.word).toBe('学习')
    expect(dict.search('学习')[0]?.word).toBe('学习')
    for (const query of ['nü', 'nu:', 'nv', 'nǚ']) expect(dict.search(query)[0]?.word).toBe('女')
    expect(dict.search('')).toEqual([])
    expect(dict.word(1)).toBeNull()
  })
  it('keeps multiple pronunciations and definitions and ignores header lines', () => {
    expect(parseCedict(source)).toHaveLength(5)
    const dict = new ChineseDictionary(() => source)
    const entry = dict.word(dict.search('學習')[0]!.id)!
    expect(entry.language).toBe('zh')
    expect(entry.traditional).toBe('學習')
    expect(entry.senses.map((sense) => sense.definition)).toEqual(['to study', 'to learn'])
  })
  it('converts CC-CEDICT umlaut spelling before assigning tone marks', () => {
    const dict = new ChineseDictionary(() => source)
    for (const [query, expected] of [
      ['女', 'nǚ'],
      ['略', 'lüè'],
      ['绿', 'lǜ'],
    ]) {
      const hit = dict.search(query!)[0]!
      expect(dict.word(hit.id)?.pinyin).toBe(expected)
    }
    expect(dict.search('學習')[0]).toMatchObject({ word: '学习', traditional: '學習' })
  })
  it('loads the archive lazily once across dictionary and agent-style reads', () => {
    let reads = 0
    const dict = new ChineseDictionary(() => {
      reads++
      return source
    })
    expect(reads).toBe(0)
    const hit = dict.search('學習')[0]!
    dict.word(hit.id)
    dict.word(dict.search('女')[0]!.id)
    expect(reads).toBe(1)
  })
  it('loads the real bundled dictionary offline', () => {
    const text = readCedict(new URL('../../resources/data/cedict.txt.gz', import.meta.url).pathname)
    const dict = new ChineseDictionary(() => text)
    expect(parseCedict(text).length).toBeGreaterThan(100_000)
    const hit = dict.search('中文')[0]!
    expect(dict.word(hit.id)?.pinyin).toBe('Zhōng wén')
    expect(dict.speechText('da4xiao3')).toBe('大小')
    expect(dict.speechText('da4, xiao3', true)).toBe('大，小')
    expect(dict.speechText('mian4tiao2')).toBe('面条')
    expect(dict.speechText('mian4, tiao2', true)).toBe('面，条')
    expect(dict.speechText('yi2, ding4', true)).toBe(dict.speechText('yi2, ding4'))
    expect(dict.speechText('mian4')).toBe('面')
    expect(dict.speechText('tiao2')).toBe('迢')
    expect(dict.speechText('mian4tiao5')).toBeUndefined()
    expect(dict.speechText('yu3yan2')).toBe('语言')
    expect(dict.speechText('yu3yan1')).toBe('羽烟')
    expect(dict.speechText('ju3xing1')).toBe('举星')
    expect(dict.speechText('ju3, xing1', true)).toBe('举，星')
    expect(dict.speechText('qiong1')).toBeUndefined()
    expect(dict.speechText('yi2ding4')).toBe('一定')
    expect(dict.speechText('yi1ding4')).toBe('一定')
    expect(dict.speechText('yi2yang4')).toBe('一样')
    expect(dict.speechText('bu2dui4')).toBe('不对')
    expect(dict.speechText('bu2yong4')).toBe('不用')
    expect(dict.speechText('ni2hao3')).toBe('你好')
    expect(dict.speechText('di4yi1ji4du4')).toBe('第一季度')
    expect(dict.speechText('di4yi2ji4du4')).not.toBe('第一季度')
  })
})
