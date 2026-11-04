/** Phone alignment and comparison (port of OpenPronounce `phones.py`: `_align` .. `compare_phones`). */

import { levenshtein, opcodes } from './levenshtein'
import { normalizePhone, normalizePhones } from './normalize'

export const PHONE_ERROR_THRESHOLD = 0.4
export const PHONE_ERROR_MIN_EDITS = 2
export const NEAR_PHONE_COST = 0.5
export const FINAL_EXTRA_COST = 0.25
export const FINAL_DELETION_COST = 0.5
export const PHONE_PLAUSIBLE_POSTERIOR = 0.05

const NEAR_PHONES: Record<string, string[][]> = {
  en: [
    ['ɪ', 'i'],
    ['ʊ', 'u'],
    ['ɛ', 'æ'],
    ['ʌ', 'ɑ', 'ə', 'a'],
    ['æ', 'a'],
    ['ɛ', 'eɪ'],
    ['ð', 'z', 'd'],
    ['θ', 's', 't'],
    ['b', 'p'],
    ['d', 't'],
    ['ɡ', 'k'],
    ['z', 's'],
    ['v', 'f'],
    ['ʒ', 'ʃ'],
    ['dʒ', 'tʃ'],
    ['n', 'ŋ'],
    ['h', 'x'],
    ['ɹ', 'r'],
    ['v', 'w'],
  ],
}

/** Function words with several accepted pronunciations (already normalized). */
export const ALTERNATE_PRONUNCIATIONS: Record<string, Record<string, string[][]>> = {
  en: {
    a: [['ə'], ['eɪ']],
    an: [['ən'], ['æn']],
    the: [
      ['ð', 'ə'],
      ['ð', 'i'],
      ['ð', 'ɪ'],
    ],
    to: [
      ['t', 'ə'],
      ['t', 'u'],
    ],
    of: [
      ['ʌ', 'v'],
      ['ə', 'v'],
    ],
    and: [
      ['æ', 'n', 'd'],
      ['ə', 'n', 'd'],
      ['ə', 'n'],
    ],
    for: [
      ['f', 'ɔ', 'ɹ'],
      ['f', 'ɚ'],
    ],
    you: [
      ['j', 'u'],
      ['j', 'ə'],
    ],
    are: [['ɑ', 'ɹ'], ['ɚ']],
    was: [
      ['w', 'ʌ', 'z'],
      ['w', 'ə', 'z'],
    ],
    that: [
      ['ð', 'æ', 't'],
      ['ð', 'ə', 't'],
    ],
    can: [
      ['k', 'æ', 'n'],
      ['k', 'ə', 'n'],
    ],
    have: [
      ['h', 'æ', 'v'],
      ['h', 'ə', 'v'],
    ],
    or: [['ɔ', 'ɹ'], ['ɚ']],
  },
}

/** Phones recognized in a waveform together with the frame posteriors they came from. */
export interface PhoneRecognition {
  /** Normalized phones. */
  phones: string[]
  /** Peak posterior of each phone, 0-1. */
  confidences: number[]
  /** `[start, end)` frame span of each phone. */
  spans: [number, number][]
  /** Flat `(frames, vocab.length)` log posteriors. */
  logPosteriors: Float32Array
  frames: number
  /** Token string by id. */
  vocab: string[]
}

export interface PhoneReport {
  expected: string
  heard: string
  confidence: number
}

export interface WordReport {
  position: number
  word: string
  expected: string[]
  actual: string[]
  distance: number
  phones: PhoneReport[]
  weightedEdits: number
}

export interface WordError {
  position: number
  word: string
  expected: string
  actual: string
  actualWord: string
  phoneDistance: number
  confidence: number
  phones: PhoneReport[]
}

export interface PhoneComparison {
  expectedPhones: string[][]
  heardPhones: string[]
  heardPhonesConfidence: number[]
  phoneErrorRate: number
  errors: WordError[]
  wordsWithErrors: string[]
}

const isSpecial = (token: string) => token.startsWith('<') && token.endsWith('>')
const round = (x: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(x * f) / f
}
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Split reference text into lowercase words, as the phonemizer step expects (`\b[\w']+\b`). */
export function splitWords(text: string): string[] {
  return (text.match(/\b[\w']+\b/g) ?? []).map((w) => w.toLowerCase())
}

/** Map every expected phone index to the heard phone indices it aligns with (insertions go to the previous phone). */
export function align(expected: readonly string[], heard: readonly string[]): Set<number>[] {
  const alignment = expected.map(() => new Set<number>())
  for (const [tag, i1, i2, j1, j2] of opcodes(expected, heard)) {
    if (tag === 'equal') {
      for (let k = 0; k < i2 - i1; k++) alignment[i1 + k]!.add(j1 + k)
    } else if (tag === 'replace') {
      const lenI = i2 - i1
      const lenJ = j2 - j1
      for (let k = i1; k < i2; k++) {
        const start = j1 + Math.trunc(((k - i1) * lenJ) / lenI)
        const end = j1 + Math.trunc(((k - i1 + 1) * lenJ) / lenI)
        if (start === end) alignment[k]!.add(Math.min(start, j2 - 1))
        else for (let l = start; l < end; l++) alignment[k]!.add(l)
      }
    } else if (tag === 'insert') {
      const k = i1 > 0 ? i1 - 1 : i1
      if (k < alignment.length) for (let l = j1; l < j2; l++) alignment[k]!.add(l)
    }
  }
  return alignment
}

/** Accepted phone sequences for a word: expected, its alternates, and the cross-word merged form. */
export function pronunciations(
  word: string,
  expectedSeg: readonly string[],
  previousLastPhone: string | null = null,
  lang = 'en',
): string[][] {
  const alternates = ALTERNATE_PRONUNCIATIONS[lang]?.[word] ?? []
  const candidates = [[...expectedSeg], ...alternates.map((alt) => normalizePhones(alt, lang))]
  if (previousLastPhone !== null && expectedSeg.length > 1 && expectedSeg[0] === previousLastPhone)
    candidates.push(expectedSeg.slice(1))
  return candidates
}

function substitutionCost(expected: string, heard: string, lang: string): number {
  for (const group of NEAR_PHONES[lang] ?? [])
    if (group.includes(expected) && group.includes(heard)) return NEAR_PHONE_COST
  return 1
}

const tokenIdCache = new WeakMap<string[], Map<string, Map<string, number[]>>>()
function tokenIdsByPhone(vocab: string[], lang: string): Map<string, number[]> {
  let byLang = tokenIdCache.get(vocab)
  if (!byLang) tokenIdCache.set(vocab, (byLang = new Map()))
  let ids = byLang.get(lang)
  if (!ids) {
    ids = new Map()
    vocab.forEach((token, index) => {
      if (isSpecial(token)) return
      const phone = normalizePhone(token, lang)
      const list = ids!.get(phone)
      if (list) list.push(index)
      else ids!.set(phone, [index])
    })
    byLang.set(lang, ids)
  }
  return ids
}

/** Highest posterior of `phone` (any of its tokens) over frames `[start, end)`; 0 without posteriors. */
function plausibility(
  rec: PhoneRecognition | null,
  phone: string,
  start: number,
  end: number,
  lang: string,
): number {
  if (!rec || end <= start) return 0
  const ids = tokenIdsByPhone(rec.vocab, lang).get(phone)
  if (!ids) return 0
  const size = rec.vocab.length
  let max = -Infinity
  for (let f = start; f < end; f++)
    for (const id of ids) max = Math.max(max, rec.logPosteriors[f * size + id]!)
  return Math.exp(max)
}

/** Per-phone report of one word: how sure we are that each expected phone was mispronounced. */
export function phoneReports(
  candidate: readonly string[],
  actual: readonly string[],
  matched: readonly number[],
  rec: PhoneRecognition | null,
  region: readonly [number, number],
  lang = 'en',
): PhoneReport[] {
  const local = align(candidate, actual)
  const frames = (j: number): [number, number] => (rec ? rec.spans[matched[j]!]! : [0, 0])
  const last = candidate.length - 1
  return candidate.map((expected, k) => {
    const heardIndices = [...local[k]!].sort((x, y) => x - y)
    const heard = heardIndices.map((j) => actual[j]!)
    let confidence: number
    if (heard.length === 1 && heard[0] === expected) confidence = 0
    else if (heard.includes(expected)) confidence = k === last ? FINAL_EXTRA_COST : 1
    else {
      let cost: number
      let start: number
      let end: number
      if (heard.length) {
        cost = Math.max(...heard.map((h) => substitutionCost(expected, h, lang)))
        start = Math.min(...heardIndices.map((j) => frames(j)[0]))
        end = Math.max(...heardIndices.map((j) => frames(j)[1]))
      } else {
        cost = k === last ? FINAL_DELETION_COST : 1
        const previous = local.slice(0, k).flatMap((s) => [...s])
        const following = local.slice(k + 1).flatMap((s) => [...s])
        start = previous.length ? frames(Math.max(...previous))[0] : region[0]
        end = following.length ? frames(Math.min(...following))[1] : region[1]
      }
      const p = plausibility(rec, expected, start, end, lang)
      confidence = cost * (1 - Math.min(1, p / PHONE_PLAUSIBLE_POSTERIOR))
    }
    return { expected, heard: heard.join(''), confidence }
  })
}

const isRecognition = (h: readonly string[] | PhoneRecognition): h is PhoneRecognition =>
  !Array.isArray(h)

/**
 * Compare what was heard with the expected phones word by word.
 * `words` / `groups` are the reference words and their normalized phones (phonemizer output).
 */
export function wordReports(
  heardPhones: readonly string[] | PhoneRecognition,
  words: readonly string[],
  groups: readonly (readonly string[])[],
  lang = 'en',
): WordReport[] {
  const rec = isRecognition(heardPhones) ? heardPhones : null
  const heard = rec ? rec.phones : (heardPhones as readonly string[])
  const expected = groups.flat()
  const alignment = align(expected, heard)

  const reports: WordReport[] = []
  let offset = 0
  let previousLastPhone: string | null = null
  words.forEach((word, position) => {
    const group = groups[position]!
    if (!group.length) return
    const first = offset
    const end = offset + group.length
    offset = end
    const matchedSet = new Set<number>()
    for (let i = first; i < end; i++) for (const j of alignment[i]!) matchedSet.add(j)
    const matched = [...matchedSet].sort((x, y) => x - y)
    const actual = matched.map((j) => heard[j]!)

    const candidates = pronunciations(word, group, previousLastPhone, lang)
    const distances = candidates.map((c) => levenshtein(c, actual))
    const distance = Math.min(...distances)
    const candidate = candidates[distances.indexOf(distance)]!
    previousLastPhone = group[group.length - 1]!

    let region: [number, number] = [0, 0]
    if (rec) {
      if (matched.length) region = [rec.spans[matched[0]!]![0], rec.spans[matched.at(-1)!]![1]]
      else {
        const before = alignment.slice(0, first).flatMap((s) => [...s])
        const after = alignment.slice(end).flatMap((s) => [...s])
        region = [
          before.length ? rec.spans[Math.max(...before)]![0] : 0,
          after.length ? rec.spans[Math.min(...after)]![1] : rec.frames,
        ]
      }
    }
    const phones = distance ? phoneReports(candidate, actual, matched, rec, region, lang) : []
    reports.push({
      position,
      word,
      expected: [...group],
      actual,
      distance,
      phones,
      weightedEdits: sum(phones.map((p) => p.confidence)),
    })
  })
  return reports
}

/** Port of `compare_phones`: PER, flagged words and per-phone error confidences. */
export function comparePhones(
  heardPhones: readonly string[] | PhoneRecognition,
  words: readonly string[],
  groups: readonly (readonly string[])[],
  lang = 'en',
): PhoneComparison {
  const rec = isRecognition(heardPhones) ? heardPhones : null
  const heard = rec ? rec.phones : (heardPhones as readonly string[])
  const heardConfidences = rec ? rec.confidences : heard.map(() => 1)
  const expected = groups.flat()
  const phoneErrorRate = expected.length
    ? levenshtein(expected, heard) / expected.length
    : heard.length
      ? 1
      : 0

  const errors: WordError[] = []
  const wordsWithErrors: string[] = []
  for (const report of wordReports(heardPhones, words, groups, lang)) {
    const edits = report.weightedEdits
    const length = report.expected.length
    if (
      report.distance &&
      (edits / length >= PHONE_ERROR_THRESHOLD || edits >= PHONE_ERROR_MIN_EDITS)
    ) {
      errors.push({
        position: report.position,
        word: report.word,
        expected: report.expected.join(''),
        actual: report.actual.join(''),
        actualWord: '',
        phoneDistance: report.distance,
        confidence: round(Math.min(1, Math.max(edits / length, edits / PHONE_ERROR_MIN_EDITS)), 3),
        phones: report.phones.map((p) => ({ ...p, confidence: round(p.confidence, 3) })),
      })
      wordsWithErrors.push(report.word)
    }
  }
  return {
    expectedPhones: groups.map((g) => [...g]),
    heardPhones: [...heard],
    heardPhonesConfidence: heardConfidences.map((c) => round(c, 3)),
    phoneErrorRate: round(phoneErrorRate, 4),
    errors,
    wordsWithErrors,
  }
}
