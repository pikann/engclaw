import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PronunciationResult } from '@engclaw/ipc-contract'
import { CachedPhonemizer, type PhonemizeBackend } from '@engclaw/pronounce'
import { analyzeRecording, type Control } from './analyze'
import { InferenceError } from './errors'
import type { ModelAdapter, ModelOutput } from './model-adapter'

const ctl: Control = { stage: () => undefined, check: () => undefined }

// A tiny espeak: letter-per-phone, so word phones are predictable without the binary.
const backend: PhonemizeBackend = {
  phonemize: async (lines) =>
    lines.map((l) =>
      l
        .split(' ')
        .map((w) => [...w].join('_'))
        .join(' '),
    ),
}

const tokens = ['<pad>', 'h', 'i']
/** A CTC "recording" that says the given token ids, 3 frames each, with high posteriors. */
function speaking(ids: number[], hidden?: { size: number; value: number }): ModelOutput {
  const frames = ids.length * 3
  const logits = new Float32Array(frames * tokens.length).fill(-8)
  ids.forEach((id, i) => {
    for (let f = 0; f < 3; f++) logits[(i * 3 + f) * tokens.length + id] = 8
  })
  return {
    logits,
    frames,
    vocabSize: tokens.length,
    ...(hidden
      ? {
          hidden: new Float32Array(frames * hidden.size).fill(hidden.value),
          hiddenSize: hidden.size,
        }
      : {}),
  }
}
const adapter = (run: (s: Float32Array) => ModelOutput, vocabTokens = tokens): ModelAdapter => ({
  vocab: { tokens: vocabTokens, blankId: 0 },
  sampleRate: 16000,
  frameSeconds: 0.02,
  run: async (s) => run(s),
  dispose: async () => undefined,
})

const audio = new Float32Array(16000).map((_, i) => Math.sin(i / 20))

describe('analyzeRecording', () => {
  it('produces an OpenPronounce-shaped result for a correct reading', async () => {
    const asrTokens = ['<pad>', 'H', 'I', '|']
    const asrOut = (): ModelOutput => {
      const ids = [1, 2]
      const logits = new Float32Array(ids.length * 3 * 4).fill(-8)
      ids.forEach((id, i) => {
        for (let f = 0; f < 3; f++) logits[(i * 3 + f) * 4 + id] = 8
      })
      return {
        logits,
        frames: 6,
        vocabSize: 4,
        hidden: new Float32Array(6 * 2).fill(1),
        hiddenSize: 2,
      }
    }
    const result = await analyzeRecording(
      {
        phone: adapter(() => speaking([1, 2])),
        asr: adapter(asrOut, asrTokens),
        phonemizer: new CachedPhonemizer(backend),
        reference: async () => audio,
      },
      audio,
      'hi',
      'en',
      ctl,
    )
    expect(() => PronunciationResult.parse(result)).not.toThrow()
    expect(result.differences.expected_phones).toEqual([['h', 'i']])
    expect(result.differences.heard_phones).toEqual(['h', 'i'])
    expect(result.differences.phoneme_error_rate).toBe(0)
    expect(result.differences.words_with_errors).toEqual([])
    expect(result.transcribe).toBe('HI')
    expect(result.acoustic_distance).toBe(0)
    expect(result.score).toBe(100)
    expect(result.prosody.f0.length).toBeGreaterThan(0)
    expect(result.prosody.f0.length).toBe(result.prosody.energy.length)
  })

  it('flags a mispronounced word', async () => {
    const asrTokens = ['<pad>', 'H', 'A', '|']
    const asr = adapter(() => {
      const logits = new Float32Array(6 * 4).fill(-8)
      for (let f = 0; f < 3; f++) logits[f * 4 + 1] = 8
      for (let f = 3; f < 6; f++) logits[f * 4 + 2] = 8
      return { logits, frames: 6, vocabSize: 4, hidden: new Float32Array(12), hiddenSize: 2 }
    }, asrTokens)
    const result = await analyzeRecording(
      {
        phone: adapter(() => speaking([2, 1])),
        asr,
        phonemizer: new CachedPhonemizer(backend),
        reference: async () => audio,
      },
      audio,
      'hi',
      'en',
      ctl,
    )
    expect(result.differences.words_with_errors).toEqual(['hi'])
    expect(result.feedback).toEqual({ code: 'NEEDS_WORK', words: ['hi'] })
    expect(result.differences.errors[0]).toMatchObject({ word: 'hi', expected: 'hi' })
    expect(result.score).toBeLessThan(100)
  })

  it('stops between stages once cancelled', async () => {
    const stages: string[] = []
    const cancelling: Control = {
      stage: (s) => stages.push(s),
      check: () => {
        if (stages.includes('synthesizing')) throw new InferenceError('CANCELLED', 'cancelled')
      },
    }
    const never = adapter(() => {
      throw new Error('model must not run after cancel')
    })
    await expect(
      analyzeRecording(
        {
          phone: never,
          asr: never,
          phonemizer: new CachedPhonemizer(backend),
          reference: async () => audio,
        },
        audio,
        'hi',
        'en',
        cancelling,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('rejects text with no speakable words', async () => {
    await expect(
      analyzeRecording(
        {
          phone: adapter(() => speaking([])),
          asr: adapter(() => speaking([])),
          phonemizer: new CachedPhonemizer(backend),
          reference: async () => audio,
        },
        audio,
        '!!!',
        'en',
        ctl,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('golden vectors', () => {
  it('DTW-aligned codepoint vectors reproduce the Python reference', async () => {
    const { fastDtw, alignByPath } = await import('@engclaw/pronounce')
    for (const name of ['bundled-developer-error-an', 'bundled-developer-error-an-good']) {
      const g = JSON.parse(
        readFileSync(
          new URL(`../../../../tests/golden/cases/${name}.json`, import.meta.url),
          'utf8',
        ),
      ) as { result: { differences: Record<string, unknown> } }
      const d = g.result.differences as {
        expected_phonemes: string[]
        transcribed_phonemes: string[]
        expected_vector: number[]
        transcribed_vector: number[]
        phoneme_distance: number
      }
      const cp = (p: string[]) => Float32Array.from([...p.join(' ')].map((c) => c.codePointAt(0)!))
      const r = fastDtw(cp(d.expected_phonemes), cp(d.transcribed_phonemes), 1)
      const aligned = alignByPath(cp(d.expected_phonemes), cp(d.transcribed_phonemes), r.path)
      expect(r.distance).toBe(d.phoneme_distance)
      expect(aligned.a).toHaveLength(d.expected_vector.length)
      expect(aligned.b).toHaveLength(d.transcribed_vector.length)
      // Equal-cost paths can tie-break differently from Python's fastdtw; the distance and the
      // transcript side are exact, and one case is exact on both sides.
      expect(aligned.b).toEqual(d.transcribed_vector)
      if (name.endsWith('-good')) expect(aligned.a).toEqual(d.expected_vector)
    }
  })
})
