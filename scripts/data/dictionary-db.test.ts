import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { searchWords, type SqlDb } from '../../packages/dictionary/src'
import { buildDictionary, type DictionaryInput } from './dictionary-db'

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as new (
  path: string,
  opts?: object,
) => SqlDb & {
  close(): void
}

const input: DictionaryInput = {
  wordnet: {
    version: '2024',
    entries: [
      {
        word: 'abduct',
        senses: [{ pos: 'v', definition: 'take away', example: 'abduct a child' }],
      },
      { word: 'duct', senses: [{ pos: 'n', definition: 'a tube' }] },
    ],
  },
  pronunciations: new Map([['abduct', ['æbˈdʌkt']]]),
  roots: [
    {
      root: 'a, ab/s',
      forms: ['a', 'ab/s'],
      meaning: 'from, away',
      origins: ['Latin'],
      examples: ['abduct'],
      sourceUrl: 'https://example.test/roots',
    },
    {
      root: 'duct',
      forms: ['duct'],
      meaning: 'lead',
      origins: ['Latin'],
      examples: ['abduct', 'viaduct'],
      sourceUrl: 'https://example.test/roots',
    },
  ],
  etymology: [
    {
      word: 'abduct',
      originChain: [{ lang: 'Latin', langCode: 'la', term: 'abductus' }],
      firstUse: 'Early 17th century',
      sourceUrl: 'https://en.wiktionary.org/wiki/abduct#Etymology',
      etymonlineUrl: 'https://www.etymonline.com/word/abduct',
    },
  ],
}

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'dict-'))
  const file = join(dir, 'dictionary.sqlite')
  const manifest = buildDictionary(file, input)
  return { file, manifest }
}

describe('buildDictionary', () => {
  const { file, manifest } = build()
  const db = new Database(file, { readonly: true })
  const one = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T

  it('writes a manifest whose checksum matches the file', () => {
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex')
    expect(manifest).toMatchObject({ sha256: sha, version: '2024.1', schemaVersion: 1 })
    expect(manifest.bytes).toBe(readFileSync(file).length)
    expect(manifest.sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Open English WordNet', 'CMUdict', 'Wiktionary']),
    )
  })

  it('stores senses and pronunciations for an entry', () => {
    const e = one<{ id: number }>("SELECT id FROM entries WHERE word = 'abduct'")
    expect(
      db.prepare('SELECT pos, definition, example FROM senses WHERE entry_id = ?').all(e.id),
    ).toEqual([{ pos: 'v', definition: 'take away', example: 'abduct a child' }])
    expect(db.prepare('SELECT ipa FROM pronunciations WHERE entry_id = ?').all(e.id)).toEqual([
      { ipa: 'æbˈdʌkt' },
    ])
  })

  it('links example words to prefix and root morphemes', () => {
    const rows = db
      .prepare(
        `SELECT m.kind, m.form, r.root FROM morphemes m
         JOIN entries e ON e.id = m.entry_id JOIN roots r ON r.id = m.root_id
         WHERE e.word = 'abduct' ORDER BY m.position`,
      )
      .all()
    expect(rows).toEqual([
      { kind: 'prefix', form: 'ab', root: 'a, ab/s' },
      { kind: 'root', form: 'duct', root: 'duct' },
    ])
  })

  it('adds linked words that are missing from WordNet as bare entries', () => {
    expect(one<{ n: number }>("SELECT count(*) n FROM entries WHERE word = 'viaduct'").n).toBe(1)
  })

  it('stores etymology as JSON', () => {
    const row = one<{ origin_chain: string; first_use: string }>(
      "SELECT origin_chain, first_use FROM etymology t JOIN entries e ON e.id = t.entry_id WHERE e.word = 'abduct'",
    )
    expect(JSON.parse(row.origin_chain)[0].term).toBe('abductus')
    expect(row.first_use).toBe('Early 17th century')
  })

  it('is searchable through the shared search module', () => {
    expect(searchWords(db, 'abd')[0]).toMatchObject({ word: 'abduct' })
    expect(searchWords(db, 'abduxt')[0]).toMatchObject({ word: 'abduct', match: 'fuzzy' })
  })

  it('produces a byte-identical file on every build', () => {
    expect(build().manifest.sha256).toBe(manifest.sha256)
  })
})
