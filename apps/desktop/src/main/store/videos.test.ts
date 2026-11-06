import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openStore, type Store } from './index'
import { VideoStore } from './videos'

const meta = (videoId: string, over = {}) => ({
  videoId,
  title: `Title ${videoId}`,
  durationSec: 120,
  captionTracks: [{ lang: 'en', auto: false }],
  ...over,
})
const cues = [
  { start: 0, dur: 2, text: 'Hello.' },
  { start: 2, dur: 2, text: 'World.' },
]

describe('video cache', () => {
  let dir: string
  let store: Store
  const dbPath = () => join(dir, 'engclaw.db')
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engclaw-videos-'))
    store = openStore(dbPath())
  })
  afterEach(() => {
    store.db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null for videos and transcripts it has not seen', () => {
    expect(store.videos.getMeta('aaaaaaaaaaa')).toBeNull()
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'en')).toBeNull()
  })

  it('stores meta and transcript and keeps them across restarts', () => {
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putTranscript('aaaaaaaaaaa', 'en', cues)
    store.db.close()
    store = openStore(dbPath())
    expect(store.videos.getMeta('aaaaaaaaaaa')).toEqual(meta('aaaaaaaaaaa'))
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'en')).toEqual(cues)
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'vi')).toBeNull()
  })

  it('overwrites on re-fetch without losing when it was last opened', () => {
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putTranscript('aaaaaaaaaaa', 'en', cues)
    store.videos.touch('aaaaaaaaaaa')
    store.videos.putMeta(meta('aaaaaaaaaaa', { title: 'Renamed' }))
    expect(store.videos.getMeta('aaaaaaaaaaa')!.title).toBe('Renamed')
    expect(store.videos.recent()).toHaveLength(1)
  })

  it('lists only opened videos with a transcript, newest first', () => {
    let t = 1000
    const v = new VideoStore(store.db, () => t++)
    for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']) {
      v.putMeta(meta(id))
      v.putTranscript(id, 'en', cues)
    }
    v.putMeta(meta('ddddddddddd'))
    v.touch('aaaaaaaaaaa')
    v.touch('bbbbbbbbbbb')
    v.touch('ddddddddddd')
    v.touch('aaaaaaaaaaa')
    expect(v.recent().map((r) => r.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
    expect(v.recent(1)).toHaveLength(1)
    expect(v.recent()[0]).toMatchObject({ title: 'Title aaaaaaaaaaa', durationSec: 120 })
  })

  it('removes a video together with its transcripts', () => {
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putTranscript('aaaaaaaaaaa', 'en', cues)
    store.videos.remove('aaaaaaaaaaa')
    expect(store.videos.getMeta('aaaaaaaaaaa')).toBeNull()
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'en')).toBeNull()
  })

  it('ignores a corrupt cached row instead of throwing', () => {
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putTranscript('aaaaaaaaaaa', 'en', cues)
    store.db.prepare("UPDATE transcripts SET cues = '{oops'").run()
    store.db.prepare("UPDATE videos SET caption_tracks = '{oops'").run()
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'en')).toBeNull()
    expect(store.videos.getMeta('aaaaaaaaaaa')).toBeNull()
  })

  it('remembers practice settings per video across restarts and ignores corrupt rows', () => {
    const a = { speed: 0.75, repeat: 3, autoContinuePct: 150 }
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putMeta(meta('bbbbbbbbbbb'))
    expect(store.videos.getSettings('aaaaaaaaaaa')).toBeNull()
    store.videos.saveSettings('aaaaaaaaaaa', a)
    expect(store.videos.getSettings('aaaaaaaaaaa')).toEqual(a)
    expect(store.videos.getSettings('bbbbbbbbbbb')).toBeNull()
    store.db.close()
    store = openStore(dbPath())
    expect(store.videos.getSettings('aaaaaaaaaaa')).toEqual(a)
    store.db.prepare('UPDATE videos SET sentence_settings = \'{"speed":9}\'').run()
    expect(store.videos.getSettings('aaaaaaaaaaa')).toBeNull()
  })

  it('persists IPA per video and drops it with the video and on deleteAll', () => {
    const words = [{ word: 'hi', ipa: 'haɪ' }]
    expect(store.videos.getIpa('aaaaaaaaaaa', 'Hi')).toBeNull()
    store.videos.putIpa('aaaaaaaaaaa', 'Hi', words)
    store.videos.putIpa('bbbbbbbbbbb', 'Hi', words)
    expect(store.videos.getIpa('aaaaaaaaaaa', 'Hi')).toEqual(words)
    store.videos.remove('aaaaaaaaaaa')
    expect(store.videos.getIpa('aaaaaaaaaaa', 'Hi')).toBeNull()
    expect(store.videos.getIpa('bbbbbbbbbbb', 'Hi')).toEqual(words)
    store.deleteAll()
    expect(store.videos.getIpa('bbbbbbbbbbb', 'Hi')).toBeNull()
  })

  it('caches reference contours per video segment and drops them with the video and on deleteAll', () => {
    const c = { f0: [0, 120.5, 130], energy: [0, 100, 250], frameSec: 0.032 }
    expect(store.videos.getContour('aaaaaaaaaaa', 1.5, 4)).toBeNull()
    store.videos.putContour('aaaaaaaaaaa', 1.5, 4, c)
    store.videos.putContour('bbbbbbbbbbb', 1.5, 4, c)
    expect(store.videos.getContour('aaaaaaaaaaa', 1.5, 4)).toEqual(c)
    expect(store.videos.getContour('aaaaaaaaaaa', 1.5, 5)).toBeNull()
    store.db.prepare("UPDATE contours SET f0 = 'oops'").run()
    expect(store.videos.getContour('aaaaaaaaaaa', 1.5, 4)).toBeNull()
    store.videos.putContour('aaaaaaaaaaa', 1.5, 4, c)
    store.videos.remove('aaaaaaaaaaa')
    expect(store.videos.getContour('aaaaaaaaaaa', 1.5, 4)).toBeNull()
    store.deleteAll()
    expect(store.videos.getContour('bbbbbbbbbbb', 1.5, 4)).toBeNull()
  })

  it('deleteAll wipes cached videos too', () => {
    store.videos.putMeta(meta('aaaaaaaaaaa'))
    store.videos.putTranscript('aaaaaaaaaaa', 'en', cues)
    store.videos.touch('aaaaaaaaaaa')
    store.deleteAll()
    expect(store.videos.recent()).toEqual([])
    expect(store.videos.getTranscript('aaaaaaaaaaa', 'en')).toBeNull()
  })
})
