/**
 * IPA phone -> mouth shape. Port of OpenPronounce `viseme.js` (MIT); the mouth images are the
 * HunanBean CMU39 set from papagayo-ng (see assets/mouths/README.md). Pure: no DOM.
 */

export type Viseme = string

const VISEMES: Record<string, Viseme> = {
  b: 'B',
  p: 'P',
  m: 'M',
  tʃ: 'CH',
  dʒ: 'JH',
  d: 'D',
  t: 'T',
  ɾ: 'D',
  ð: 'DH',
  θ: 'TH',
  f: 'F',
  v: 'V',
  g: 'G',
  ɡ: 'G',
  k: 'K',
  h: 'H',
  ɦ: 'HH',
  j: 'Y',
  l: 'L',
  ɹ: 'R',
  r: 'R',
  ʁ: 'R',
  n: 'N',
  ŋ: 'NG',
  ɲ: 'N',
  s: 'S',
  z: 'Z',
  ʃ: 'SH',
  ʒ: 'ZH',
  w: 'W',
  ə: 'AH',
  ʌ: 'AH',
  ɐ: 'AH',
  a: 'AE',
  æ: 'AE',
  ɑ: 'AA',
  ɒ: 'AA',
  o: 'AO',
  ɔ: 'AO',
  i: 'IY',
  ɪ: 'IH',
  y: 'IY',
  e: 'EH',
  ɛ: 'EH',
  ø: 'EH',
  œ: 'EH',
  u: 'UW',
  ʊ: 'UH',
  ɜ: 'ER',
  ɝ: 'ER',
  ɚ: 'ER',
  eɪ: 'EY',
  aɪ: 'AY',
  ɔɪ: 'OY',
  oʊ: 'OW',
  əʊ: 'OW',
  aʊ: 'AW',
}

/** Compound phones split into the parts that have a mouth shape. */
const COMPOUNDS: Record<string, string[]> = {
  eə: ['e', 'ə'],
  ɪə: ['ɪ', 'ə'],
  ʊə: ['ʊ', 'ə'],
  oɹ: ['o', 'ɹ'],
  ɑɹ: ['ɑ', 'ɹ'],
  ju: ['j', 'u'],
}

/** Rough per-phone length in ms, used to pace the animation. */
const DURATIONS: Record<string, number> = {
  b: 100,
  p: 100,
  m: 120,
  tʃ: 150,
  dʒ: 150,
  d: 100,
  t: 80,
  ð: 120,
  θ: 120,
  f: 100,
  v: 100,
  g: 100,
  ɡ: 100,
  k: 100,
  h: 80,
  j: 120,
  l: 130,
  ɹ: 130,
  n: 120,
  ŋ: 130,
  s: 90,
  z: 90,
  ʃ: 150,
  ʒ: 150,
  w: 120,
  ə: 100,
  a: 150,
  o: 150,
  i: 140,
  e: 140,
  ɪ: 130,
  u: 160,
  ʊ: 130,
  ɑ: 250,
  eɪ: 250,
  oʊ: 250,
  aɪ: 280,
  aʊ: 300,
  ɔɪ: 280,
}
const DEFAULT_MS = 200
const MIN_STEP_MS = 150

export const REST: Viseme = 'rest'

const clean = (s: string): string => s.replace(/[ːˈˌ.]/g, '')

export const visemeFor = (phone: string): Viseme => VISEMES[clean(phone)] ?? REST

/** Split a phone (or an unseparated run of phones) into parts that each have a mouth shape. */
export function splitPhones(group: string): string[] {
  const g = clean(group)
  if (VISEMES[g]) return [g]
  if (COMPOUNDS[g]) return COMPOUNDS[g]
  const out: string[] = []
  for (let i = 0; i < g.length;) {
    const two = g.slice(i, i + 2)
    if (COMPOUNDS[two]) {
      out.push(...COMPOUNDS[two])
      i += 2
    } else if (VISEMES[two]) {
      out.push(two)
      i += 2
    } else {
      out.push(g.charAt(i))
      i += 1
    }
  }
  return out.length ? out : [g]
}

export const phoneDuration = (phone: string): number => DURATIONS[clean(phone)] ?? DEFAULT_MS

export const wordDuration = (phones: readonly string[]): number =>
  phones.flatMap(splitPhones).reduce((sum, p) => sum + phoneDuration(p), 0)

export interface VisemeFrame {
  viseme: Viseme
  ms: number
}

/** Timed mouth shapes for a list of phones; always ends on the rest pose. */
export function visemeFrames(phones: readonly string[]): VisemeFrame[] {
  const frames = phones.flatMap(splitPhones).map((p) => ({
    viseme: visemeFor(p),
    ms: Math.max(MIN_STEP_MS, phoneDuration(p)),
  }))
  return [...frames, { viseme: REST, ms: 0 }]
}
