export const CONTENT_SCHEMA_VERSION = 1

export type ChapterType = 'word' | 'phrase' | 'idiom'

export interface Chapter {
  id: string
  text: string
  type: ChapterType
  ipa: string
  meaning: string
  examples: string[]
  /** Rank (1 = most common) of the rarest word in `text` in the frequency list. */
  frequencyRank: number
  source: string
  license: string
  sourceUrl: string
}

export interface ContentManifest {
  version: string
  schemaVersion: number
  file: string
  bytes: number
  sha256: string
  counts: { total: number; word: number; phrase: number; idiom: number }
  sources: { name: string; version: string; license: string; url: string }[]
}

export const CONTENT_SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('word', 'phrase', 'idiom')),
  ipa TEXT NOT NULL,
  meaning TEXT NOT NULL,
  frequency_rank INTEGER NOT NULL,
  source TEXT NOT NULL,
  license TEXT NOT NULL,
  source_url TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE examples (
  chapter_id TEXT NOT NULL REFERENCES chapters (id),
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (chapter_id, ordinal)
) WITHOUT ROWID;
CREATE INDEX chapters_type_rank ON chapters (type, frequency_rank);
`

export interface ContentDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
}

export function readChapters(db: ContentDb): Chapter[] {
  const rows = db
    .prepare(
      `SELECT id, text, type, ipa, meaning, frequency_rank AS frequencyRank, source, license,
              source_url AS sourceUrl FROM chapters ORDER BY frequency_rank, id`,
    )
    .all() as Omit<Chapter, 'examples'>[]
  const examples = new Map<string, string[]>()
  for (const e of db
    .prepare('SELECT chapter_id AS id, text FROM examples ORDER BY chapter_id, ordinal')
    .all() as { id: string; text: string }[])
    examples.set(e.id, [...(examples.get(e.id) ?? []), e.text])
  return rows.map((r) => ({ ...r, examples: examples.get(r.id) ?? [] }))
}

export const MIN_CHAPTERS = 2000

export const CONTENT_LIMITS = {
  wordMax: 24,
  textMax: 60,
  maxTokens: 8,
  meaningMax: 160,
  exampleMin: 12,
  exampleMax: 160,
  examplesMax: 3,
}

export const ALLOWED_LICENSES = ['CC BY-SA 4.0', 'CC BY 4.0', 'CC0 1.0']

const TEXT_PATTERN = /^[A-Za-z][A-Za-z' -]*[A-Za-z]$/

function normalizeQuotes(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

/** Identity used to detect duplicates and variants ("to kick the bucket" == "kick the bucket"). */
export function chapterKey(text: string): string {
  return normalizeQuotes(text)
    .toLowerCase()
    .replace(/^to /, '')
    .replace(/[^a-z0-9' ]/g, '')
    .trim()
}

export function chapterId(text: string): string {
  return chapterKey(text).replace(/'/g, '').replace(/ /g, '-')
}

export function containsTarget(sentence: string, target: string): boolean {
  const escaped = normalizeQuotes(target)
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}'])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(
    normalizeQuotes(sentence).toLowerCase(),
  )
}

export function validateChapters(chapters: Chapter[], minChapters = MIN_CHAPTERS): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const keys = new Set<string>()
  const lim = CONTENT_LIMITS

  if (chapters.length < minChapters)
    errors.push(`catalog has ${chapters.length} chapters, need at least ${minChapters}`)

  for (const c of chapters) {
    const at = `"${c.text}"`
    const tokens = c.text.split(/\s+/).length
    if (!c.text?.trim()) errors.push(`${at}: empty text`)
    else {
      if (!TEXT_PATTERN.test(c.text)) errors.push(`${at}: text has unsupported characters`)
      if (c.text.length > lim.textMax) errors.push(`${at}: text longer than ${lim.textMax}`)
      if (tokens > lim.maxTokens) errors.push(`${at}: more than ${lim.maxTokens} words`)
    }
    if (c.type === 'word') {
      if (tokens !== 1) errors.push(`${at}: word must be a single token`)
      if (c.text.length > lim.wordMax) errors.push(`${at}: word longer than ${lim.wordMax}`)
    } else if (c.type === 'phrase' || c.type === 'idiom') {
      if (tokens < 2) errors.push(`${at}: ${c.type} must have at least two words`)
    } else errors.push(`${at}: unknown type "${String(c.type)}"`)

    if (!c.id) errors.push(`${at}: empty id`)
    else if (ids.has(c.id)) errors.push(`${at}: duplicate id ${c.id}`)
    ids.add(c.id)
    const key = chapterKey(c.text)
    if (keys.has(key)) errors.push(`${at}: duplicate or variant of another chapter`)
    keys.add(key)

    if (!c.ipa?.trim()) errors.push(`${at}: empty ipa`)
    if (!c.meaning?.trim()) errors.push(`${at}: empty meaning`)
    else if (c.meaning.length > lim.meaningMax)
      errors.push(`${at}: meaning longer than ${lim.meaningMax}`)
    if (!Number.isInteger(c.frequencyRank) || c.frequencyRank < 1)
      errors.push(`${at}: invalid frequencyRank`)

    if (!c.examples?.length) errors.push(`${at}: no examples`)
    else if (c.examples.length > lim.examplesMax)
      errors.push(`${at}: more than ${lim.examplesMax} examples`)
    for (const ex of c.examples ?? []) {
      if (ex.length < lim.exampleMin || ex.length > lim.exampleMax)
        errors.push(`${at}: example length out of range: "${ex}"`)
      if (!containsTarget(ex, c.text)) errors.push(`${at}: example lacks the target: "${ex}"`)
    }
    if (new Set(c.examples).size !== c.examples?.length) errors.push(`${at}: repeated example`)

    if (!c.source?.trim()) errors.push(`${at}: empty source`)
    if (!c.sourceUrl?.startsWith('https://')) errors.push(`${at}: invalid sourceUrl`)
    if (!ALLOWED_LICENSES.includes(c.license))
      errors.push(`${at}: license "${c.license}" is not allowed`)
  }
  return errors
}
