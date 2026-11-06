export interface WordnetSense {
  pos: string
  definition: string
  example?: string
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
  }

  const byWord = new Map<string, WordnetSense[]>()
  for (const m of xml.matchAll(/<LexicalEntry\b[^>]*>([\s\S]*?)<\/LexicalEntry>/g)) {
    const word = /<Lemma\b[^>]*\swrittenForm="([^"]*)"/.exec(m[1]!)?.[1]
    if (!word) continue
    const key = decodeXml(word)
    const senses = byWord.get(key) ?? []
    for (const s of m[1]!.matchAll(/<Sense\b[^>]*\ssynset="([^"]*)"/g)) {
      const sense = synsets.get(s[1]!)
      if (sense) senses.push(sense)
    }
    byWord.set(key, senses)
  }

  const entries = [...byWord].map(([word, senses]) => ({ word, senses }))
  return { version, entries }
}
