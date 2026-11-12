export type Grade = 'correct' | 'near' | 'wrong'

/** One whitespace-separated piece of a sentence; `word` is empty for pieces like a lone dash. */
export interface Token {
  before: string
  word: string
  after: string
}

const WORD_CHARS = /[\p{L}\p{N}]/u
const EDGE = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su

export function tokenizeSentence(text: string): Token[] {
  const pieces = /\p{Script=Han}/u.test(text)
    ? Array.from(
        new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text),
        (part) => part.segment,
      ).filter((part) => part.trim())
    : text.split(/\s+/)
  return pieces.filter(Boolean).map((raw) => {
    if (!WORD_CHARS.test(raw)) return { before: '', word: '', after: raw }
    const m = EDGE.exec(raw)!
    return { before: m[1]!, word: m[2]!, after: m[3]! }
  })
}

export const DEFAULT_BLANK_PERCENT = 30
export const BLANK_PERCENT_OPTIONS = [10, 20, 30, 50, 70, 100] as const

/** How many words to hide: the ratio of the words, at least one, and one only for short segments. */
export function blankCount(words: number, percent: number): number {
  if (words <= 0) return 0
  if (words < 3) return 1
  return Math.min(words, Math.max(1, Math.round((words * percent) / 100)))
}

/** Small deterministic generator so blanks can be reproduced and tested. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Token indices to hide, in reading order. */
export function makeBlanks(text: string, percent: number, random: () => number): number[] {
  const candidates = tokenizeSentence(text).flatMap((t, i) => (t.word ? [i] : []))
  const pool = [...candidates]
  const picked: number[] = []
  for (let n = blankCount(pool.length, percent); n > 0; n--) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!)
  }
  return picked.sort((a, b) => a - b)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, '')
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]!
}

/** Edits tolerated in a near miss: none for words under 4 letters, 1 up to 7, 2 beyond. */
function nearLimit(length: number): number {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0
}

/** Case- and punctuation-insensitive; a small edit distance is a near miss. */
export function gradeAnswer(answer: string, expected: string): Grade {
  const a = normalize(answer)
  const e = normalize(expected)
  if (!a) return 'wrong'
  if (a === e) return 'correct'
  if (/\p{N}/u.test(e)) return 'wrong'
  return editDistance(a, e) <= nearLimit(e.length) ? 'near' : 'wrong'
}

/** What was checked for one segment, one entry per blank in reading order. */
export interface SegmentResult {
  grades: Grade[]
  answers: string[]
  expected: string[]
}

const isRight = (g: Grade) => g !== 'wrong'

export function scoreSegment(r: SegmentResult): number {
  return r.grades.length ? r.grades.filter(isRight).length / r.grades.length : 0
}

export interface SessionScore {
  right: number
  total: number
  checked: number
  ratio: number
}

export function sessionScore(results: ReadonlyMap<number, SegmentResult>): SessionScore {
  let right = 0
  let total = 0
  for (const r of results.values()) {
    right += r.grades.filter(isRight).length
    total += r.grades.length
  }
  return { right, total, checked: results.size, ratio: total ? right / total : 0 }
}

export interface ReviewItem {
  segment: number
  expected: string
  answered: string
}

export function reviewList(results: ReadonlyMap<number, SegmentResult>): ReviewItem[] {
  return [...results.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([segment, r]) =>
      r.grades.flatMap((g, i) =>
        g === 'wrong' ? [{ segment, expected: r.expected[i]!, answered: r.answers[i]! }] : [],
      ),
    )
}
