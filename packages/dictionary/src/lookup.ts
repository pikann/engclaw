import type { SqlDb } from './search'

export interface RootSummary {
  id: number
  root: string
  forms: string[]
  meaning: string
  origins: string[]
}

export interface RootListItem extends RootSummary {
  wordCount: number
}

export interface RootDetail extends RootSummary {
  sourceUrl: string
  words: { id: number; word: string }[]
  total: number
}

export interface WordMorpheme {
  kind: 'prefix' | 'root' | 'suffix'
  form: string
  root: RootSummary
}

export interface EtymologyStep {
  lang: string
  langCode?: string
  term: string
}

export interface WordEntry {
  id: number
  word: string
  pronunciations: string[]
  senses: { pos: string; definition: string; example: string | null }[]
  morphemes: WordMorpheme[]
  etymology: {
    chain: EtymologyStep[]
    pieRoot: string | null
    firstUse: string | null
    sourceUrl: string
    etymonlineUrl: string
  } | null
}

interface RootRow {
  id: number
  root: string
  forms: string
  meaning: string
  origins: string
}

const rootSummary = (r: RootRow): RootSummary => ({
  id: r.id,
  root: r.root,
  forms: JSON.parse(r.forms) as string[],
  meaning: r.meaning,
  origins: JSON.parse(r.origins) as string[],
})

export function getWord(db: SqlDb, id: number): WordEntry | null {
  const entry = db.prepare('SELECT id, word FROM entries WHERE id = ?').get(id) as
    { id: number; word: string } | undefined
  if (!entry) return null

  const senses = db
    .prepare('SELECT pos, definition, example FROM senses WHERE entry_id = ? ORDER BY ordinal')
    .all(id) as WordEntry['senses']
  const pronunciations = (
    db.prepare('SELECT ipa FROM pronunciations WHERE entry_id = ? ORDER BY ordinal').all(id) as {
      ipa: string
    }[]
  ).map((p) => p.ipa)
  const morphemes = (
    db
      .prepare(
        `SELECT m.kind, m.form, r.id, r.root, r.forms, r.meaning, r.origins
         FROM morphemes m JOIN roots r ON r.id = m.root_id
         WHERE m.entry_id = ? ORDER BY m.position`,
      )
      .all(id) as (RootRow & { kind: WordMorpheme['kind']; form: string })[]
  ).map((m) => ({ kind: m.kind, form: m.form, root: rootSummary(m) }))
  const ety = db
    .prepare(
      `SELECT origin_chain, pie_root, first_use, source_url, etymonline_url
       FROM etymology WHERE entry_id = ?`,
    )
    .get(id) as
    | {
        origin_chain: string
        pie_root: string | null
        first_use: string | null
        source_url: string
        etymonline_url: string
      }
    | undefined

  return {
    id: entry.id,
    word: entry.word,
    pronunciations,
    senses,
    morphemes,
    etymology: ety
      ? {
          chain: JSON.parse(ety.origin_chain) as EtymologyStep[],
          pieRoot: ety.pie_root,
          firstUse: ety.first_use,
          sourceUrl: ety.source_url,
          etymonlineUrl: ety.etymonline_url,
        }
      : null,
  }
}

export function getRoot(db: SqlDb, id: number, limit = 200): RootDetail | null {
  const row = db
    .prepare('SELECT id, root, forms, meaning, origins, source_url FROM roots WHERE id = ?')
    .get(id) as (RootRow & { source_url: string }) | undefined
  if (!row) return null
  const words = db
    .prepare(
      `SELECT DISTINCT e.id, e.word FROM morphemes m JOIN entries e ON e.id = m.entry_id
       WHERE m.root_id = ? ORDER BY e.norm, e.word LIMIT ?`,
    )
    .all(id, limit) as { id: number; word: string }[]
  const { n } = db
    .prepare('SELECT COUNT(DISTINCT entry_id) AS n FROM morphemes WHERE root_id = ?')
    .get(id) as { n: number }
  return { ...rootSummary(row), sourceUrl: row.source_url, words, total: n }
}

export function listRoots(
  db: SqlDb,
  filter: { origin?: string; query?: string } = {},
): RootListItem[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.root, r.forms, r.meaning, r.origins,
              (SELECT COUNT(DISTINCT entry_id) FROM morphemes WHERE root_id = r.id) AS wordCount
       FROM roots r ORDER BY r.root`,
    )
    .all() as (RootRow & { wordCount: number })[]
  const query = filter.query?.trim().toLowerCase()
  return rows
    .map((r) => ({ ...rootSummary(r), wordCount: r.wordCount }))
    .filter((r) => !filter.origin || r.origins.includes(filter.origin))
    .filter(
      (r) =>
        !query ||
        [r.root, ...r.forms, r.meaning].some((text) => text.toLowerCase().includes(query)),
    )
}

export function listRootOrigins(db: SqlDb): string[] {
  const rows = db.prepare('SELECT origins FROM roots').all() as { origins: string }[]
  return [...new Set(rows.flatMap((r) => JSON.parse(r.origins) as string[]))].sort()
}
