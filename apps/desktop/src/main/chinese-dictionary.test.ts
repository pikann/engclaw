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
  })
})
