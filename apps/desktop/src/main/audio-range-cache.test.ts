import { mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { YouTubeAdapter } from '@engclaw/youtube'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioRangeCache } from './audio-range-cache'
import { openStore } from './store'
import { CachedYouTube } from './youtube-cache'

const ID = 'dQw4w9WgXcQ'
const range = (n: number, fill = 1) => ({
  bytes: new Uint8Array(n).fill(fill),
  mime: 'audio/mp4',
  offsetSec: 1.5,
})

describe('AudioRangeCache', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engclaw-audio-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips a range and misses on other ranges', async () => {
    const cache = new AudioRangeCache(join(dir, 'c'), 1000)
    await cache.put(ID, 1, 2, range(10, 7))
    expect(await cache.get(ID, 1, 2)).toEqual(range(10, 7))
    expect(await cache.get(ID, 1, 3)).toBeNull()
  })

  it('evicts the least recently used entries once over the cap', async () => {
    const cache = new AudioRangeCache(dir, 250)
    await cache.put(ID, 0, 1, range(100))
    await cache.put(ID, 1, 2, range(100))
    const old = new Date(Date.now() - 60_000)
    utimesSync(join(dir, `${ID}_0_1000.audio`), old, old)
    await cache.get(ID, 1, 2)
    await cache.put(ID, 2, 3, range(100))
    expect(await cache.get(ID, 0, 1)).toBeNull()
    expect(await cache.get(ID, 1, 2)).not.toBeNull()
    expect(await cache.get(ID, 2, 3)).not.toBeNull()
  })

  it('skips entries larger than the whole cap', async () => {
    const cache = new AudioRangeCache(dir, 50)
    await cache.put(ID, 0, 1, range(100))
    expect(await cache.get(ID, 0, 1)).toBeNull()
  })

  it('CachedYouTube fetches a range once, then serves it from disk', async () => {
    const store = openStore(join(dir, 'e.db'))
    const audioRange = vi.fn(async () => range(10))
    const adapter = { meta: vi.fn(), transcript: vi.fn(), audioRange } as unknown as YouTubeAdapter
    const yt = new CachedYouTube(adapter, store.videos, new AudioRangeCache(join(dir, 'a'), 1000))
    await yt.audioRange(ID, 1, 2)
    expect(await yt.audioRange(ID, 1, 2)).toEqual(range(10))
    expect(audioRange).toHaveBeenCalledTimes(1)
    store.db.close()
  })

  it('CachedYouTube shares one fetch between concurrent requests for a range', async () => {
    const store = openStore(join(dir, 'f.db'))
    const audioRange = vi.fn(async () => range(10))
    const adapter = { meta: vi.fn(), transcript: vi.fn(), audioRange } as unknown as YouTubeAdapter
    const yt = new CachedYouTube(adapter, store.videos, new AudioRangeCache(join(dir, 'b'), 1000))
    const both = await Promise.all([yt.audioRange(ID, 1, 2), yt.audioRange(ID, 1, 2)])
    expect(both[1]).toEqual(range(10))
    expect(audioRange).toHaveBeenCalledTimes(1)
    store.db.close()
  })

  it('never serves a half-written entry to a concurrent reader', async () => {
    const cache = new AudioRangeCache(dir, 10_000_000)
    const big = range(2_000_000)
    const writing = cache.put(ID, 5, 6, big)
    for (let i = 0; i < 50; i++) {
      const hit = await cache.get(ID, 5, 6)
      if (hit) expect(hit.bytes.length).toBe(2_000_000)
    }
    await writing
    expect((await cache.get(ID, 5, 6))?.bytes.length).toBe(2_000_000)
  })
})
