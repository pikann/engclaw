export interface EtymologyStep {
  lang: string
  langCode: string
  term: string
}

export interface WordEtymology {
  word: string
  originChain: EtymologyStep[]
  pieRoot?: string
  firstUse?: string
  sourceUrl: string
  etymonlineUrl: string
}

export const LICENSE_HEADER = {
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution:
    'Etymology and morphology: Wiktionary contributors, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), extracted by Wiktextract (https://github.com/tatuylonen/wiktextract) via kaikki.org.',
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  enm: 'Middle English',
  ang: 'Old English',
  la: 'Latin',
  'la-lat': 'Late Latin',
  'la-med': 'Medieval Latin',
  'la-new': 'New Latin',
  'la-vul': 'Vulgar Latin',
  grc: 'Ancient Greek',
  el: 'Greek',
  fr: 'French',
  fro: 'Old French',
  frm: 'Middle French',
  xno: 'Anglo-Norman',
  de: 'German',
  goh: 'Old High German',
  nl: 'Dutch',
  it: 'Italian',
  es: 'Spanish',
  pt: 'Portuguese',
  non: 'Old Norse',
  ar: 'Arabic',
  he: 'Hebrew',
  sa: 'Sanskrit',
  fa: 'Persian',
  'ine-pro': 'Proto-Indo-European',
  'gem-pro': 'Proto-Germanic',
  'gmw-pro': 'Proto-West Germanic',
  'itc-pro': 'Proto-Italic',
  'cel-pro': 'Proto-Celtic',
  'sla-pro': 'Proto-Slavic',
}

const CHAIN_TEMPLATES = new Set([
  'inh',
  'inh+',
  'der',
  'der+',
  'bor',
  'bor+',
  'lbor',
  'slb',
  'cal',
  'calque',
  'pqrf',
])

interface Template {
  name?: string
  args?: Record<string, string>
}

interface Attestation {
  date?: string
}

interface Sense {
  attestations?: Attestation[]
}

export interface WiktextractEntry {
  word?: string
  lang_code?: string
  etymology_text?: string
  etymology_templates?: Template[]
  senses?: Sense[]
}

export function parseJsonl(body: string): WiktextractEntry[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WiktextractEntry)
}

const langName = (code: string) => LANG_NAMES[code] ?? code

// Wiktionary uses "term<id:x>", "term<t:gloss>" style inline modifiers and "-" for "no term".
const cleanTerm = (raw: string) => raw.replace(/<[^>]*>/g, '').trim()

function originChain(templates: Template[]): EtymologyStep[] {
  const chain: EtymologyStep[] = []
  for (const t of templates) {
    if (!t.name || !CHAIN_TEMPLATES.has(t.name) || !t.args) continue
    const langCode = t.args['2']
    const term = cleanTerm(t.args['3'] ?? '')
    if (!langCode || !term || term === '-') continue
    const last = chain[chain.length - 1]
    if (last && last.langCode === langCode && last.term === term) continue
    chain.push({ lang: langName(langCode), langCode, term })
  }
  return chain
}

function pieRootOf(templates: Template[], chain: EtymologyStep[]): string | undefined {
  for (const t of templates) {
    if (t.name === 'root' && t.args?.['2'] === 'ine-pro') {
      const term = cleanTerm(t.args['3'] ?? '')
      if (term) return term
    }
  }
  return chain.find((s) => s.langCode === 'ine-pro')?.term
}

const SUPERSCRIPTS: Record<string, string> = {
  ᵗ: 't',
  ʰ: 'h',
  ˢ: 's',
  ᵗʰ: 'th',
  ⁿ: 'n',
  ʳ: 'r',
  ᵈ: 'd',
}

// Only a stated year or century is kept; nothing is inferred.
function firstUseOf(entry: WiktextractEntry): string | undefined {
  const text = entry.etymology_text ?? ''
  const year =
    /\b(?:first\s+(?:attested|recorded|used)|attested|recorded)\b[^.]{0,40}?\b(1\d{3}|[5-9]\d{2})\b/i.exec(
      text,
    )
  if (year) return year[1]
  const date = (entry.senses ?? []).flatMap((s) => s.attestations ?? []).find((a) => a.date)?.date
  if (!date) return undefined
  const clean = date
    .replace(/[ᵗʰˢⁿʳᵈ]/g, (c) => SUPERSCRIPTS[c] ?? c)
    .replace(/\.$/, '')
    .trim()
  return /^(?:\d{3,4}|(?:(?:early|mid|late)\s+)?\d{1,2}th century)$/i.test(clean)
    ? clean
    : undefined
}

export function wiktionaryUrl(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#Etymology`
}

export function etymonlineUrl(word: string): string {
  return `https://www.etymonline.com/word/${encodeURIComponent(word)}`
}

export function kaikkiUrl(word: string): string {
  return `https://kaikki.org/dictionary/English/meaning/${encodeURIComponent(word[0] ?? '')}/${encodeURIComponent(word.slice(0, 2))}/${encodeURIComponent(word)}.jsonl`
}

export function buildEtymology(word: string, entries: WiktextractEntry[]): WordEtymology | null {
  for (const entry of entries) {
    if (entry.lang_code !== 'en' || entry.word?.toLowerCase() !== word.toLowerCase()) continue
    const templates = entry.etymology_templates ?? []
    const chain = originChain(templates)
    if (!chain.length) continue
    const result: WordEtymology = {
      word,
      originChain: chain,
      sourceUrl: wiktionaryUrl(word),
      etymonlineUrl: etymonlineUrl(word),
    }
    const pie = pieRootOf(templates, chain)
    if (pie) result.pieRoot = pie
    const firstUse = firstUseOf(entry)
    if (firstUse) result.firstUse = firstUse
    return result
  }
  return null
}

export function validateEtymology(items: WordEtymology[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.word)) errors.push(`duplicate word: ${item.word}`)
    seen.add(item.word)
    if (!item.originChain.length) errors.push(`${item.word}: empty originChain`)
    if (!item.sourceUrl.startsWith('https://en.wiktionary.org/'))
      errors.push(`${item.word}: bad sourceUrl`)
    if (!item.etymonlineUrl.startsWith('https://www.etymonline.com/word/'))
      errors.push(`${item.word}: bad etymonlineUrl`)
  }
  return errors
}
