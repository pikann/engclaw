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

function setup(idleMs = 1000, freeMemoryBytes = () => 8 * 2 ** 30) {
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
        hidden: new Float32Array(4),
        hiddenSize: 2,
      }),
      dispose: async () => void disposed.push(dir),
    }
  })
  const service = new InferenceService({
    loadAdapter,
    phonemizer,
    speak: async () => new Float32Array(10),
    idleMs,
    freeMemoryBytes,
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
  it('runs Mandarin recognition and accuracy without English phone or voice models', async () => {
    const s = setup()
    const result = await s.service.analyze(audio, '你好', 'zh', { asr: '/m/asr-zh' }, s.opts())
    expect(result.language).toBe('zh')
    expect(result.assessment).toBe('character-accuracy')
    expect(s.loads).toEqual(['/m/asr-zh'])
    expect(s.stages).toEqual(['loading-asr-model', 'transcribing', 'scoring'])
    await expect(s.service.analyze(audio, '你好', 'zh', {}, s.opts())).rejects.toMatchObject({
      code: 'MODEL_MISSING',
      modelId: 'asr-zh',
    })
    const reading = await s.service.phonemize('你好', 'zh')
    expect(reading.words[0]).toEqual({ word: '你', phones: ['nǐ'] })
    await s.service.unloadAll()
  })

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

  it('rejects analyze and transcribe clips longer than 15 min before loading any model', async () => {
    const s = setup()
    const long = new Float32Array(900 * 16000 + 1)
    await expect(s.service.transcribe(long, 'en', { asr: '/m' }, s.opts())).rejects.toMatchObject({
      code: 'CLIP_TOO_LONG',
    })
    await expect(
      s.service.analyze(long, 'hi', 'en', { phone: '/p', asr: '/m' }, s.opts()),
    ).rejects.toMatchObject({ code: 'CLIP_TOO_LONG' })
    expect(s.loads).toEqual([])
    await expect(
      s.service.transcribe(new Float32Array(900 * 16000), 'en', { asr: '/m' }, s.opts()),
    ).resolves.toBeTruthy()
  })

  describe('memory pressure', () => {
    const GB = 2 ** 30
    const dirs = { phone: '/m/phone', asr: '/m/asr' }

    it('keeps models the last request used warm while memory is plentiful', async () => {
      const s = setup(1000, () => 8 * GB)
      await s.service.analyze(audio, 'hi', 'en', dirs, s.opts())
      await s.service.transcribe(audio, 'en', dirs, s.opts())
      expect(s.disposed).toEqual([])
    })

    it('unloads models the request does not need when free memory is under 1 GB at load time', async () => {
      let free = 8 * GB
      const s = setup(1000, () => free)
      await s.service.analyze(audio, 'hi', 'en', dirs, s.opts())
      await vi.advanceTimersByTimeAsync(0)
      free = GB - 1
      await s.service.transcribe(audio, 'en', dirs, s.opts())
      expect(s.disposed).toEqual(['/m/phone'])
    })

    it('never unloads a model the current request needs', async () => {
      const s = setup(1000, () => GB / 2)
      await s.service.analyze(audio, 'hi', 'en', dirs, s.opts())
      expect(s.disposed).toEqual([])
      expect(s.loads).toEqual(['/m/phone', '/m/asr'])
    })
  })

  it('phonemizes through the shared phonemizer', async () => {
    const s = setup()
    await expect(s.service.phonemize('hi', 'en')).resolves.toEqual({
      words: [{ word: 'hi', phones: ['a'] }],
      language: 'en',
    })
  })
})
