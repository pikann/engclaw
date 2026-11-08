import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_LICENSES,
  CONTENT_SCHEMA_VERSION,
  MIN_CHAPTERS,
  chapterKey,
  containsTarget,
  validateChapters,
  type Chapter,
  CONTENT_SCHEMA_SQL,
  readChapters,
  readWorldChapters,
  readWorlds,
  type ContentDb,
  type ContentManifest,
} from './content'
import { WORLD_SIZE, maxNeighbourJump, rankChapters } from './difficulty'

const dataDir = new URL('../../../apps/desktop/resources/data/', import.meta.url)
const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as new (
  path: string,
  options?: { readonly?: boolean },
) => ContentDb & { close(): void }
const dbFile = new URL('game-content.sqlite', dataDir)
const bytes = readFileSync(dbFile)
const db = new Database(dbFile.pathname, { readonly: true })
const chapters = readChapters(db)
const dbVersion = (
  db.prepare("SELECT value FROM meta WHERE key = 'dataset_version'").all() as { value: string }[]
)[0]!.value
const dbSchema = (
  db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").all() as { value: string }[]
)[0]!.value
const manifest = JSON.parse(
  readFileSync(new URL('game-content.manifest.json', dataDir), 'utf8'),
) as ContentManifest

function sizes(all: Chapter[]): Map<number, Chapter[]> {
  const byWorld = new Map<number, Chapter[]>()
  for (const c of all) byWorld.set(c.world, [...(byWorld.get(c.world) ?? []), c])
  return byWorld
}

const good: Chapter = {
  id: 'kick-the-bucket',
  text: 'kick the bucket',
  type: 'idiom',
  ipa: 'ˈkɪk ðə ˈbʌkɪt',
  meaning: 'To die.',
  examples: ['He may kick the bucket before the year is out.'],
  frequencyRank: 1245,
  difficulty: 49,
  order: 1,
  world: 1,
  source: 'Wiktionary',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://en.wiktionary.org/wiki/kick_the_bucket',
}

describe('containsTarget / chapterKey', () => {
  it('matches whole words case-insensitively and rejects inflections and substrings', () => {
    expect(containsTarget('He may Kick the  bucket soon.', 'kick the bucket')).toBe(true)
    expect(containsTarget('The category is large.', 'cat')).toBe(false)
    expect(containsTarget('He kicked the bucket.', 'kick the bucket')).toBe(false)
    expect(containsTarget("It’s fine, I don't mind.", "don't")).toBe(true)
  })

  it('treats a leading "to" as a variant', () => {
    expect(chapterKey('to kick the bucket')).toBe(chapterKey('Kick the bucket'))
  })
})

describe('validateChapters', () => {
  const check = (patch: Partial<Chapter>) => validateChapters([{ ...good, ...patch }], 1)

  it('accepts a valid chapter', () => {
    expect(check({})).toEqual([])
  })

  it('reports a bad ranking', () => {
    expect(check({ difficulty: 101 }).join()).toMatch(/difficulty out of range/)
    expect(check({ order: 2 }).join()).toMatch(/invalid order/)
    expect(check({ world: 0 }).join()).toMatch(/invalid world/)
    expect(validateChapters([good, { ...good, id: 'x', text: 'let it be' }], 1).join()).toMatch(
      /duplicate order 1/,
    )
  })

  it('reports duplicates and variants', () => {
    expect(validateChapters([good, { ...good }], 1).join()).toMatch(/duplicate id/)
    expect(
      validateChapters([good, { ...good, id: 'x', text: 'to kick the bucket' }], 1).join(),
    ).toMatch(/variant/)
  })

  it.each([
    ['ipa', { ipa: ' ' }, /empty ipa/],
    ['meaning', { meaning: '' }, /empty meaning/],
    ['examples', { examples: [] }, /no examples/],
    ['target in example', { examples: ['He may leave soon enough.'] }, /lacks the target/],
    [
      'example length',
      { examples: ['He may kick the bucket' + ' soon'.repeat(40)] },
      /length out of range/,
    ],
    [
      'too many examples',
      { examples: Array(4).fill('He may kick the bucket today.') },
      /more than 3/,
    ],
    ['text length', { text: 'a'.repeat(61) }, /longer than 60/],
    ['source', { source: '' }, /empty source/],
    ['license', { license: 'All rights reserved' }, /not allowed/],
    ['type', { type: 'word' as const }, /single token/],
  ])('rejects bad %s', (_name, patch, message) => {
    expect(check(patch).join()).toMatch(message)
  })

  it('requires the minimum catalog size', () => {
    expect(validateChapters([good]).join()).toMatch(/need at least 2000/)
  })
})

describe('content schema', () => {
  it('declares the tables the reader relies on', () => {
    expect(CONTENT_SCHEMA_SQL).toMatch(/CREATE TABLE chapters/)
    expect(CONTENT_SCHEMA_SQL).toMatch(/CREATE TABLE examples/)
  })
})

describe('shipped game content database', () => {
  it('summarises worlds and lists one world without the heavy fields', () => {
    const worlds = readWorlds(db)
    expect(worlds.reduce((n, w) => n + w.count, 0)).toBe(chapters.length)
    const w = worlds[1]!
    const list = readWorldChapters(db, w.world)
    expect(list).toHaveLength(w.count)
    expect(list[0]!.order).toBe(w.first)
    expect(Object.keys(list[0]!).sort()).toEqual(['order', 'text', 'type'])
  })

  it('has no validation errors and at least 2,000 chapters', () => {
    expect(Number(dbSchema)).toBe(CONTENT_SCHEMA_VERSION)
    expect(chapters.length).toBeGreaterThanOrEqual(MIN_CHAPTERS)
    expect(validateChapters(chapters)).toEqual([])
  })

  it('covers words, phrases and idioms', () => {
    for (const type of ['word', 'phrase', 'idiom'] as const)
      expect(chapters.filter((c) => c.type === type).length).toBeGreaterThan(0)
  })

  it('is ordered easy to hard with a unique order and contiguous worlds of 50-100 chapters', () => {
    expect(chapters.map((c) => c.order)).toEqual(chapters.map((_, i) => i + 1))
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i]!.difficulty).toBeGreaterThanOrEqual(chapters[i - 1]!.difficulty)
      expect(chapters[i]!.world - chapters[i - 1]!.world).toBeGreaterThanOrEqual(0)
      expect(chapters[i]!.world - chapters[i - 1]!.world).toBeLessThanOrEqual(1)
    }
    expect(chapters[0]!.world).toBe(1)
    const sizes = new Map<number, number>()
    for (const c of chapters) sizes.set(c.world, (sizes.get(c.world) ?? 0) + 1)
    for (const n of sizes.values()) {
      expect(n).toBeGreaterThanOrEqual(WORLD_SIZE.min)
      expect(n).toBeLessThanOrEqual(WORLD_SIZE.max)
    }
  })

  it('has no sharp difficulty jumps between neighbouring chapters', () => {
    const jumps = chapters.slice(1).map((c, i) => c.difficulty - chapters[i]!.difficulty)
    expect(maxNeighbourJump(chapters)).toBeLessThanOrEqual(5)
    expect([...jumps].sort((a, b) => a - b)[Math.floor(jumps.length * 0.99)]).toBeLessThan(0.5)
    const means = [...sizes(chapters)].map(
      ([, cs]) => cs.reduce((s, c) => s + c.difficulty, 0) / cs.length,
    )
    for (let i = 1; i < means.length; i++) expect(means[i]! - means[i - 1]!).toBeLessThan(10)
  })

  it('stores exactly what the documented rule computes', () => {
    const ranking = rankChapters(chapters)
    for (const c of chapters)
      expect({ difficulty: c.difficulty, order: c.order, world: c.world }).toEqual(
        ranking.get(c.id),
      )
  })

  it('matches its manifest (checksum, size, counts, version)', () => {
    expect(manifest.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifest.bytes).toBe(bytes.length)
    expect(manifest.version).toBe(dbVersion)
    expect(manifest.counts.total).toBe(chapters.length)
    for (const type of ['word', 'phrase', 'idiom'] as const)
      expect(manifest.counts[type]).toBe(chapters.filter((c) => c.type === type).length)
  })

  it('lists a license for every source and only allows share-alike-compatible licenses', () => {
    expect(manifest.sources.length).toBeGreaterThan(0)
    for (const s of manifest.sources) expect(s.license && s.url).toBeTruthy()
    expect(new Set(chapters.map((c) => c.license))).toEqual(
      new Set(chapters.map((c) => c.license).filter((l) => ALLOWED_LICENSES.includes(l))),
    )
  })

  it('is documented in the data sources attribution page', () => {
    const doc = readFileSync(new URL('GAME_CONTENT_SOURCES.md', dataDir), 'utf8')
    for (const s of manifest.sources) expect(doc).toContain(s.url)
  })
})
