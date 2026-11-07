import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { getRoot, getWord, listRoots } from './lookup'
import { SCHEMA_SQL } from './schema'
import type { SqlDb } from './search'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as new (path: string) => SqlDb & {
  exec(sql: string): void
}

let db: SqlDb

beforeAll(() => {
  const d = new Database(':memory:')
  d.exec(SCHEMA_SQL)
  d.exec(`
    INSERT INTO entries (id, word, norm) VALUES
      (1, 'inspect', 'inspect'), (2, 'spectator', 'spectator'), (3, 'inbox', 'inbox'),
      (4, 'read', 'read'), (5, 'telescope', 'telescope');
    INSERT INTO senses VALUES
      (1, 1, 'v', 'examine officially', NULL),
      (1, 0, 'v', 'look over carefully', 'Please inspect it'),
      (4, 0, 'v', 'interpret written words', NULL);
    INSERT INTO pronunciations VALUES (4, 1, 'ˈɹid'), (4, 0, 'ˈɹɛd'), (1, 0, 'ˌɪnˈspɛkt');
    INSERT INTO roots VALUES
      (10, 'in', '["in","im"]', 'in, into', '["Latin"]', 'https://r/in'),
      (11, 'spect', '["spect","spec"]', 'look', '["Latin"]', 'https://r/spect'),
      (12, 'scop', '["scop"]', 'see', '["Greek"]', 'https://r/scop'),
      (13, 'orphan', '["orphan"]', 'nothing', '[]', 'https://r/orphan');
    INSERT INTO morphemes VALUES
      (1, 1, 'root', 'spect', 11), (1, 0, 'prefix', 'in', 10),
      (2, 0, 'root', 'spect', 11), (3, 0, 'prefix', 'in', 10), (5, 0, 'root', 'scop', 12);
    INSERT INTO etymology VALUES
      (1, '[{"lang":"Latin","langCode":"la","term":"inspectus"}]', '*spek-', '15th century',
       'https://wikt/inspect', 'https://etym/inspect');
  `)
  db = d
})

describe('getWord', () => {
  it('returns senses and pronunciations in order, with morphemes and etymology', () => {
    const w = getWord(db, 1)!
    expect(w.word).toBe('inspect')
    expect(w.senses.map((s) => s.definition)).toEqual(['look over carefully', 'examine officially'])
    expect(w.senses[0]).toEqual({
      pos: 'v',
      definition: 'look over carefully',
      example: 'Please inspect it',
    })
    expect(w.senses[1]!.example).toBeNull()
    expect(w.pronunciations).toEqual(['ˌɪnˈspɛkt'])
    expect(w.morphemes.map((m) => [m.kind, m.form, m.root.root, m.root.meaning])).toEqual([
      ['prefix', 'in', 'in', 'in, into'],
      ['root', 'spect', 'spect', 'look'],
    ])
    expect(w.morphemes[1]!.root.id).toBe(11)
    expect(w.etymology).toEqual({
      chain: [{ lang: 'Latin', langCode: 'la', term: 'inspectus' }],
      pieRoot: '*spek-',
      firstUse: '15th century',
      sourceUrl: 'https://wikt/inspect',
      etymonlineUrl: 'https://etym/inspect',
    })
  })

  it('orders several pronunciations and tolerates missing morphemes/etymology', () => {
    const w = getWord(db, 4)!
    expect(w.pronunciations).toEqual(['ˈɹɛd', 'ˈɹid'])
    expect(w.morphemes).toEqual([])
    expect(w.etymology).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(getWord(db, 999)).toBeNull()
  })
})

describe('getRoot', () => {
  it('lists the family of words built on a root, alphabetically', () => {
    const r = getRoot(db, 11)!
    expect(r).toMatchObject({
      id: 11,
      root: 'spect',
      forms: ['spect', 'spec'],
      meaning: 'look',
      origins: ['Latin'],
      sourceUrl: 'https://r/spect',
      total: 2,
    })
    expect(r.words).toEqual([
      { id: 1, word: 'inspect' },
      { id: 2, word: 'spectator' },
    ])
  })

  it('caps the word list but reports the total', () => {
    const r = getRoot(db, 11, 1)!
    expect(r.words).toHaveLength(1)
    expect(r.total).toBe(2)
  })

  it('returns null for an unknown id', () => {
    expect(getRoot(db, 999)).toBeNull()
  })
})

describe('listRoots', () => {
  it('lists every root with its word count, alphabetically', () => {
    expect(listRoots(db).map((r) => [r.root, r.wordCount])).toEqual([
      ['in', 2],
      ['orphan', 0],
      ['scop', 1],
      ['spect', 2],
    ])
  })

  it('filters by origin language', () => {
    expect(listRoots(db, { origin: 'Greek' }).map((r) => r.root)).toEqual(['scop'])
  })

  it('filters by text in the root, its forms or its meaning', () => {
    expect(listRoots(db, { query: 'look' }).map((r) => r.root)).toEqual(['spect'])
    expect(listRoots(db, { query: 'SPEC' }).map((r) => r.root)).toEqual(['spect'])
    expect(listRoots(db, { query: 'zzz' })).toEqual([])
  })

  it('lists the distinct origin languages', async () => {
    const { listRootOrigins } = await import('./lookup')
    expect(listRootOrigins(db)).toEqual(['Greek', 'Latin'])
  })
})
