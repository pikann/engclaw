import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { SCHEMA_SQL } from './schema'
import { levenshtein, searchWords, type SqlDb } from './search'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as new (path: string) => SqlDb & {
  exec(sql: string): void
}

const WORDS = [
  'abduct',
  'abnormal',
  'absent',
  'act',
  'action',
  'actor',
  'Polish',
  'polish',
  'planet',
]

let db: SqlDb

beforeAll(() => {
  const d = new Database(':memory:')
  d.exec(SCHEMA_SQL)
  const insert = d.prepare('INSERT INTO entries (id, word, norm) VALUES (?, ?, ?)')
  WORDS.forEach((w, i) => insert.run(i + 1, w, w.toLowerCase()))
  d.exec("INSERT INTO entries_fts (entries_fts) VALUES ('rebuild')")
  d.exec("INSERT INTO entries_tri (entries_tri) VALUES ('rebuild')")
  db = d
})

describe('searchWords', () => {
  it('returns prefix matches, shortest first', () => {
    expect(searchWords(db, 'ac').map((r) => r.word)).toEqual(['act', 'actor', 'action'])
  })

  it('ranks an exact match before longer prefix matches', () => {
    expect(searchWords(db, 'act')[0]).toMatchObject({ word: 'act', match: 'prefix' })
  })

  it('is case-insensitive and keeps case variants distinct', () => {
    expect(searchWords(db, 'POLI').map((r) => r.word)).toEqual(['Polish', 'polish'])
  })

  it('falls back to fuzzy matches for typos', () => {
    const results = searchWords(db, 'plenet')
    expect(results[0]).toMatchObject({ word: 'planet', match: 'fuzzy', distance: 1 })
  })

  it('does not return fuzzy matches that are too far away', () => {
    expect(searchWords(db, 'zzzzzz')).toEqual([])
  })

  it('treats FTS syntax in the query as plain text', () => {
    expect(() => searchWords(db, '"act* OR (')).not.toThrow()
  })

  it('respects the limit', () => {
    expect(searchWords(db, 'a', 2)).toHaveLength(2)
  })

  it('returns nothing for an empty query', () => {
    expect(searchWords(db, '   ')).toEqual([])
  })
})

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })
})
