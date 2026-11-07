import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, rmSync, statSync } from 'node:fs'
import { SCHEMA_SQL, SCHEMA_VERSION, type Manifest } from '../../packages/dictionary/src'
import { expandForms, linkMorphemes, type RootEntry } from './morphemes'
import type { WordnetEntry } from './dictionary-sources'
import type { WordEtymology } from './wiktextract-etymology'

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

export const DATASET_REVISION = 1
const MAX_PRONUNCIATIONS = 3

export interface DictionaryInput {
  wordnet: { version: string; entries: WordnetEntry[] }
  pronunciations: Map<string, string[]>
  roots: RootEntry[]
  etymology: WordEtymology[]
  /** Full word families per root index (root-families.json); merged with each root's examples. */
  families?: { rootIndex: number; words: string[] }[]
}

export const SOURCES: Manifest['sources'] = [
  {
    name: 'Open English WordNet',
    version: '',
    license: 'CC BY 4.0',
    url: 'https://en-word.net/',
  },
  {
    name: 'CMUdict',
    version: 'cmusphinx/cmudict master',
    license: 'BSD-2-Clause',
    url: 'https://github.com/cmusphinx/cmudict',
  },
  {
    name: 'Wiktionary',
    version: 'via Wiktextract (kaikki.org)',
    license: 'CC BY-SA 4.0',
    url: 'https://en.wiktionary.org/',
  },
  {
    name: 'learnthat.org roots (facts only)',
    version: '',
    license: 'Facts only, attribution and link-back',
    url: 'https://www.learnthat.org/pages/view/roots.html',
  },
]

export function buildDictionary(file: string, input: DictionaryInput): Manifest {
  rmSync(file, { force: true })
  const db = new Database(file)
  db.pragma('journal_mode = DELETE')
  db.exec(SCHEMA_SQL)

  const wordsByRoot = new Map<string, number[]>()
  const wordsOfRoot = input.roots.map((root) => new Set(root.examples.map((e) => e.toLowerCase())))
  for (const f of input.families ?? [])
    for (const w of f.words) wordsOfRoot[f.rootIndex]?.add(w.toLowerCase())
  wordsOfRoot.forEach((words, i) => {
    for (const key of words) wordsByRoot.set(key, [...(wordsByRoot.get(key) ?? []), i])
  })

  const senses = new Map(input.wordnet.entries.map((e) => [e.word, e.senses]))
  const words = new Set<string>([
    ...input.wordnet.entries.map((e) => e.word),
    ...[...wordsByRoot.keys()],
    ...input.etymology.map((e) => e.word),
  ])
  const sorted = [...words]
    .map((word) => ({ word, norm: word.toLowerCase() }))
    .sort((a, b) => (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : a.word < b.word ? -1 : 1))
  const ids = new Map<string, number>()

  const insertEntry = db.prepare('INSERT INTO entries (id, word, norm) VALUES (?, ?, ?)')
  const insertSense = db.prepare(
    'INSERT INTO senses (entry_id, ordinal, pos, definition, example) VALUES (?, ?, ?, ?, ?)',
  )
  const insertPron = db.prepare(
    'INSERT INTO pronunciations (entry_id, ordinal, ipa) VALUES (?, ?, ?)',
  )
  const insertRoot = db.prepare(
    'INSERT INTO roots (id, root, forms, meaning, origins, source_url) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insertMorpheme = db.prepare(
    'INSERT INTO morphemes (entry_id, position, kind, form, root_id) VALUES (?, ?, ?, ?, ?)',
  )
  const insertEtymology = db.prepare(
    `INSERT INTO etymology (entry_id, origin_chain, pie_root, first_use, source_url, etymonline_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n

  db.transaction(() => {
    sorted.forEach(({ word, norm }, i) => {
      const id = i + 1
      ids.set(word, id)
      insertEntry.run(id, word, norm)
      senses
        .get(word)
        ?.forEach((s, ordinal) =>
          insertSense.run(id, ordinal, s.pos, s.definition, s.example ?? null),
        )
      input.pronunciations
        .get(norm)
        ?.slice(0, MAX_PRONUNCIATIONS)
        .forEach((ipa, ordinal) => insertPron.run(id, ordinal, ipa))
    })

    input.roots.forEach((r, i) =>
      insertRoot.run(
        i,
        r.root,
        JSON.stringify(expandForms(r.root)),
        r.meaning,
        JSON.stringify(r.origins),
        r.sourceUrl,
      ),
    )

    for (const { word } of sorted) {
      const rootIdx = wordsByRoot.get(word)
      if (!rootIdx) continue
      const links = linkMorphemes(
        word,
        rootIdx.map((index) => ({ index, entry: input.roots[index]! })),
      )
      for (const l of links)
        insertMorpheme.run(ids.get(word), l.position, l.kind, l.form, l.rootIndex)
    }

    for (const e of input.etymology) {
      insertEtymology.run(
        ids.get(e.word),
        JSON.stringify(e.originChain),
        e.pieRoot ?? null,
        e.firstUse ?? null,
        e.sourceUrl,
        e.etymonlineUrl,
      )
    }

    const version = `${input.wordnet.version}.${DATASET_REVISION}`
    const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    meta.run('schema_version', String(SCHEMA_VERSION))
    meta.run('dataset_version', version)
    meta.run('wordnet_version', input.wordnet.version)

    db.exec("INSERT INTO entries_fts (entries_fts) VALUES ('rebuild')")
    db.exec("INSERT INTO entries_tri (entries_tri) VALUES ('rebuild')")
  })()
  db.exec("INSERT INTO entries_fts (entries_fts) VALUES ('optimize')")
  db.exec("INSERT INTO entries_tri (entries_tri) VALUES ('optimize')")

  const counts = {
    entries: count('SELECT count(*) n FROM entries'),
    senses: count('SELECT count(*) n FROM senses'),
    pronunciations: count('SELECT count(*) n FROM pronunciations'),
    roots: count('SELECT count(*) n FROM roots'),
    morphemes: count('SELECT count(*) n FROM morphemes'),
    etymology: count('SELECT count(*) n FROM etymology'),
  }
  db.exec('VACUUM')
  db.close()

  return {
    version: `${input.wordnet.version}.${DATASET_REVISION}`,
    schemaVersion: SCHEMA_VERSION,
    file: file.split('/').pop()!,
    bytes: statSync(file).size,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    counts,
    sources: SOURCES.map((s) =>
      s.name === 'Open English WordNet' ? { ...s, version: input.wordnet.version } : s,
    ),
  }
}
