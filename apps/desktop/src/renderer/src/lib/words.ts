export interface TextPart {
  text: string
  /** Normalized form to look up, or null for whitespace, punctuation and numbers-only pieces. */
  word: string | null
}

const APOSTROPHES = /[’‘`´ʼ]/g
const LETTER = /\p{L}/u
// A word: letters/digits joined by single apostrophes or hyphens ("don't", "well-known").
const WORD = /[\p{L}\p{N}]+(?:['’‘`´ʼ-][\p{L}\p{N}]+)*/gu

export function normalizeWord(raw: string): string {
  return raw.replace(APOSTROPHES, "'").toLowerCase()
}

/** Splits text into plain and word parts that concatenate back to the original text. */
export function segmentText(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), word: null })
    parts.push({ text: m[0], word: LETTER.test(m[0]) ? normalizeWord(m[0]) : null })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), word: null })
  return parts
}

const SUFFIX_STEMS: [suffix: string, replacements: string[]][] = [
  ['ies', ['y']],
  ['ied', ['y']],
  ['es', ['', 'e']],
  ['s', ['']],
  ['ed', ['', 'e']],
  ['ing', ['', 'e']],
]

/** Surface form first, then simpler forms to try when the dictionary has no entry for it. */
export function lookupCandidates(word: string): string[] {
  const w = normalizeWord(word)
  const out = [w]
  const add = (c: string) => {
    if (c.length >= 2 && !out.includes(c)) out.push(c)
  }
  if (w.endsWith("'s")) add(w.slice(0, -2))
  if (w.endsWith("s'")) add(w.slice(0, -1))
  if (w.includes('-')) {
    const parts = w.split('-')
    for (const p of parts) add(p)
  }
  if (!w.includes("'") && !w.includes('-')) {
    for (const [suffix, replacements] of SUFFIX_STEMS) {
      if (!w.endsWith(suffix) || w.length - suffix.length < 3) continue
      const stem = w.slice(0, -suffix.length)
      for (const r of replacements) add(stem + r)
      // "running" -> "run", "stopped" -> "stop"
      if ((suffix === 'ing' || suffix === 'ed') && /(.)\1$/.test(stem)) add(stem.slice(0, -1))
    }
  }
  return out
}

/** The entry that best matches the first candidate that has an exact (case-insensitive) entry. */
export async function resolveWord(
  word: string,
  search: (query: string) => Promise<{ id: number; word: string }[]>,
): Promise<{ id: number; word: string } | null> {
  for (const candidate of lookupCandidates(word)) {
    const hits = await search(candidate)
    const exact = hits.find((h) => normalizeWord(h.word) === candidate)
    if (exact) return exact
  }
  return null
}
