export interface WordnetAntonym {
  word: string
  /** Inherited from the head synset of an adjective satellite, not stated on the sense itself. */
  indirect?: true
}

export interface WordnetSense {
  pos: string
  definition: string
  example?: string
  synonyms?: string[]
  antonyms?: WordnetAntonym[]
}

export interface WordnetEntry {
  word: string
  senses: WordnetSense[]
}

const VOWELS: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AH: 'ə',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  ER: 'ɚ',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'i',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u',
}

const STRESSED_VOWELS: Record<string, string> = { AH: 'ʌ', ER: 'ɝ' }

const CONSONANTS: Record<string, string> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'ɹ',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
}

const STOPS_AND_FRICATIVES = new Set(['P', 'B', 'T', 'D', 'K', 'G', 'F', 'TH'])
const S_CLUSTER_SECOND = new Set(['P', 'T', 'K', 'M', 'N', 'L', 'W', 'F'])
const LIQUIDS = new Set(['L', 'R', 'W'])

function isValidOnset(c: string[]): boolean {
  if (c.length === 1) return c[0] !== 'NG'
  if (c.length === 2) {
    const [a, b] = c as [string, string]
    if (a === 'S') return S_CLUSTER_SECOND.has(b)
    return STOPS_AND_FRICATIVES.has(a) && LIQUIDS.has(b) && !(['T', 'D'].includes(a) && b === 'L')
  }
  if (c.length === 3) {
    return c[0] === 'S' && ['P', 'T', 'K'].includes(c[1]!) && LIQUIDS.has(c[2]!)
  }
  return false
}

export function arpabetToIpa(phones: string[]): string {
  const parsed = phones.map((p) => {
    const m = /^([A-Z]+)([012])?$/.exec(p)
    if (!m) throw new Error(`Unknown ARPAbet phone: ${p}`)
    return { base: m[1]!, stress: m[2] }
  })
  const isVowel = (i: number) => parsed[i]!.base in VOWELS

  const marks = new Map<number, string>()
  for (const [i, p] of parsed.entries()) {
    if (!isVowel(i) || (p.stress !== '1' && p.stress !== '2')) continue
    let start = i
    while (start > 0 && !isVowel(start - 1)) start--
    while (start < i && !isValidOnset(parsed.slice(start, i).map((x) => x.base))) start++
    marks.set(start, p.stress === '1' ? 'ˈ' : 'ˌ')
  }

  let out = ''
  for (const [i, p] of parsed.entries()) {
    out += marks.get(i) ?? ''
    if (isVowel(i)) {
      const stressed = p.stress === '1' || p.stress === '2'
      out += (stressed && STRESSED_VOWELS[p.base]) || VOWELS[p.base]!
    } else {
      const c = CONSONANTS[p.base]
      if (!c) throw new Error(`Unknown ARPAbet phone: ${p.base}`)
      out += c
    }
  }
  return out
}

export function parseCmudict(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [rawWord, ...phones] = line.split('#')[0]!.trim().split(/\s+/)
    if (!rawWord || phones.length === 0) continue
    const word = rawWord.replace(/\(\d+\)$/, '').toLowerCase()
    const ipa = arpabetToIpa(phones)
    const list = map.get(word) ?? []
    if (!list.includes(ipa)) list.push(ipa)
    map.set(word, list)
  }
  return map
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16))
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10))
    return ENTITIES[e] ?? m
  })
}

export function parseWordnet(xml: string): { version: string; entries: WordnetEntry[] } {
  const version = /<Lexicon\b[^>]*\sversion="([^"]*)"/.exec(xml)?.[1] ?? ''

  const synsets = new Map<string, WordnetSense>()
  const headOfSatellite = new Map<string, string>()
  for (const m of xml.matchAll(/<Synset\b([^>]*)>([\s\S]*?)<\/Synset>/g)) {
    const attrs = m[1]!
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1]
    const pos = /\bpartOfSpeech="([^"]*)"/.exec(attrs)?.[1]
    const definition = /<Definition>([\s\S]*?)<\/Definition>/.exec(m[2]!)?.[1]
    if (!id || !pos || !definition) continue
    const example = /<Example>([\s\S]*?)<\/Example>/.exec(m[2]!)?.[1]
    synsets.set(id, {
      pos,
      definition: decodeXml(definition),
      ...(example ? { example: decodeXml(example) } : {}),
    })
    const head = /<SynsetRelation\b[^>]*\srelType="similar"[^>]*\starget="([^"]*)"/.exec(m[2]!)?.[1]
    if (pos === 's' && head) headOfSatellite.set(id, head)
  }

  interface RawSense {
    synset: string
    antonymSenseIds: string[]
  }
  const lemmaOfSense = new Map<string, string>()
  const lemmasOfSynset = new Map<string, string[]>()
  const sensesOfSynset = new Map<string, string[]>()
  const antonymIdsOfSense = new Map<string, string[]>()
  const raw = new Map<string, RawSense[]>()

  for (const m of xml.matchAll(/<LexicalEntry\b[^>]*>([\s\S]*?)<\/LexicalEntry>/g)) {
    const written = /<Lemma\b[^>]*\swrittenForm="([^"]*)"/.exec(m[1]!)?.[1]
    if (!written) continue
    const word = decodeXml(written)
    const list = raw.get(word) ?? []
    for (const s of m[1]!.matchAll(/<Sense\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Sense>)/g)) {
      const senseId = /\bid="([^"]*)"/.exec(s[1]!)?.[1]
      const synset = /\bsynset="([^"]*)"/.exec(s[1]!)?.[1]
      if (!synset) continue
      const antonymSenseIds = [
        ...(s[2] ?? '').matchAll(
          /<SenseRelation\b[^>]*\srelType="antonym"[^>]*\starget="([^"]*)"/g,
        ),
      ].map((r) => r[1]!)
      if (senseId) {
        lemmaOfSense.set(senseId, word)
        sensesOfSynset.set(synset, [...(sensesOfSynset.get(synset) ?? []), senseId])
        antonymIdsOfSense.set(senseId, antonymSenseIds)
      }
      const lemmas = lemmasOfSynset.get(synset) ?? []
      if (!lemmas.includes(word)) lemmas.push(word)
      lemmasOfSynset.set(synset, lemmas)
      list.push({ synset, antonymSenseIds })
    }
    raw.set(word, list)
  }

  const lemmasOf = (senseIds: string[]): string[] => [
    ...new Set(senseIds.flatMap((id) => lemmaOfSense.get(id) ?? [])),
  ]

  const byWord = new Map<string, WordnetSense[]>()
  for (const [word, list] of raw) {
    const senses: WordnetSense[] = []
    for (const { synset, antonymSenseIds } of list) {
      const base = synsets.get(synset)
      if (!base) continue
      const sense: WordnetSense = { ...base }
      const synonyms = (lemmasOfSynset.get(synset) ?? []).filter((w) => w !== word)
      if (synonyms.length > 0) sense.synonyms = synonyms
      let antonyms: WordnetAntonym[] = lemmasOf(antonymSenseIds).map((w) => ({ word: w }))
      const head = headOfSatellite.get(synset)
      if (antonyms.length === 0 && head)
        antonyms = lemmasOf(
          (sensesOfSynset.get(head) ?? []).flatMap((id) => antonymIdsOfSense.get(id) ?? []),
        ).map((w) => ({
          word: w,
          indirect: true as const,
        }))
      if (antonyms.length > 0) sense.antonyms = antonyms
      senses.push(sense)
    }
    byWord.set(word, senses)
  }

  const entries = [...byWord].map(([word, senses]) => ({ word, senses }))
  return { version, entries }
}
