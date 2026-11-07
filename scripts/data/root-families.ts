import { expandForms, PREFIXES, type RootEntry } from './morphemes'
import type { WiktextractEntry } from './wiktextract-etymology'

/** Latin and Greek source languages whose terms identify a root's family. */
const SOURCE_LANGS = new Set(['la', 'la-lat', 'la-med', 'la-new', 'la-vul', 'grc', 'el'])
const CHAIN = new Set([
  'inh',
  'inh+',
  'der',
  'der+',
  'uder',
  'derived',
  'bor',
  'bor+',
  'lbor',
  'slb',
  'cal',
  'calque',
])
/** Prefix marking a Proto-Indo-European root used as a seed, e.g. "pie:*speḱ-". */
const PIE = 'pie:'
const AFFIX = new Set([
  'af',
  'affix',
  'suffix',
  'prefix',
  'confix',
  'compound',
  'com',
  'surf',
  'surface analysis',
])
/** A seed shared by this many roots is too generic (prepositions, common affixes) to define a family. */
const MAX_ROOTS_PER_SEED = 20
const MIN_FAMILY_WORD_LENGTH = 3
const MAX_ANCESTOR_DEPTH = 4
const MIN_EXPANDED_FORM_LENGTH = 3

export interface Lineage {
  /** Normalised Latin/Greek terms named in the word's etymology. */
  seeds: Set<string>
  /** English words (lowercase) the word is built from, e.g. "captivate" for "captivating". */
  parents: Set<string>
}

export const normTerm = (raw: string): string =>
  raw
    .replace(/<[^>]*>/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()

const isHyphenated = (raw: string) => /^-|-$/.test(raw.trim())

/** Splits "la:capere" style language prefixes used inside affix templates. */
function splitLang(raw: string, defaultLang: string): [string, string] {
  const m = /^([a-z]{2,3}(?:-[a-z]{2,3})?):(.+)$/.exec(raw)
  return m ? [m[1]!, m[2]!] : [defaultLang, raw]
}

export function extractLineage(entry: WiktextractEntry, affixSink?: Set<string>): Lineage | null {
  const seeds = new Set<string>()
  const parents = new Set<string>()
  const add = (lang: string, raw: string) => {
    const hyphenated = isHyphenated(raw)
    const term = normTerm(raw).replace(/^-+|-+$/g, '')
    if (!term || /\s/.test(term)) return
    if (SOURCE_LANGS.has(lang)) {
      if (hyphenated) affixSink?.add(term)
      else seeds.add(term)
    } else if (lang === 'en' && !hyphenated && /^[a-z]+$/.test(term)) parents.add(term)
  }
  for (const t of entry.etymology_templates ?? []) {
    const args = t.args
    if (!t.name || !args) continue
    if (t.name === 'root' && args['2'] === 'ine-pro' && args['3']) {
      const term = normTerm(args['3'])
      if (term) seeds.add(PIE + term)
    } else if (
      t.name === 'ety' &&
      /^:(?:inh|der|bor|lbor|learned borrowing|calque|slb|uder)/.test(args['2'] ?? '')
    ) {
      // Nested chain: "enm:respect<ety:bor<fro:respect<ety:inh<la:respectus>>>>"
      for (const m of (args['3'] ?? '').matchAll(/(?:^|<)([a-z]{2,3}(?:-[a-z]+)?):([^<>:]+)/g)) {
        if (m[1] !== 'ety') add(m[1]!, m[2]!)
      }
    } else if (
      t.name === 'ety' &&
      /^:(?:af|affix|suffix|prefix|confix|compound|com|surf)$/.test(args['2'] ?? '')
    ) {
      // Newer Wiktionary form: {{ety|lang|:af|part1|part2}} — terms start at the third argument.
      const lang = args['1'] ?? 'en'
      for (let i = 3; args[String(i)] !== undefined; i++) {
        const [l, term] = splitLang(args[String(i)]!, lang)
        add(l, term)
      }
    } else if (CHAIN.has(t.name)) {
      if (args['2'] && args['3']) add(args['2'], args['3'])
    } else if (AFFIX.has(t.name)) {
      const lang = args['1'] ?? 'en'
      for (let i = 2; args[String(i)] !== undefined; i++) {
        const [l, term] = splitLang(args[String(i)]!, args[`lang${i - 1}`] ?? lang)
        add(l, term)
      }
    }
  }
  return seeds.size || parents.size ? { seeds, parents } : null
}

/** Merges the lineage of every English entry per word (homographs have several etymologies). */
export function collectLineages(
  entries: Iterable<WiktextractEntry>,
  affixSink?: Set<string>,
): Map<string, Lineage> {
  const map = new Map<string, Lineage>()
  for (const entry of entries) addEntry(map, entry, affixSink)
  return map
}

export function addEntry(
  map: Map<string, Lineage>,
  entry: WiktextractEntry,
  affixSink?: Set<string>,
): void {
  const word = entry.word
  if (entry.lang_code !== 'en' || !word || !/^[a-z]+$/.test(word)) return
  const lineage = extractLineage(entry, affixSink)
  if (!lineage) return
  const existing = map.get(word)
  if (!existing) map.set(word, lineage)
  else {
    for (const s of lineage.seeds) existing.seeds.add(s)
    for (const p of lineage.parents) existing.parents.add(p)
  }
}

/** Latin/Greek term -> the Latin/Greek terms its own etymology names (e.g. percipio -> capio). */
export type TermParents = Map<string, Set<string>>

export function addTermEntry(
  map: TermParents,
  entry: WiktextractEntry,
  affixSink?: Set<string>,
): void {
  if (!entry.lang_code || !SOURCE_LANGS.has(entry.lang_code) || !entry.word) return
  const term = normTerm(entry.word)
  if (!term || /\s/.test(term) || isHyphenated(entry.word)) return
  const lineage = extractLineage(entry, affixSink)
  if (!lineage) return
  const parents = map.get(term) ?? new Set<string>()
  for (const s of lineage.seeds) if (s !== term) parents.add(s)
  if (parents.size) map.set(term, parents)
}

/** Seeds plus every Latin/Greek ancestor reachable through termParents. */
export function expandSeeds(
  seeds: Iterable<string>,
  termParents: TermParents,
  memo = new Map<string, Set<string>>(),
): Set<string> {
  const closure = (start: string): Set<string> => {
    const cached = memo.get(start)
    if (cached) return cached
    const seen = new Set<string>()
    const walk = (term: string, depth: number) => {
      if (seen.has(term)) return
      seen.add(term)
      if (depth >= MAX_ANCESTOR_DEPTH) return
      for (const p of termParents.get(term) ?? []) walk(p, depth + 1)
    }
    walk(start, 0)
    memo.set(start, seen)
    return seen
  }
  const out = new Set<string>()
  for (const s of seeds) for (const t of closure(s)) out.add(t)
  return out
}

/** Latin/Greek terms behind a word, following English parents ("captivating" -> "captivate" -> captivus). */
export function resolveSeeds(
  word: string,
  lineages: Map<string, Lineage>,
  memo = new Map<string, Set<string>>(),
  visiting = new Set<string>(),
): Set<string> {
  const cached = memo.get(word)
  if (cached) return cached
  const result = new Set<string>()
  const lineage = lineages.get(word)
  if (lineage && !visiting.has(word)) {
    visiting.add(word)
    for (const s of lineage.seeds) result.add(s)
    for (const p of lineage.parents)
      for (const s of resolveSeeds(p, lineages, memo, visiting)) result.add(s)
    visiting.delete(word)
    memo.set(word, result)
  }
  return result
}

/** Same spelling rule as linkMorphemes: short forms must start the word, longer ones may appear anywhere. */
export function spellsForm(word: string, forms: string[]): boolean {
  return forms.some((f) => (f.length < 3 ? word.startsWith(f) : word.includes(f)))
}

export interface RootFamily {
  rootIndex: number
  root: string
  seeds: string[]
  words: string[]
}

export interface BuildFamiliesOptions {
  /** Only words in this set can join a family (the dictionary's own word list). */
  allowed: Set<string>
  /** Latin/Greek terms that are affixes, never family-defining. */
  affixTerms: Set<string>
  /** Etymologies of Latin/Greek terms, to reach the root lemma behind derived forms. */
  termParents?: TermParents
}

export function buildFamilies(
  roots: RootEntry[],
  lineages: Map<string, Lineage>,
  { allowed, affixTerms, termParents = new Map() }: BuildFamiliesOptions,
): RootFamily[] {
  const memo = new Map<string, Set<string>>()
  const expandMemo = new Map<string, Set<string>>()
  const wordSeeds = new Map<string, Set<string>>()
  const seedsOf = (w: string) => {
    let s = wordSeeds.get(w)
    if (!s) {
      s = expandSeeds(resolveSeeds(w, lineages, memo), termParents, expandMemo)
      wordSeeds.set(w, s)
    }
    return s
  }
  const forms = roots.map((r) => expandForms(r.root))

  // A root's seeds come from its example words whose spelling actually contains the root form.
  const rootSeeds = roots.map((r, i) => {
    const seeds = new Set<string>()
    for (const ex of r.examples) {
      const w = ex.toLowerCase()
      if (!spellsForm(w, forms[i]!)) continue
      for (const s of seedsOf(w)) seeds.add(s)
    }
    for (const s of [...seeds])
      if (affixTerms.has(s) || PREFIXES.has(s) || s.length <= 2) seeds.delete(s)
    return seeds
  })
  const rootsPerSeed = new Map<string, number>()
  for (const seeds of rootSeeds)
    for (const s of seeds) rootsPerSeed.set(s, (rootsPerSeed.get(s) ?? 0) + 1)
  for (const seeds of rootSeeds)
    for (const s of [...seeds])
      if ((rootsPerSeed.get(s) ?? 0) >= MAX_ROOTS_PER_SEED) seeds.delete(s)

  const candidates = [...allowed].filter(
    (w) => w.length >= MIN_FAMILY_WORD_LENGTH && lineages.has(w),
  )
  return roots.map((r, rootIndex) => {
    const seeds = rootSeeds[rootIndex]!
    const words = new Set<string>()
    for (const ex of r.examples) {
      const w = ex.toLowerCase()
      if (/^[a-z]+$/.test(w)) words.add(w)
    }
    // Prefix-like roots ("re", "a") match too many unrelated words, so they keep only their examples.
    if (
      seeds.size &&
      forms[rootIndex]!.some((f) => f.length >= MIN_EXPANDED_FORM_LENGTH && !PREFIXES.has(f))
    ) {
      for (const w of candidates) {
        if (words.has(w) || !spellsForm(w, forms[rootIndex]!)) continue
        for (const s of seedsOf(w)) {
          if (seeds.has(s)) {
            words.add(w)
            break
          }
        }
      }
    }
    return { rootIndex, root: r.root, seeds: [...seeds].sort(), words: [...words].sort() }
  })
}
