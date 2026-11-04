import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Phonemizer } from '@engclaw/pronounce'
import { InferenceService, type CallOptions } from './inference'
import type { ModelAdapter } from './model-adapter'

const phonemizer: Phonemizer = {
  getExpectedPhones: async () => [],
  getPhonemesWithWordMapping: async (t) => [{ word: t, phones: ['a'] }],
  dispose: () => undefined,
}
const textVocab = { tokens: ['<pad>', 'H', 'I'], blankId: 0 }

function setup(idleMs = 1000) {
  const loads: string[] = []
  const disposed: string[] = []
  const loadAdapter = vi.fn(async (dir: string): Promise<ModelAdapter> => {
    loads.push(dir)
    return {
      vocab: textVocab,
      sampleRate: 16000,
      frameSeconds: 0.02,
      run: async () => ({
        logits: Float32Array.from([-5, 5, -5, -5, -5, 5]),
        frames: 2,
        vocabSize: 3,
      }),
      dispose: async () => void disposed.push(dir),
    }
  })
  const service = new InferenceService({
    loadAdapter,
    phonemizer,
    speak: async () => new Float32Array(10),
    idleMs,
  })
  const stages: string[] = []
  const opts = (signal = new AbortController().signal): CallOptions => ({
    signal,
    onStage: (s) => stages.push(s),
  })
  return { service, loads, disposed, loadAdapter, stages, opts }
}
const audio = new Float32Array(16000)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('InferenceService', () => {
  it('loads a model lazily, reports the loading stage, and reuses it', async () => {
    const s = setup()
    expect(s.loads).toEqual([])
    const a = await s.service.transcribe(audio, 'en', { asr: '/m/asr' }, s.opts())
    expect(a).toEqual({ text: 'HI', language: 'en' })
    expect(s.stages).toEqual(['loading-asr-model', 'transcribing'])
    await s.service.transcribe(audio, undefined, { asr: '/m/asr' }, s.opts())
    expect(s.loads).toEqual(['/m/asr'])
  })

  it('reports a missing model with its catalog id', async () => {
    const s = setup()
    await expect(s.service.transcribe(audio, 'en', {}, s.opts())).rejects.toMatchObject({
      code: 'MODEL_MISSING',
      modelId: 'asr-en',
    })
  })

  it('rejects unsupported languages', async () => {
    const s = setup()
    await expect(s.service.transcribe(audio, 'xx', { asr: '/m' }, s.opts())).rejects.toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE',
    })
    await expect(s.service.phonemize('hi', 'xx')).rejects.toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE',
    })
  })

  it('unloads models after the idle period and reloads on demand', async () => {
    const s = setup(1000)
    await s.service.transcribe(audio, 'en', { asr: '/m/asr' }, s.opts())
    await vi.advanceTimersByTimeAsync(1001)
    expect(s.disposed).toEqual(['/m/asr'])
    await s.service.transcribe(audio, 'en', { asr: '/m/asr' }, s.opts())
    expect(s.loads).toEqual(['/m/asr', '/m/asr'])
  })

  it('swaps to a new model revision, releasing the old one', async () => {
    const s = setup()
    await s.service.transcribe(audio, 'en', { asr: '/m/asr/rev1' }, s.opts())
    await s.service.transcribe(audio, 'en', { asr: '/m/asr/rev2' }, s.opts())
    expect(s.disposed).toEqual(['/m/asr/rev1'])
    expect(s.loads).toEqual(['/m/asr/rev1', '/m/asr/rev2'])
  })

  it('retries after a failed load instead of caching the failure', async () => {
    const s = setup()
    s.loadAdapter.mockRejectedValueOnce(new Error('disk read failed'))
    await expect(s.service.transcribe(audio, 'en', { asr: '/m' }, s.opts())).rejects.toThrow(
      'disk read failed',
    )
    await expect(s.service.transcribe(audio, 'en', { asr: '/m' }, s.opts())).resolves.toBeTruthy()
  })

  it('cancels a request that has not started yet and one aborted mid-flight', async () => {
    const s = setup()
    const ac = new AbortController()
    ac.abort()
    await expect(
      s.service.transcribe(audio, 'en', { asr: '/m' }, s.opts(ac.signal)),
    ).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(s.loads).toEqual([])
  })

  it('runs requests one at a time', async () => {
    const s = setup()
    let running = 0
    let peak = 0
    s.loadAdapter.mockImplementation(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return {
        vocab: textVocab,
        sampleRate: 16000,
        frameSeconds: 0.02,
        run: async () => ({ logits: new Float32Array(6), frames: 2, vocabSize: 3 }),
        dispose: async () => undefined,
      }
    })
    const p = [
      s.service.transcribe(audio, 'en', { asr: '/a' }, s.opts()),
      s.service.transcribe(audio, 'en', { asr: '/b' }, s.opts()),
    ]
    await vi.advanceTimersByTimeAsync(50)
    await Promise.all(p)
    expect(peak).toBe(1)
  })

  it('phonemizes through the shared phonemizer', async () => {
    const s = setup()
    await expect(s.service.phonemize('hi', 'en')).resolves.toEqual({
      words: [{ word: 'hi', phones: ['a'] }],
      language: 'en',
    })
  })
})
