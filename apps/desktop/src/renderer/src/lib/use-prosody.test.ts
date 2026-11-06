import { describe, expect, it, vi } from 'vitest'
import type { SegmentProsody } from '@engclaw/ipc-contract'
import { loadSegmentProsody, prefetchOrder, prefetchProsody, type ProsodyApi } from './use-prosody'

const value: SegmentProsody = { words: [], pauses: [] }
const segment = { start: 1, end: 3, text: 'Hello there' }

function setup(over: { cached?: SegmentProsody | null; range?: boolean; analysis?: boolean } = {}) {
  const prosody = vi.fn(async (r: { cachedOnly?: boolean }) =>
    r.cachedOnly
      ? { ok: true as const, value: over.cached ?? null }
      : over.analysis === false
        ? ({ ok: false } as never)
        : { ok: true as const, value },
  )
  const audioRange = vi.fn(async () =>
    over.range === false
      ? ({ ok: false } as const)
      : ({ ok: true, value: { bytes: new Uint8Array(1), offsetSec: 0 } } as const),
  )
  const api = { youtube: { prosody, audioRange } } as unknown as ProsodyApi
  const decode = vi.fn(async () => new Float32Array(16000))
  const onLoading = vi.fn()
  return { prosody, audioRange, decode, onLoading, deps: { api, decode } }
}

describe('loadSegmentProsody', () => {
  it('serves a cached segment without a loading step or any audio work', async () => {
    const s = setup({ cached: value })
    expect(await loadSegmentProsody(s.deps, 'v', segment, true, s.onLoading)).toEqual({
      status: 'ready',
      value,
    })
    expect(s.onLoading).not.toHaveBeenCalled()
    expect(s.audioRange).not.toHaveBeenCalled()
  })

  it('does not analyse an uncached segment while the guide is off', async () => {
    const s = setup()
    expect(await loadSegmentProsody(s.deps, 'v', segment, false, s.onLoading)).toEqual({
      status: 'idle',
    })
    expect(s.audioRange).not.toHaveBeenCalled()
    expect(s.prosody).toHaveBeenCalledTimes(1)
  })

  it('analyses an uncached segment from its own audio when the guide is on', async () => {
    const s = setup()
    expect(await loadSegmentProsody(s.deps, 'v', segment, true, s.onLoading)).toEqual({
      status: 'ready',
      value,
    })
    expect(s.onLoading).toHaveBeenCalledOnce()
    expect(s.decode).toHaveBeenCalledWith(expect.any(Uint8Array), 0, 1, 3)
    expect(s.prosody).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: expect.any(Float32Array), text: 'Hello there' }),
    )
  })

  it('reports an error when the audio or the analysis fails', async () => {
    expect(await loadSegmentProsody(setup({ range: false }).deps, 'v', segment, true)).toEqual({
      status: 'error',
    })
    expect(await loadSegmentProsody(setup({ analysis: false }).deps, 'v', segment, true)).toEqual({
      status: 'error',
    })
  })
})

describe('prefetchProsody', () => {
  const segs = [0, 1, 2].map((i) => ({ start: i, end: i + 1, text: `s${i}` }))

  it('orders segments from the current one onwards, then wraps', () => {
    expect(prefetchOrder([0, 1, 2, 3], 2)).toEqual([2, 3, 0, 1])
    expect(prefetchOrder([0, 1], 9)).toEqual([0, 1])
  })

  it('analyses every segment in turn and skips one that fails', async () => {
    const s = setup({ range: true })
    s.audioRange.mockResolvedValueOnce({ ok: false } as never)
    const sleep = vi.fn(async () => undefined)
    await prefetchProsody(s.deps, 'v', segs, () => true, sleep)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(s.audioRange).toHaveBeenCalledTimes(3)
    expect(s.decode).toHaveBeenCalledTimes(2)
  })

  it('stops as soon as it is no longer live', async () => {
    const s = setup()
    let live = true
    s.audioRange.mockImplementationOnce(async () => {
      live = false
      return { ok: true, value: { bytes: new Uint8Array(1), offsetSec: 0 } } as const
    })
    await prefetchProsody(s.deps, 'v', segs, () => live)
    expect(s.audioRange).toHaveBeenCalledTimes(1)
  })
})
