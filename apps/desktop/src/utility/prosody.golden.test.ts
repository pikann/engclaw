import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { forcedAlignWords, logSoftmax, parseVocab } from '@engclaw/pronounce'
import { analyzeSegmentProsody, type SegmentProsody } from '@engclaw/prosody'

/**
 * Forced alignment + prosody on the golden reference audio. The wav2vec2-large-960h logits were dumped
 * once with tests/golden/logits.py (`--name asr-en`), so no model runs here.
 */
const SR = 16000
const root = new URL('../../../../tests/golden/', import.meta.url)

function wav(name: string): Float32Array {
  const b = readFileSync(new URL(`audio/${name}.wav`, root))
  const pcm = new Int16Array(
    b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)),
  )
  return Float32Array.from(pcm, (v) => v / 32768)
}

function analyze(name: string): { audio: Float32Array; result: SegmentProsody } {
  const g = JSON.parse(readFileSync(new URL(`logits/asr-en-${name}.json`, root), 'utf8')) as {
    vocab: Record<string, number>
    frames: number
    logits: number[][]
  }
  const text = (
    JSON.parse(readFileSync(new URL(`cases/${name}.json`, root), 'utf8')) as { text: string }
  ).text
  const vocab = parseVocab(g.vocab)
  const logProbs = logSoftmax(Float32Array.from(g.logits.flat()), g.frames, vocab.tokens.length)
  const audio = wav(name)
  const words = text.split(/\s+/).filter(Boolean)
  const spans = forcedAlignWords(logProbs, g.frames, vocab, words)
  const frameSec = audio.length / SR / g.frames
  const timed = words.flatMap((w, i) =>
    spans[i] ? [{ text: w, start: spans[i]!.start * frameSec, end: spans[i]!.end * frameSec }] : [],
  )
  return { audio, result: analyzeSegmentProsody(audio, SR, timed) }
}

/** First and last 10 ms frame louder than 5% of the loudest frame: where the speech really is. */
function speechBounds(audio: Float32Array): { onset: number; offset: number } {
  const hop = SR / 100
  const rms: number[] = []
  for (let i = 0; i + hop <= audio.length; i += hop) {
    let s = 0
    for (let j = i; j < i + hop; j++) s += audio[j]! * audio[j]!
    rms.push(Math.sqrt(s / hop))
  }
  const gate = Math.max(...rms) * 0.05
  return {
    onset: rms.findIndex((v) => v > gate) / 100,
    offset: (rms.map((v) => v > gate).lastIndexOf(true) + 1) / 100,
  }
}

describe('golden prosody (bundled-harvard, six sentences read with gaps)', () => {
  const { audio, result } = analyze('bundled-harvard')
  // Last word of each sentence: lingers, odour, zest, ham, favorite.
  const sentenceEnds = [6, 14, 21, 28, 34]

  it('finds a pause after every sentence and nowhere else', () => {
    expect(result.pauses.map((p) => p.afterWordIndex)).toEqual(sentenceEnds)
    for (const p of result.pauses) expect(p.duration).toBeGreaterThan(0.3)
  })

  it('times words in order, inside the speech, within 0.15 s of the audio onset and offset', () => {
    const { onset, offset } = speechBounds(audio)
    const w = result.words
    expect(w).toHaveLength(43)
    for (let i = 0; i < w.length; i++) {
      expect(w[i]!.end).toBeGreaterThan(w[i]!.start)
      if (i) expect(w[i]!.start).toBeGreaterThanOrEqual(w[i - 1]!.end)
    }
    expect(Math.abs(w[0]!.start - onset)).toBeLessThan(0.15)
    expect(Math.abs(offset - w[w.length - 1]!.end)).toBeLessThan(0.15)
  })

  // CTC spans stop at a word's last emitted character, so the audible end can run ~0.2 s past `end`.
  it('puts the pauses over real silence', () => {
    const w = result.words
    let loudest = 0
    for (const v of audio) loudest = Math.max(loudest, Math.abs(v))
    for (const p of result.pauses) {
      const from = Math.floor((w[p.afterWordIndex]!.end + 0.25) * SR)
      const to = Math.floor((w[p.afterWordIndex + 1]!.start - 0.05) * SR)
      let peak = 0
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(audio[i]!))
      expect(peak, `after word ${p.afterWordIndex}`).toBeLessThan(loudest * 0.15)
    }
  })

  it('flags a minority of words as stressed and gives voiced words a 5-point contour', () => {
    const stressed = result.words.filter((w) => w.stressed).length
    expect(stressed).toBeGreaterThan(0)
    expect(stressed / result.words.length).toBeLessThanOrEqual(0.35)
    const voiced = result.words.filter((w) => w.pitch.contour.length)
    expect(voiced.length).toBeGreaterThan(result.words.length * 0.4)
    for (const w of voiced) expect(w.pitch.contour).toHaveLength(5)
  })
})

describe('golden prosody (bundled-developer, one short sentence)', () => {
  const { result } = analyze('bundled-developer')

  it('has no pause and keeps the word order', () => {
    expect(result.pauses).toEqual([])
    expect(result.words.map((w) => w.text)).toEqual(['hello', 'I', 'am', 'a', 'developer'])
  })

  it('times "developer" last and about half a second long', () => {
    const d = result.words[4]!
    expect(d.end - d.start).toBeGreaterThan(0.3)
    expect(d.end - d.start).toBeLessThan(0.8)
  })
})
