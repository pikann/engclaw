import { describe, expect, it } from 'vitest'
import { acousticDistance, computePronunciationScore, ACOUSTIC_GOOD, ACOUSTIC_SPAN } from './score'

describe('acousticDistance', () => {
  it('is zero for identical embeddings', () => {
    const a = Float32Array.from([1, 2, 3, 4, 5, 6])
    expect(acousticDistance(a, a, 2).distance).toBe(0)
  })
  it('divides the DTW cost by the path length', () => {
    const a = Float32Array.from([0, 0, 0])
    const b = Float32Array.from([2, 2, 2])
    expect(acousticDistance(a, b, 1).distance).toBe(2)
  })
})

describe('computePronunciationScore', () => {
  it('uses the Kokoro-recalibrated constants', () => {
    expect(ACOUSTIC_GOOD).toBe(7)
    expect(ACOUSTIC_SPAN).toBe(9)
  })
  it('perfect reading scores 100', () => {
    expect(
      computePronunciationScore({ acousticDistance: 5, phonemeErrorRate: 0, wordErrorRate: 0 }),
    ).toBe(100)
  })
  it('weights 0.3 / 0.4 / 0.3 and rounds to 2 dp', () => {
    // acoustic: 100*(1-(11.5-7)/9)=50 ; phoneme 80 ; word 60
    expect(
      computePronunciationScore({
        acousticDistance: 11.5,
        phonemeErrorRate: 0.2,
        wordErrorRate: 0.4,
      }),
    ).toBe(65)
    expect(
      computePronunciationScore({
        acousticDistance: 10,
        phonemeErrorRate: 0.123,
        wordErrorRate: 0.333,
      }),
    ).toBe(75.09)
  })
  it('clips each component to 0..100', () => {
    expect(
      computePronunciationScore({ acousticDistance: 40, phonemeErrorRate: 2, wordErrorRate: 3 }),
    ).toBe(0)
    expect(
      computePronunciationScore({ acousticDistance: 0, phonemeErrorRate: 0, wordErrorRate: 0 }),
    ).toBe(100)
  })
})
