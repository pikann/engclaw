import { describe, expect, it } from 'vitest'
import { pickCaptionTrack, segmentCues } from './shadowing'
import { segmentText } from './words'
import { tokenizeSentence } from './dictation'
import { alignIpa } from './ipa'

describe('Mandarin shadowing', () => {
  it('selects manual Mandarin over automatic, never falls back to English or Cantonese', () => {
    const tracks = [
      { lang: 'en', auto: false },
      { lang: 'zh-HK', auto: false },
      { lang: 'zh-CN', auto: true },
      { lang: 'zh-Hans', auto: false },
    ]
    expect(pickCaptionTrack(tracks, 'zh')).toBe('zh-Hans')
    expect(pickCaptionTrack(tracks, 'en')).toBe('en')
    expect(
      pickCaptionTrack(
        [
          { lang: 'zh-HK', auto: false },
          { lang: 'en', auto: false },
        ],
        'zh',
      ),
    ).toBeNull()
    expect(pickCaptionTrack([{ lang: 'zh', auto: true }], 'zh')).toBe('zh')
    for (const lang of ['zh-TW', 'zh-Hant', 'zh-Hant-TW', 'zh-SG', 'zh-x-engclaw-asr'])
      expect(pickCaptionTrack([{ lang, auto: true }], 'zh')).toBe(lang)
  })
  it('splits Chinese sentences at punctuation without spaces', () => {
    const segments = segmentCues([{ start: 0, dur: 6, text: '你好。你叫什么名字？我叫小明！' }])
    expect(segments.map((segment) => segment.text)).toEqual([
      '你好。',
      '你叫什么名字？',
      '我叫小明！',
    ])
  })
  it('segments continuous Chinese for dictionary lookup and dictation', () => {
    const text = '我正在学习中文。'
    const parts = segmentText(text)
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts.filter((part) => part.word).length).toBeGreaterThan(2)
    expect(tokenizeSentence(text).filter((token) => token.word).length).toBeGreaterThan(2)
  })
  it('aligns pinyin with Chinese characters and punctuation', () => {
    expect(
      alignIpa('你好！', [
        { word: '你', ipa: 'nǐ' },
        { word: '好', ipa: 'hǎo' },
      ]),
    ).toEqual([
      { text: '你', ipa: 'nǐ' },
      { text: '好', ipa: 'hǎo' },
      { text: '！', ipa: null },
    ])
  })
})
