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
      learningLanguage: 'en',
      silenceAutoStop: true,
      checkForUpdates: true,
      theme: 'system',
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      wordImages: true,
      captionsVisible: true,
      starPrompt: { done: false, moments: 0, shown: 0, lastShownAt: 0 },
    })
    store.settings.update({ silenceAutoStop: false, captionsVisible: false })
    store.db.close()
    store = openStore(dbPath())
    expect(store.settings.get()).toEqual({
      learningLanguage: 'en',
      silenceAutoStop: false,
      checkForUpdates: true,
      theme: 'system',
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      wordImages: true,
      captionsVisible: false,
      starPrompt: { done: false, moments: 0, shown: 0, lastShownAt: 0 },
    })
  })

  it('persists the learning language independently and filters history before pagination', () => {
    store.settings.update({ learningLanguage: 'zh' })
    store.history.save(attempt({ text: '你好', language: 'zh' }))
    store.history.save(attempt({ text: 'hello', language: 'en' }))
    expect(store.history.count(undefined, 'zh')).toBe(1)
    expect(store.history.list(1, 0, undefined, 'zh')[0]?.text).toBe('你好')
    store.db.close()
    store = openStore(dbPath())
    expect(store.settings.get().learningLanguage).toBe('zh')
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

describe('game progress', () => {
  let dir: string
  let store: Store
  const dbPath = () => join(dir, 'engclaw.db')
  const res = (over = {}) => ({
    stars: 2 as const,
    avgScore: 70,
    bestScore: 80,
    attempts: 9,
    ...over,
  })
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engclaw-game-'))
    store = openStore(dbPath())
  })
  afterEach(() => {
    store.db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists across restarts', () => {
    store.game.record(1, res())
    store.db.close()
    store = openStore(dbPath())
    expect(store.game.get(1)).toMatchObject({ order: 1, stars: 2, avgScore: 70, attempts: 9 })
  })

  it('a worse replay keeps the best result', () => {
    store.game.record(1, res({ stars: 3, avgScore: 92, bestScore: 99, attempts: 6 }))
    const { progress, improved } = store.game.record(
      1,
      res({ stars: 1, avgScore: 55, bestScore: 60 }),
    )
    expect(improved).toBe(false)
    expect(progress).toMatchObject({ stars: 3, avgScore: 92, bestScore: 99, attempts: 15 })
    expect(store.game.get(1)).toMatchObject({ stars: 3, avgScore: 92 })
  })

  it('returns the previous best and flags a higher average at equal stars', () => {
    expect(store.game.record(1, res({ avgScore: 70 })).previous).toBeNull()
    const better = store.game.record(1, res({ avgScore: 76 }))
    expect(better.improved).toBe(true)
    expect(better.previous).toMatchObject({ stars: 2, avgScore: 70 })
    expect(better.progress.avgScore).toBe(76)
    const same = store.game.record(1, res({ avgScore: 76 }))
    expect(same.improved).toBe(false)
    expect(same.previous).toMatchObject({ avgScore: 76 })
  })

  it('reports an improvement and unlocks sequentially', () => {
    expect(store.game.isUnlocked(1)).toBe(true)
    expect(store.game.isUnlocked(2)).toBe(false)
    expect(store.game.record(1, res({ stars: 1 })).improved).toBe(true)
    expect(store.game.record(1, res({ stars: 3 })).improved).toBe(true)
    expect(store.game.isUnlocked(2)).toBe(true)
    expect(store.game.isUnlocked(3)).toBe(false)
  })

  it('export then import round-trips and merges best-of-both', () => {
    store.game.record(1, res({ stars: 3, avgScore: 90 }))
    store.game.record(2, res())
    const json = JSON.parse(JSON.stringify(store.exportData()))
    expect(json.gameProgress).toHaveLength(2)

    const other = openStore(join(dir, 'other', 'engclaw.db'))
    other.game.record(2, res({ stars: 3, avgScore: 88 }))
    other.importData(json)
    expect(other.game.list().map((e) => [e.order, e.stars])).toEqual([
      [1, 3],
      [2, 3],
    ])
    expect(other.game.get(2)!.avgScore).toBe(88)
    const before = other.game.list()
    other.importData(json)
    expect(other.game.list()).toEqual(before)
    other.db.close()
  })

  it('imports files exported before the game existed', () => {
    const json = JSON.parse(JSON.stringify(store.exportData()))
    delete json.gameProgress
    expect(() => store.importData(json)).not.toThrow()
  })

  it('rejects invalid progress without partial writes', () => {
    store.game.record(1, res())
    const json = JSON.parse(JSON.stringify(store.exportData()))
    json.gameProgress.push({ ...json.gameProgress[0], order: 2, stars: 9 })
    const fresh = openStore(join(dir, 'f', 'engclaw.db'))
    expect(() => fresh.importData(json)).toThrow()
    expect(fresh.game.list()).toEqual([])
    fresh.db.close()
  })

  it('deleteAll wipes progress', () => {
    store.game.record(1, res())
    store.deleteAll()
    expect(store.game.list()).toEqual([])
  })
})

describe('migrations', () => {
  it('adds game_progress when upgrading a database from before the game', () => {
    const db = new Database(':memory:')
    migrate(db, MIGRATIONS.slice(0, MIGRATIONS.length - 3))
    db.prepare("INSERT INTO settings VALUES ('k', '1')").run()
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='game_progress'").get(),
    ).toBeUndefined()
    migrate(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM game_progress').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT value FROM settings').get()).toEqual({ value: '1' })
  })

  it('stores cards with a message and drops stored cards that fail validation on read', () => {
    const store = openStore(':memory:')
    store.agent.create('c', 1)
    const card = { type: 'correction', said: 'I go', better: 'I went' } as const
    store.agent.append('c', 'assistant', 'ok', 2, [card])
    store.db
      .prepare(
        'INSERT INTO agent_message (conversation_id, role, text, created_at, cards) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        'c',
        'assistant',
        'x',
        3,
        JSON.stringify([{ type: 'vocabulary', word: '<i>x</i>' }, card]),
      )
    store.db
      .prepare(
        "INSERT INTO agent_message (conversation_id, role, text, created_at, cards) VALUES ('c', 'assistant', 'y', 4, 'not json')",
      )
      .run()
    expect(store.agent.messages('c').map((m) => m.cards)).toEqual([[card], [card], []])
    store.db.close()
  })

  it('adds agent conversation tables and deleteAll wipes them', () => {
    const store = openStore(':memory:')
    store.agent.create('c', 1)
    store.agent.append('c', 'user', 'hi', 2)
    expect(store.agent.messages('c')).toMatchObject([{ role: 'user', text: 'hi' }])
    store.deleteAll()
    expect(store.agent.exists('c')).toBe(false)
    store.db.close()
  })

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
