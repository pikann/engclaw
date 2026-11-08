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
  type ContentDb,
  type ContentManifest,
} from './content'

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

const good: Chapter = {
  id: 'kick-the-bucket',
  text: 'kick the bucket',
  type: 'idiom',
  ipa: 'ˈkɪk ðə ˈbʌkɪt',
  meaning: 'To die.',
  examples: ['He may kick the bucket before the year is out.'],
  frequencyRank: 1245,
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
  it('has no validation errors and at least 2,000 chapters', () => {
    expect(Number(dbSchema)).toBe(CONTENT_SCHEMA_VERSION)
    expect(chapters.length).toBeGreaterThanOrEqual(MIN_CHAPTERS)
    expect(validateChapters(chapters)).toEqual([])
  })

  it('covers words, phrases and idioms', () => {
    for (const type of ['word', 'phrase', 'idiom'] as const)
      expect(chapters.filter((c) => c.type === type).length).toBeGreaterThan(0)
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
