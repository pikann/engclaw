import type { ChapterType } from './content'

/** Fields the difficulty rule reads; a `Chapter` satisfies this. */
export interface DifficultyInput {
  text: string
  type: ChapterType
  ipa: string
  frequencyRank: number
}

export interface Ranking {
  /** 0 (easiest) to 100 (hardest). */
  difficulty: number
  /** 1-based position in the global easy-to-hard order. */
  order: number
  /** 1-based world the chapter belongs to; worlds are contiguous in `order`. */
  world: number
}

export const RANK_LIMIT = 50_001

export const DIFFICULTY_WEIGHTS = {
  frequency: 0.3,
  length: 0.2,
  sounds: 0.18,
  clusters: 0.1,
  stress: 0.08,
  weakForms: 0.04,
  type: 0.1,
}

export const TYPE_DIFFICULTY: Record<ChapterType, number> = { word: 0, phrase: 0.5, idiom: 1 }

/**
 * Human-rated error rate per phoneme for L2 English speakers (speechocean762, train + test,
 * `scripts/data/extract-so762-errors.py`), keyed by ARPAbet symbol. Mean over all phones is
 * about 0.065; values are rounded and rare phones shrunk towards the mean.
 */
export const PHONE_ERROR_RATE: Record<string, number> = {
  ZH: 0.09,
  TH: 0.16,
  Z: 0.136,
  EY: 0.125,
  EH: 0.117,
  UH: 0.109,
  ER: 0.108,
  OY: 0.085,
  AW: 0.099,
  AO: 0.097,
  SH: 0.094,
  AH: 0.087,
  OW: 0.086,
  R: 0.086,
  V: 0.082,
  UW: 0.079,
  NG: 0.078,
  DH: 0.076,
  L: 0.073,
  D: 0.071,
  IY: 0.07,
  AA: 0.07,
  CH: 0.069,
  JH: 0.067,
  AY: 0.066,
  IH: 0.065,
  AE: 0.063,
  N: 0.057,
  M: 0.053,
  T: 0.052,
  S: 0.046,
  P: 0.043,
  K: 0.038,
  W: 0.036,
  F: 0.032,
  G: 0.027,
  HH: 0.027,
  B: 0.021,
  Y: 0.021,
}

const MEAN_PHONE_ERROR = 0.065

const IPA_TO_ARPA: Record<string, string> = {
  p: 'P',
  b: 'B',
  t: 'T',
  d: 'D',
  k: 'K',
  ɡ: 'G',
  tʃ: 'CH',
  dʒ: 'JH',
  f: 'F',
  v: 'V',
  θ: 'TH',
  ð: 'DH',
  s: 'S',
  z: 'Z',
  ʃ: 'SH',
  ʒ: 'ZH',
  h: 'HH',
  m: 'M',
  n: 'N',
  ŋ: 'NG',
  l: 'L',
  ɹ: 'R',
  j: 'Y',
  w: 'W',
  i: 'IY',
  ɪ: 'IH',
  ɛ: 'EH',
  æ: 'AE',
  ɑ: 'AA',
  ɔ: 'AO',
  ʊ: 'UH',
  u: 'UW',
  ʌ: 'AH',
  ə: 'AH',
  ɝ: 'ER',
  ɚ: 'ER',
  aɪ: 'AY',
  aʊ: 'AW',
  eɪ: 'EY',
  oʊ: 'OW',
  ɔɪ: 'OY',
}

const VOWEL_ARPA = new Set([
  'IY',
  'IH',
  'EH',
  'AE',
  'AA',
  'AO',
  'UH',
  'UW',
  'AH',
  'ER',
  'AY',
  'AW',
  'EY',
  'OW',
  'OY',
])

interface Phone {
  arpa: string
  vowel: boolean
  /** 0 unstressed, 1 primary, 2 secondary */
  stress: 0 | 1 | 2
}

const PHONE_TOKEN = /tʃ|dʒ|aɪ|aʊ|eɪ|oʊ|ɔɪ|[^ˈˌ\s]/gu

function parseWord(ipa: string): Phone[] {
  const phones: Phone[] = []
  let stress: 0 | 1 | 2 = 0
  let pendingStress: 0 | 1 | 2 = 0
  for (const m of ipa.matchAll(new RegExp(`[ˈˌ]|${PHONE_TOKEN.source}`, 'gu'))) {
    const token = m[0]
    if (token === 'ˈ') pendingStress = 1
    else if (token === 'ˌ') pendingStress = 2
    else {
      const arpa = IPA_TO_ARPA[token]
      if (!arpa) continue
      const vowel = VOWEL_ARPA.has(arpa)
      if (vowel) {
        stress = pendingStress
        pendingStress = 0
      }
      phones.push({ arpa, vowel, stress: vowel ? stress : 0 })
    }
  }
  return phones
}

export interface DifficultyComponents {
  frequency: number
  length: number
  sounds: number
  clusters: number
  stress: number
  weakForms: number
  type: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Each component is normalised to 0..1 (1 = hardest). */
export function difficultyComponents(c: DifficultyInput): DifficultyComponents {
  const words = c.ipa.split(/\s+/).filter(Boolean).map(parseWord)
  const phoneCount = words.reduce((n, w) => n + w.length, 0)

  let soundExcess = 0
  let clusters = 0
  let stressLoad = 0
  let weak = 0
  for (const w of words) {
    let run = 0
    let syllables = 0
    let primaryAt = 0
    let secondary = false
    for (const p of w) {
      const rate = PHONE_ERROR_RATE[p.arpa] ?? MEAN_PHONE_ERROR
      soundExcess += Math.max(0, rate / MEAN_PHONE_ERROR - 1)
      if (p.vowel) {
        syllables++
        if (p.stress === 1 && !primaryAt) primaryAt = syllables
        if (p.stress === 2) secondary = true
        clusters += Math.max(0, run - 1)
        run = 0
      } else run++
    }
    clusters += Math.max(0, run - 1)
    if (syllables >= 2) stressLoad += (primaryAt > 1 ? 1 : 0) + (syllables >= 3 ? 1 : 0)
    if (secondary) stressLoad++
    if (words.length > 1 && !w.some((p) => p.vowel && p.stress > 0)) weak++
  }

  return {
    frequency: clamp01(Math.log(Math.max(1, c.frequencyRank)) / Math.log(RANK_LIMIT)),
    length: clamp01((phoneCount + 2 * (words.length - 1)) / 24),
    sounds: clamp01(soundExcess / 4),
    clusters: clamp01(clusters / 4),
    stress: clamp01(stressLoad / 4),
    weakForms: clamp01(weak / 3),
    type: TYPE_DIFFICULTY[c.type],
  }
}

export function difficultyOf(c: DifficultyInput, weights = DIFFICULTY_WEIGHTS): number {
  const parts = difficultyComponents(c)
  let total = 0
  for (const key of Object.keys(weights) as (keyof DifficultyComponents)[])
    total += weights[key] * parts[key]
  return Math.round(total * 100 * 1000) / 1000
}

export const WORLD_SIZE = { min: 50, target: 75, max: 100 }

/** Sizes of consecutive worlds: as equal as possible, each within [min, max] when total allows. */
export function worldSizes(total: number): number[] {
  if (total <= 0) return []
  const count = Math.max(1, Math.round(total / WORLD_SIZE.target))
  const base = Math.floor(total / count)
  const extra = total % count
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * Deterministic easy-to-hard order: by difficulty, then by frequency rank (more common first),
 * then by id. Worlds are contiguous runs of the order.
 */
export function rankChapters<T extends DifficultyInput & { id: string }>(
  chapters: T[],
  weights = DIFFICULTY_WEIGHTS,
): Map<string, Ranking> {
  const scored = chapters.map((c) => ({ c, difficulty: difficultyOf(c, weights) }))
  scored.sort(
    (a, b) =>
      a.difficulty - b.difficulty ||
      a.c.frequencyRank - b.c.frequencyRank ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
  )
  const sizes = worldSizes(scored.length)
  const result = new Map<string, Ranking>()
  let world = 0
  let left = 0
  scored.forEach((s, i) => {
    if (left === 0) left = sizes[world++]!
    left--
    result.set(s.c.id, { difficulty: s.difficulty, order: i + 1, world })
  })
  return result
}

/** Largest difficulty step between two consecutive chapters of the order. */
export function maxNeighbourJump(ranks: Iterable<Ranking>): number {
  const sorted = [...ranks].sort((a, b) => a.order - b.order)
  let max = 0
  for (let i = 1; i < sorted.length; i++)
    max = Math.max(max, sorted[i]!.difficulty - sorted[i - 1]!.difficulty)
  return max
}
