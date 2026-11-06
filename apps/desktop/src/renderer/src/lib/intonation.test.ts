import { describe, expect, it, vi } from 'vitest'
import type { IntonationResult } from '@engclaw/ipc-contract'
import { accuracyScore, checkIntonation, type IntonationApi } from './intonation'

const result = { score: 80 } as IntonationResult
const seg = { start: 1, end: 3, text: ' Hello there. ' }
const audio = new Float32Array(16000)

function api(over: {
  has?: boolean
  range?: Awaited<ReturnType<IntonationApi['youtube']['audioRange']>>
  speak?: Awaited<ReturnType<IntonationApi['tts']['speak']>>
  intonation?: Awaited<ReturnType<IntonationApi['inference']['intonation']>>
}) {
  const intonation = vi.fn<IntonationApi['inference']['intonation']>(
    async () => over.intonation ?? { ok: true, value: result },
  )
  const speak = vi.fn(async () => over.speak ?? { ok: true as const, samples: new Float32Array(8) })
  const audioRange = vi.fn(
    async () =>
      over.range ?? { ok: true as const, value: { bytes: new Uint8Array(4), offsetSec: 0 } },
  )
  const a: IntonationApi = {
    contours: { has: async () => over.has ?? false },
    youtube: { audioRange },
    tts: { speak },
    inference: { intonation },
  }
  return { a, intonation, speak, audioRange }
}
const decode = async () => new Float32Array(32000)

describe('checkIntonation', () => {
  it('uses the cached contour without fetching audio', async () => {
    const { a, intonation, audioRange } = api({ has: true })
    const r = await checkIntonation({ api: a, decode }, 'r', 'vid', seg, audio)
    expect(r).toEqual({ status: 'done', result, fallback: false })
    expect(audioRange).not.toHaveBeenCalled()
    expect(intonation.mock.calls[0]![0].reference).toEqual({ cached: true })
  })

  it('fetches and decodes the segment audio on a cache miss and asks main to cache it', async () => {
    const { a, intonation } = api({})
    const r = await checkIntonation({ api: a, decode }, 'r', 'vid', seg, audio)
    expect(r).toMatchObject({ status: 'done', fallback: false })
    const req = intonation.mock.calls[0]![0]
    expect(req.reference).toHaveProperty('audio')
    expect(req.cacheKey).toEqual({ videoId: 'vid', start: 1, end: 3 })
  })

  it.each([
    ['the audio fetch fails', { range: { ok: false as const } }],
    ['decoding throws', {}],
  ])('falls back to the TTS reference (uncached, flagged) when %s', async (_n, over) => {
    const { a, intonation, speak } = api(over)
    const failingDecode = async () => {
      throw new Error('EncodingError')
    }
    const r = await checkIntonation(
      { api: a, decode: 'range' in over ? decode : failingDecode },
      'r',
      'vid',
      seg,
      audio,
    )
    expect(r).toMatchObject({ status: 'done', fallback: true })
    expect(speak).toHaveBeenCalledWith({ text: 'Hello there.' })
    const last = intonation.mock.calls.at(-1)![0]
    expect(last.cacheKey).toBeUndefined()
  })

  it('fails when neither the video nor the TTS reference is available', async () => {
    const { a } = api({ range: { ok: false }, speak: { ok: false } })
    expect(await checkIntonation({ api: a, decode }, 'r', 'vid', seg, audio)).toEqual({
      status: 'failed',
    })
  })
})

describe('accuracyScore', () => {
  it('is 100 minus the word error rate, clamped to 0-100', () => {
    expect(accuracyScore(0)).toBe(100)
    expect(accuracyScore(0.5)).toBe(50)
    expect(accuracyScore(1.4)).toBe(0)
  })
})
