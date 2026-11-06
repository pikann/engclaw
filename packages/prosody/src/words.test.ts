import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeSegmentProsody, type TimedWord } from './index'

const SR = 16000

/** 16 kHz mono 16-bit WAV from tests/golden/audio. */
function golden(name: string): Float32Array {
  const b = readFileSync(new URL(`../../../tests/golden/audio/${name}.wav`, import.meta.url))
  const pcm = new Int16Array(
    b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)),
  )
  return Float32Array.from(pcm, (v) => v / 32768)
}

function join(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const silence = (seconds: number) => new Float32Array(Math.round(seconds * SR))
const seconds = (a: Float32Array) => a.length / SR

describe('pauses on golden audio', () => {
  const a = golden('bundled-developer')
  const b = golden('bundled-developer1')

  it('finds an inserted silence between two utterances with its length', () => {
    const audio = join(a, silence(0.6), b)
    const words: TimedWord[] = [
      { text: 'one', start: 0.05, end: seconds(a) - 0.05 },
      { text: 'two', start: seconds(a) + 0.6 + 0.05, end: seconds(audio) - 0.05 },
    ]
    const { pauses } = analyzeSegmentProsody(audio, SR, words)
    expect(pauses).toHaveLength(1)
    expect(pauses[0]!.afterWordIndex).toBe(0)
    // the 0.6 s inserted plus the natural silence at the edges of both clips
    expect(pauses[0]!.duration).toBeGreaterThanOrEqual(0.55)
    expect(pauses[0]!.duration).toBeLessThanOrEqual(0.9)
  })

  it('reports no pause for words that follow each other in continuous speech', () => {
    const d = seconds(a)
    const words = [0, 1, 2, 3].map((i) => ({
      text: 'word',
      start: (d * i) / 4 + 0.02,
      end: (d * (i + 1)) / 4 - 0.02,
    }))
    expect(analyzeSegmentProsody(a, SR, words).pauses).toEqual([])
  })

  it('drops an alignment gap the audio does not confirm as silence', () => {
    const d = seconds(a)
    const words: TimedWord[] = [
      { text: 'one', start: 0.1, end: d / 2 - 0.3 },
      { text: 'two', start: d / 2 + 0.3, end: d - 0.1 },
    ]
    expect(analyzeSegmentProsody(a, SR, words).pauses).toEqual([])
  })

  it('ignores gaps shorter than the pause threshold', () => {
    const audio = join(a, silence(0.1), b)
    const words: TimedWord[] = [
      { text: 'one', start: 0.05, end: seconds(a) },
      { text: 'two', start: seconds(a) + 0.1, end: seconds(audio) - 0.05 },
    ]
    expect(analyzeSegmentProsody(audio, SR, words).pauses).toEqual([])
  })
})

describe('word timing', () => {
  it('keeps the aligned times in order, in seconds, rounded to milliseconds', () => {
    const a = golden('bundled-developer')
    const words: TimedWord[] = [
      { text: 'the', start: 0.1234, end: 0.5 },
      { text: 'stale', start: 0.6, end: 1.0 },
    ]
    const out = analyzeSegmentProsody(a, SR, words).words
    expect(out.map((w) => [w.text, w.start, w.end])).toEqual([
      ['the', 0.123, 0.5],
      ['stale', 0.6, 1],
    ])
  })

  it('returns nothing for no words', () => {
    expect(analyzeSegmentProsody(golden('bundled-developer'), SR, [])).toEqual({
      words: [],
      pauses: [],
    })
  })
})

/** Voiced tone with a pitch glide and constant amplitude. */
function tone(sec: number, from: number, to: number, amp: number): Float32Array {
  const out = new Float32Array(Math.round(sec * SR))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * (from + ((to - from) * i) / out.length)) / SR
    out[i] = amp * Math.sin(phase)
  }
  return out
}

describe('pitch and stress', () => {
  it('labels rising, falling and flat words and gives a contour in semitones', () => {
    const audio = join(tone(0.5, 120, 200, 0.3), tone(0.5, 200, 120, 0.3), tone(0.5, 150, 150, 0.3))
    const words = [0, 1, 2].map((i) => ({ text: 'ab', start: i * 0.5 + 0.05, end: i * 0.5 + 0.45 }))
    const [up, down, flat] = analyzeSegmentProsody(audio, SR, words).words
    expect(up!.pitch.direction).toBe('rising')
    expect(down!.pitch.direction).toBe('falling')
    expect(flat!.pitch.direction).toBe('flat')
    expect(up!.pitch.contour).toHaveLength(5)
    expect(up!.pitch.contour[4]!).toBeGreaterThan(up!.pitch.contour[0]! + 3)
  })

  it('gives unvoiced words an empty contour', () => {
    const out = analyzeSegmentProsody(silence(0.5), SR, [
      { text: 'sh', start: 0.05, end: 0.45 },
    ]).words
    expect(out[0]!.pitch.contour).toEqual([])
  })

  it('flags the loud, long, high word as stressed and few others', () => {
    const audio = join(
      tone(0.3, 140, 140, 0.05),
      tone(0.3, 140, 140, 0.05),
      tone(0.6, 190, 190, 0.5),
      tone(0.3, 140, 140, 0.05),
      tone(0.3, 140, 140, 0.05),
    )
    const edges = [0, 0.3, 0.6, 1.2, 1.5, 1.8]
    const words = edges.slice(0, -1).map((s, i) => ({
      text: 'word',
      start: s + 0.02,
      end: edges[i + 1]! - 0.02,
    }))
    const out = analyzeSegmentProsody(audio, SR, words).words
    expect(out.map((w) => w.stressed)).toEqual([false, false, true, false, false])
  })

  it('flags no word when there are fewer than three', () => {
    const audio = join(tone(0.4, 140, 140, 0.05), tone(0.4, 190, 190, 0.5))
    const words = [
      { text: 'a', start: 0, end: 0.4 },
      { text: 'b', start: 0.4, end: 0.8 },
    ]
    expect(analyzeSegmentProsody(audio, SR, words).words.some((w) => w.stressed)).toBe(false)
  })
})
