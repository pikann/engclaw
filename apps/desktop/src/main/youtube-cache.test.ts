import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { YouTubeError, type YouTubeAdapter } from '@engclaw/youtube'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openStore, type Store } from './store'
import { CachedYouTube } from './youtube-cache'

const ID = 'dQw4w9WgXcQ'
const META = {
  videoId: ID,
  title: 'A video',
  durationSec: 60,
  captionTracks: [{ lang: 'en', auto: false }],
}
const CUES = [{ start: 0, dur: 2, text: 'Hello.' }]

function fakeAdapter(over: Partial<YouTubeAdapter> = {}) {
  const adapter = {
    meta: vi.fn(async () => META),
    transcript: vi.fn(async () => CUES),
    audioRange: vi.fn(),
    ...over,
  }
  return adapter as typeof adapter & YouTubeAdapter
}

describe('CachedYouTube', () => {
  let dir: string
  let store: Store
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engclaw-ytcache-'))
    store = openStore(join(dir, 'engclaw.db'))
  })
  afterEach(() => {
    store.db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stores generated Mandarin transcripts as a reusable caption track', async () => {
    const adapter = fakeAdapter()
    const yt = new CachedYouTube(adapter, store.videos)
    await yt.meta(ID)
    yt.saveGeneratedTranscript(ID, 'zh', CUES)
    expect((await yt.meta(ID)).captionTracks).toContainEqual({
      lang: 'zh-x-engclaw-asr',
      auto: true,
    })
    expect(await yt.transcript(ID, 'zh-x-engclaw-asr')).toEqual(CUES)
    expect(adapter.transcript).not.toHaveBeenCalled()
    expect(() =>
      yt.saveGeneratedTranscript(ID, 'zh', [{ start: 59, dur: 10, text: 'too long' }]),
    ).toThrow('timing')
  })

  it('fetches once, then serves meta and transcript from SQLite without the adapter', async () => {
    const adapter = fakeAdapter()
    const yt = new CachedYouTube(adapter, store.videos)
    expect(await yt.meta(ID)).toEqual(META)
    expect(await yt.transcript(ID, 'en')).toEqual(CUES)

    const offline = fakeAdapter({
      meta: vi.fn(async () => {
        throw new YouTubeError('NETWORK', 'offline')
      }),
      transcript: vi.fn(async () => {
        throw new YouTubeError('NETWORK', 'offline')
      }),
    })
    const again = new CachedYouTube(offline, store.videos)
    expect(await again.meta(ID)).toEqual(META)
    expect(await again.transcript(ID, 'en')).toEqual(CUES)
    expect(offline.meta).not.toHaveBeenCalled()
    expect(offline.transcript).not.toHaveBeenCalled()
  })

  it('does not cache failures', async () => {
    const adapter = fakeAdapter({
      transcript: vi
        .fn()
        .mockRejectedValueOnce(new YouTubeError('NETWORK', 'down'))
        .mockResolvedValue(CUES),
    })
    const yt = new CachedYouTube(adapter, store.videos)
    await expect(yt.transcript(ID, 'en')).rejects.toMatchObject({ code: 'NETWORK' })
    expect(await yt.transcript(ID, 'en')).toEqual(CUES)
    expect(adapter.transcript).toHaveBeenCalledTimes(2)
  })

  it('keeps transcripts per language', async () => {
    const adapter = fakeAdapter()
    const yt = new CachedYouTube(adapter, store.videos)
    await yt.transcript(ID, 'en')
    await yt.transcript(ID, 'en-US')
    expect(adapter.transcript).toHaveBeenCalledTimes(2)
  })

  it('lists a video as recent only once its transcript was loaded', async () => {
    const yt = new CachedYouTube(fakeAdapter(), store.videos)
    await yt.meta(ID)
    expect(yt.recent()).toEqual([])
    await yt.transcript(ID, 'en')
    expect(yt.recent()).toMatchObject([{ videoId: ID, title: 'A video' }])
  })

  it('moves a reopened cached video to the top of recent', async () => {
    let t = 1
    const clocked = new (store.videos.constructor as new (...a: unknown[]) => typeof store.videos)(
      store.db,
      () => t++,
    )
    const other = { ...META, videoId: 'aaaaaaaaaaa', title: 'Other' }
    const adapter = fakeAdapter({ meta: vi.fn(async (id: string) => (id === ID ? META : other)) })
    const yt = new CachedYouTube(adapter, clocked)
    for (const id of [ID, 'aaaaaaaaaaa']) {
      await yt.meta(id)
      await yt.transcript(id, 'en')
    }
    expect(yt.recent().map((r) => r.videoId)).toEqual(['aaaaaaaaaaa', ID])
    await yt.transcript(ID, 'en')
    expect(yt.recent().map((r) => r.videoId)).toEqual([ID, 'aaaaaaaaaaa'])
  })
})
