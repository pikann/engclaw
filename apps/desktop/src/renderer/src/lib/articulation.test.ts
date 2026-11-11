import { describe, expect, it } from 'vitest'
import {
  POSE_KEYS,
  REST_POSE,
  jawPath,
  palatePath,
  poseFor,
  articulationFrames,
  ipaPhones,
  scaleFrames,
  tonguePath,
} from './articulation'
import { splitPhones, visemeFrames } from './viseme'

describe('poseFor', () => {
  it('puts the tongue tip between the teeth for TH and behind the ridge for T', () => {
    expect(poseFor('θ').tx).toBeLessThan(poseFor('t').tx)
    expect(poseFor('t').ty).toBeLessThan(poseFor('θ').ty)
  })
  it('separates S (tongue front high) from TH (tongue front low)', () => {
    expect(poseFor('s').fy).toBeLessThan(poseFor('θ').fy)
  })
  it('raises the back of the tongue for K/G but not T/D', () => {
    expect(poseFor('k').by).toBeLessThan(poseFor('t').by)
    expect(poseFor('g')).toMatchObject({ by: poseFor('k').by, voice: 1 })
  })
  it('bunches the tongue for R, unlike the tip-up L', () => {
    expect(poseFor('ɹ').ty).toBeGreaterThan(poseFor('l').ty)
    expect(poseFor('ɹ').by).toBeLessThan(poseFor('l').by)
  })
  it('orders vowel height and backness: IY front-high, AA low, UW back-high', () => {
    expect(poseFor('i').fy).toBeLessThan(poseFor('ɑ').fy)
    expect(poseFor('i').jaw).toBeLessThan(poseFor('ɑ').jaw)
    expect(poseFor('u').by).toBeLessThan(poseFor('ɑ').by)
    expect(poseFor('u').fy).toBeGreaterThan(poseFor('i').fy)
    expect(poseFor('u').prot).toBeLessThan(0)
  })
  it('lowers the soft palate for nasals only', () => {
    for (const n of ['m', 'n', 'ŋ']) expect(poseFor(n).velum).toBe(1)
    expect(poseFor('b').velum).toBe(0)
  })
  it('marks voicing: B voiced, P not', () => {
    expect(poseFor('b').voice).toBe(1)
    expect(poseFor('p').voice).toBe(0)
  })
  it('closes the lips for P/B/M and touches lip to teeth for F/V', () => {
    expect(poseFor('p').jaw).toBe(0)
    expect(poseFor('p').lift).toBeGreaterThan(poseFor('f').lift)
    expect(poseFor('f').lift).toBeGreaterThan(0)
  })
  it('ignores length/stress marks and falls back to rest', () => {
    expect(poseFor('iː')).toEqual(poseFor('i'))
    expect(poseFor('☃')).toEqual(REST_POSE)
  })
})

describe('articulationFrames', () => {
  const total = (fs: { ms: number }[]): number => fs.reduce((n, f) => n + f.ms, 0)
  it('glides a diphthong through two poses and ends on rest', () => {
    const frames = articulationFrames(['aɪ'])
    expect(frames.map((f) => f.phone)).toEqual(['a', 'ɪ', ''])
    expect(frames.at(-1)?.pose).toEqual(REST_POSE)
    expect(frames.at(-1)?.ms).toBe(0)
  })
  it('keeps the mouth picture and the tongue pose on one timeline', () => {
    for (const ph of [['t', 'ə'], ['aɪ'], ['ʃɪp'], ['θ', 'oʊ', 'ɹ']]) {
      expect(total(articulationFrames(ph))).toBe(total(visemeFrames(ph)))
    }
    expect(articulationFrames(['θ'])[0]?.viseme).toBe('TH')
    expect(articulationFrames(['eɪ']).map((f) => f.viseme)).toEqual(['EY', 'EY', 'rest'])
  })
  it('handles an unseparated run of phones', () => {
    expect(articulationFrames(splitPhones('ʃɪp')).map((f) => f.phone)).toEqual(['ʃ', 'ɪ', 'p', ''])
  })
  it('is just the rest pose for no phones', () => {
    expect(articulationFrames([])).toHaveLength(1)
  })
})

describe('scaleFrames', () => {
  const total = (fs: { ms: number }[]): number => fs.reduce((n, f) => n + f.ms, 0)
  it('stretches a timeline to the spoken length, keeping proportions and the rest frame', () => {
    const frames = articulationFrames(['t', 'ɑ'])
    const scaled = scaleFrames(frames, 1000)
    expect(total(scaled)).toBeCloseTo(1000)
    expect(scaled[0]!.ms / scaled[1]!.ms).toBeCloseTo(frames[0]!.ms / frames[1]!.ms)
    expect(scaled.at(-1)?.ms).toBe(0)
    expect(scaled.map((f) => f.phone)).toEqual(frames.map((f) => f.phone))
  })
  it('leaves the timeline alone for a missing or invalid length', () => {
    const frames = articulationFrames(['t'])
    expect(scaleFrames(frames, 0)).toEqual(frames)
    expect(scaleFrames(frames, Number.NaN)).toEqual(frames)
  })
})

describe('geometry', () => {
  const nums = (d: string): number => (d.match(/-?\d+(\.\d+)?/g) ?? []).length
  it('gives every pose a tongue outline with the same structure (so they can be tweened)', () => {
    const base = tonguePath(REST_POSE).replace(/-?\d+(\.\d+)?/g, '#')
    for (const ph of ['θ', 'ɹ', 'k', 'i', 'ɑ', 'm']) {
      expect(tonguePath(poseFor(ph)).replace(/-?\d+(\.\d+)?/g, '#')).toBe(base)
    }
    expect(nums(tonguePath(REST_POSE))).toBeGreaterThan(40)
  })
  it('has a finite number for every pose key', () => {
    for (const ph of ['p', 'tʃ', 'ŋ', 'ɚ', 'ø']) {
      for (const k of POSE_KEYS) expect(Number.isFinite(poseFor(ph)[k])).toBe(true)
    }
  })
  it('lowers the velum and opens the jaw line', () => {
    expect(palatePath(1)).not.toBe(palatePath(0))
    expect(jawPath(poseFor('ɑ'))).not.toBe(jawPath(poseFor('i')))
  })
})

describe('ipaPhones', () => {
  it('splits a dictionary transcription into drawable sounds', () => {
    expect(ipaPhones('/ˈkæt/')).toEqual(['k', 'æ', 't'])
    expect(ipaPhones('ˈbaʊndri')).toEqual(['b', 'aʊ', 'n', 'd', 'r', 'i'])
    expect(ipaPhones('tʃɪp')).toEqual(['tʃ', 'ɪ', 'p'])
  })
  it('drops tie bars, spaces and marks we cannot draw', () => {
    expect(ipaPhones('t͡ʃ iː')).toEqual(['tʃ', 'i'])
    expect(ipaPhones('')).toEqual([])
  })
})
