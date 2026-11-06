export interface SqlStatement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): unknown
}

export interface SqlDb {
  prepare(sql: string): SqlStatement
}

export interface SearchResult {
  id: number
  word: string
  match: 'prefix' | 'fuzzy'
  distance?: number
}

interface Row {
  id: number
  word: string
  norm: string
}

const MAX_FUZZY_CANDIDATES = 300

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]!
}

function maxDistance(length: number): number {
  return length <= 4 ? 1 : length <= 7 ? 2 : 3
}

export function searchWords(db: SqlDb, query: string, limit = 20): SearchResult[] {
  const norm = query.toLowerCase().trim().replace(/\s+/g, ' ')
  const tokens = norm.match(/[\p{L}\p{N}]+/gu)
  if (!tokens) return []

  const match = tokens.map((t, i) => `"${t}"${i === tokens.length - 1 ? '*' : ''}`).join(' ')
  const prefixRows = db
    .prepare(
      `SELECT e.id, e.word, e.norm FROM entries_fts f JOIN entries e ON e.id = f.rowid
       WHERE entries_fts MATCH ?
       ORDER BY e.norm = ? DESC, length(e.norm), e.norm, e.word
       LIMIT ?`,
    )
    .all(match, norm, limit) as Row[]
  const results: SearchResult[] = prefixRows.map((r) => ({
    id: r.id,
    word: r.word,
    match: 'prefix',
  }))
  if (results.length >= limit || norm.length < 3) return results

  const trigrams = new Set<string>()
  for (let i = 0; i + 3 <= norm.length; i++) trigrams.add(norm.slice(i, i + 3).replace(/"/g, ''))
  const candidates = db
    .prepare(
      `SELECT e.id, e.word, e.norm FROM entries_tri t JOIN entries e ON e.id = t.rowid
       WHERE entries_tri MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all([...trigrams].map((t) => `"${t}"`).join(' OR '), MAX_FUZZY_CANDIDATES) as Row[]

  const seen = new Set(results.map((r) => r.id))
  const threshold = maxDistance(norm.length)
  const fuzzy = candidates
    .filter((c) => !seen.has(c.id))
    .map((c) => ({ row: c, distance: levenshtein(norm, c.norm) }))
    .filter((c) => c.distance <= threshold)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        Math.abs(a.row.norm.length - norm.length) - Math.abs(b.row.norm.length - norm.length) ||
        a.row.word.localeCompare(b.row.word),
    )
  for (const { row, distance } of fuzzy) {
    if (results.length >= limit) break
    results.push({ id: row.id, word: row.word, match: 'fuzzy', distance })
  }
  return results
}
