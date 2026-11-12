import { describe, expect, it } from 'vitest'
import { chineseCharacters, mandarinReadings, mandarinResult } from './mandarin'
import { espeakPcm } from './mandarin-speech'
import { encodeWav } from '../main/store/wav'

describe('Mandarin assessment', () => {
  it('compares recognized Chinese characters without requiring spaces or English normalization', () => {
    expect(chineseCharacters('你好，世界！')).toEqual(['你', '好', '世', '界'])
    const result = mandarinResult('你好，世界！', '你 好 世界')
    expect(result.score).toBe(100)
    expect(result.assessment).toBe('character-accuracy')
    expect(result.language).toBe('zh')
    expect(result.differences.errors).toEqual([])
    expect(result.differences.expected_phones).toEqual([])
  })
  it('penalizes substitutions, deletions, insertions and silence', () => {
    for (const [heard, score] of [
      ['你号', 50],
      ['你', 50],
      ['你好啊', 50],
      ['', 0],
    ] as const) {
      const result = mandarinResult('你好', heard)
      expect(result.score).toBe(score)
      expect(result.differences.errors.length).toBeGreaterThan(0)
      expect(result.feedback.code).toBe('NEEDS_WORK')
    }
    expect(() => mandarinResult('！？', '')).toThrow('speakable')
  })
  it('scores equivalent simplified, traditional and mixed-script sentences equally', () => {
    for (const [reference, transcript] of [
      ['學習中文，我喜歡貓。', '学习中文我喜欢猫'],
      ['学习中文我喜欢猫', '學習中文，我喜歡貓。'],
      ['學习中文', '学習中文'],
    ]) {
      const result = mandarinResult(reference!, transcript!)
      expect(result.score).toBe(100)
      expect(result.differences.errors).toEqual([])
      expect(result.feedback.code).toBe('EXCELLENT')
    }
    expect(mandarinResult('我愛貓', '我爱狗').score).toBe(67)
  })
  it('reports a deletion as empty rather than borrowing the next recognized character', () => {
    const result = mandarinResult('我喜欢猫', '我喜猫')
    expect(result.score).toBe(75)
    expect(result.differences.errors).toEqual([
      expect.objectContaining({
        position: 2,
        word: '欢',
        expected: '欢',
        actual: '',
        actual_word: '',
      }),
    ])
  })
  it('returns context-sensitive pinyin without punctuation slots', () => {
    expect(mandarinReadings('你好，世界！')).toEqual([
      { word: '你', phones: ['nǐ'] },
      { word: '好', phones: ['hǎo'] },
      { word: '世', phones: ['shì'] },
      { word: '界', phones: ['jiè'] },
    ])
    expect(mandarinReadings('银行').at(-1)?.phones).toEqual(['háng'])
  })
})

describe('Mandarin speech audio', () => {
  it('decodes and resamples a WAV, including espeak streaming length headers', () => {
    const wav = encodeWav(new Float32Array(22050).fill(0.25), 22050)
    wav.writeUInt32LE(0x7fffffff, 40)
    const samples = espeakPcm(wav)
    expect(samples.length).toBe(16000)
    expect(samples[8000]).toBeCloseTo(0.25, 3)
    expect(() => espeakPcm(Buffer.from('bad'))).toThrow()
  })
})
