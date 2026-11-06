import Database from 'better-sqlite3'
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, FutureSchemaError, currentVersion, migrate } from './migrations'
import { openStore, type Store } from './index'

const attempt = (over = {}) => ({
  mode: 'sentence' as const,
  text: 'The quick brown fox.',
  language: 'en',
  score: 82.5,
  errors: [{ word: 'quick', expected: 'kwɪk', actual: 'kɪk', confidence: 0.4 }],
  ...over,
})
const tone = (n = 1600) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 10) * 0.5)

describe('store', () => {
  let dir: string
  let store: Store
  const dbPath = () => join(dir, 'engclaw.db')
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engclaw-store-'))
    store = openStore(dbPath())
  })
  afterEach(() => {
    store.db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('history persists across restarts', () => {
    const saved = store.history.save(attempt({ audio: tone() }))
    store.db.close()
    store = openStore(dbPath())
    const [row] = store.history.list()
    expect(row).toMatchObject({
      id: saved.id,
      text: 'The quick brown fox.',
      score: 82.5,
      hasAudio: true,
    })
    expect(row!.errors[0]!.word).toBe('quick')
    expect(store.history.audio(saved.id)).toHaveLength(1600)
  })

  it('stores shadowing attempts per video and sentence and filters by video', () => {
    store.history.save(attempt({ videoId: 'abc', segmentIndex: 3, score: 70 }))
    store.history.save(attempt({ videoId: 'xyz', segmentIndex: 0 }))
    store.history.save(attempt())
    expect(store.history.list(100, 0, 'abc')).toMatchObject([
      { videoId: 'abc', segmentIndex: 3, score: 70 },
    ])
    expect(store.history.count('abc')).toBe(1)
    expect(store.history.count()).toBe(3)
    const plain = store.history.list().find((a) => !a.videoId)!
    expect(plain.segmentIndex).toBeUndefined()
    const copy = JSON.parse(JSON.stringify(store.history.export()))
    expect(copy.attempts.filter((a: { videoId?: string }) => a.videoId)).toHaveLength(2)
  })

  it('lists newest first and pages', () => {
    let t = 1000
    const s = openStore(join(dir, 'x', 'a.db'))
    const h = new (store.history.constructor as new (...a: unknown[]) => typeof store.history)(
      s.db,
      join(dir, 'x', 'audio'),
      () => t++,
    )
    for (const text of ['a', 'b', 'c']) h.save(attempt({ text }))
    expect(h.list().map((x) => x.text)).toEqual(['c', 'b', 'a'])
    expect(h.list(1, 1).map((x) => x.text)).toEqual(['b'])
    expect(h.count()).toBe(3)
    s.db.close()
  })

  it('delete removes the row and its recording', () => {
    const a = store.history.save(attempt({ audio: tone() }))
    expect(store.history.remove(a.id)).toBe(true)
    expect(store.history.list()).toEqual([])
    expect(store.history.audio(a.id)).toBeNull()
    expect(store.history.remove(a.id)).toBe(false)
  })

  it('attempts without audio report none', () => {
    const a = store.history.save(attempt())
    expect(a.hasAudio).toBe(false)
    expect(store.history.audio(a.id)).toBeNull()
  })

  it('export then import into a fresh store restores attempts and audio', () => {
    const a = store.history.save(attempt({ audio: tone() }))
    store.history.save(attempt({ text: 'second', mode: 'free' }))
    const json = JSON.parse(JSON.stringify(store.history.export()))
    const other = openStore(join(dir, 'other', 'engclaw.db'))
    expect(other.history.import(json)).toEqual({ imported: 2, skipped: 0 })
    expect(
      other.history
        .list()
        .map((x) => x.text)
        .sort(),
    ).toEqual(['The quick brown fox.', 'second'])
    expect(other.history.audio(a.id)).toHaveLength(1600)
    // importing again is idempotent
    expect(other.history.import(json)).toEqual({ imported: 0, skipped: 2 })
    other.db.close()
  })

  it('import rejects malformed files without partial writes', () => {
    const good = JSON.parse(JSON.stringify((store.history.save(attempt()), store.history.export())))
    const fresh = openStore(join(dir, 'f', 'engclaw.db'))
    expect(() => fresh.history.import({ nope: 1 })).toThrow()
    const bad = {
      ...good,
      attempts: [...good.attempts, { ...good.attempts[0], id: 'z', audio: 'bm90IHdhdg==' }],
    }
    expect(() => fresh.history.import(bad)).toThrow()
    expect(fresh.history.count()).toBe(0)
    fresh.db.close()
  })

  it('settings default, persist and patch', () => {
    expect(store.settings.get()).toEqual({
      silenceAutoStop: true,
      checkForUpdates: true,
      theme: 'system',
    })
    store.settings.update({ silenceAutoStop: false })
    store.db.close()
    store = openStore(dbPath())
    expect(store.settings.get()).toEqual({
      silenceAutoStop: false,
      checkForUpdates: true,
      theme: 'system',
    })
  })

  it('deleteAll wipes history, recordings and settings', () => {
    store.history.save(attempt({ audio: tone() }))
    store.settings.update({ checkForUpdates: false })
    store.deleteAll()
    expect(store.history.list()).toEqual([])
    expect(store.settings.get().checkForUpdates).toBe(true)
    expect(existsSync(join(dir, 'audio'))).toBe(false)
    expect(readdirSync(dir).some((f) => f.endsWith('.wav'))).toBe(false)
  })
})

describe('migrations', () => {
  it('apply once, set user_version, and are idempotent', () => {
    const db = new Database(':memory:')
    expect(currentVersion(db)).toBe(0)
    expect(migrate(db)).toBe(MIGRATIONS.length)
    expect(currentVersion(db)).toBe(MIGRATIONS.length)
    expect(migrate(db)).toBe(MIGRATIONS.length)
  })

  it('upgrades an old database in place keeping data', () => {
    const db = new Database(':memory:')
    migrate(db, MIGRATIONS.slice(0, 1))
    db.prepare("INSERT INTO settings VALUES ('k', '1')").run()
    migrate(db, [...MIGRATIONS, 'ALTER TABLE settings ADD COLUMN extra TEXT'])
    expect(currentVersion(db)).toBe(MIGRATIONS.length + 1)
    expect(db.prepare('SELECT value FROM settings').get()).toEqual({ value: '1' })
  })

  it('a failing migration rolls back and leaves the version unchanged', () => {
    const db = new Database(':memory:')
    expect(() => migrate(db, [...MIGRATIONS, 'CREATE TABLE t (a); BOGUS SQL'])).toThrow()
    expect(currentVersion(db)).toBe(MIGRATIONS.length)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='t'").get()).toBeUndefined()
  })

  it('refuses a database from a newer app', () => {
    const db = new Database(':memory:')
    db.pragma('user_version = 99')
    expect(() => migrate(db)).toThrow(FutureSchemaError)
  })
})
