import type { SqlDb } from './search'

export interface RootMasteryRow {
  rootId: number
  root: string
  meaning: string
  inDeck: number
  mature: number
  total: number
}

export function findWordId(db: SqlDb, word: string): number | null {
  const row = db.prepare('SELECT id FROM entries WHERE word = ? ORDER BY id LIMIT 1').get(word) as
    { id: number } | undefined
  return row?.id ?? null
}

/** Distinct words built on a root, in alphabetical order. */
export function rootFamilyWords(db: SqlDb, rootId: number): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT e.word FROM morphemes m JOIN entries e ON e.id = m.entry_id
         WHERE m.root_id = ? ORDER BY e.norm, e.word`,
      )
      .all(rootId) as { word: string }[]
  ).map((r) => r.word)
}

/** For every root that has a deck word: family size, deck words and how many are mature. */
export function rootMastery(
  db: SqlDb,
  deckWords: string[],
  matureWords: Set<string>,
): RootMasteryRow[] {
  const inDeck = new Set(deckWords)
  const rows = db
    .prepare(
      `SELECT r.id AS rootId, r.root, r.meaning, e.word
       FROM roots r JOIN morphemes m ON m.root_id = r.id JOIN entries e ON e.id = m.entry_id`,
    )
    .all() as { rootId: number; root: string; meaning: string; word: string }[]
  const byRoot = new Map<number, RootMasteryRow & { words: Set<string> }>()
  for (const r of rows) {
    const row = byRoot.get(r.rootId) ?? {
      rootId: r.rootId,
      root: r.root,
      meaning: r.meaning,
      inDeck: 0,
      mature: 0,
      total: 0,
      words: new Set<string>(),
    }
    byRoot.set(r.rootId, row)
    row.words.add(r.word)
  }
  const out: RootMasteryRow[] = []
  for (const { words, ...row } of byRoot.values()) {
    const deck = [...words].filter((w) => inDeck.has(w))
    if (deck.length === 0) continue
    out.push({
      ...row,
      total: words.size,
      inDeck: deck.length,
      mature: deck.filter((w) => matureWords.has(w)).length,
    })
  }
  return out.sort((a, b) => b.mature / b.total - a.mature / a.total || a.root.localeCompare(b.root))
}

/** Primary definition of a word (its first sense), or null when it has none. */
export function primaryDefinition(db: SqlDb, word: string): string | null {
  const row = db
    .prepare(
      `SELECT s.definition FROM entries e JOIN senses s ON s.entry_id = e.id
       WHERE e.word = ? ORDER BY e.id, s.ordinal LIMIT 1`,
    )
    .get(word) as { definition: string } | undefined
  return row?.definition ?? null
}

/** Random primary definitions of other words, never equal to `exclude`, for multiple-choice distractors. */
export function randomDefinitions(
  db: SqlDb,
  excludeWord: string,
  exclude: string,
  n: number,
): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT s.definition FROM senses s JOIN entries e ON e.id = s.entry_id
         WHERE s.ordinal = 0 AND e.word != ? AND s.definition != ?
         ORDER BY random() LIMIT ?`,
      )
      .all(excludeWord, exclude, n) as { definition: string }[]
  ).map((r) => r.definition)
}

export function firstPronunciation(db: SqlDb, word: string): string | null {
  const row = db
    .prepare(
      `SELECT p.ipa FROM entries e JOIN pronunciations p ON p.entry_id = e.id
       WHERE e.word = ? ORDER BY e.id, p.ordinal LIMIT 1`,
    )
    .get(word) as { ipa: string } | undefined
  return row?.ipa ?? null
}
