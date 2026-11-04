import { describe, expect, it } from 'vitest'
import {
  chunkTokenIds,
  concatAudio,
  ipaToTokenIds,
  splitSentences,
  styleRow,
  trimSilence,
  withPad,
} from './tts'

describe('tts helpers', () => {
  it('maps IPA to token ids, dropping separators and unknown symbols', () => {
    const vocab = { h: 50, ə: 83, l: 54, ˈ: 156, ' ': 16 }
    expect(ipaToTokenIds('h_ə_l_ˈ_z ə', vocab)).toEqual([50, 83, 54, 156, 16, 83])
  })

  it('splits sentences and ignores punctuation-only parts', () => {
    expect(splitSentences('Hello there. How are you?  ... Fine!')).toEqual([
      'Hello there.',
      'How are you?',
      'Fine!',
    ])
  })

  it('chunks long id lists and pads with 0', () => {
    expect(chunkTokenIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(withPad([7, 8])).toEqual([0, 7, 8, 0])
  })

  it('picks the style row by token count, clamped to the pack', () => {
    const voice = new Float32Array(3 * 256)
    for (let r = 0; r < 3; r++) voice.fill(r, r * 256, (r + 1) * 256)
    expect(styleRow(voice, 1)[0]).toBe(1)
    expect(styleRow(voice, 99)[255]).toBe(2)
    expect(styleRow(voice, 1)).toHaveLength(256)
  })

  it('trims silence with a margin and handles all-silent audio', () => {
    const a = Float32Array.from([0, 0, 0.5, -0.4, 0, 0, 0])
    expect(trimSilence(a, 0.01, 0)).toEqual(Float32Array.of(0.5, -0.4))
    expect(trimSilence(a, 0.01, 1)).toEqual(Float32Array.of(0, 0.5, -0.4, 0))
    expect(trimSilence(new Float32Array(10))).toHaveLength(0)
  })

  it('concatenates audio parts', () => {
    expect(Array.from(concatAudio([Float32Array.of(1), Float32Array.of(2, 3)]))).toEqual([1, 2, 3])
  })
})
