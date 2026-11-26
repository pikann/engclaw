import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { convert, pinyin } from 'pinyin-pro'
import type { DictionarySearchResult, DictionaryWord } from '@engclaw/ipc-contract'

/** Separate id range prevents Chinese words being mistaken for English words or deck cards. */
export const CHINESE_ID_BASE = 1_000_000_000
interface Entry {
  traditional: string
  simplified: string
  pinyin: string
  definitions: string[]
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/u:/g, 'v')
    .normalize('NFD')
    .replace(/u\u0308/g, 'v')
    .replace(/[\u0300-\u036f1-5\s']/g, '')

const numberedReading = (text: string) =>
  text.toLowerCase().replace(/u:|ü/gu, 'v').replace(/\s+/gu, '')

/** The bundled, unmodified CC-CEDICT archive is parsed lazily, entirely offline. */
export class ChineseDictionary {
  private entries: Entry[] | undefined
  private speechSpellings: Map<string, string> | undefined
  private spokenVariants: Map<string, string> | undefined
  constructor(private readonly source: () => string) {}
  private all() {
    if (!this.entries) this.entries = parseCedict(this.source())
    return this.entries
  }
  /** Match the complete numbered reading, keeping homophones with different tones apart. */
  speechText(numbered: string, segmented = false): string | undefined {
    if (!this.speechSpellings) {
      this.speechSpellings = new Map()
      this.spokenVariants = new Map()
      const entries = this.all().filter((entry) => /^\p{Script=Han}+$/u.test(entry.simplified))
      const usage = new Map<string, number>()
      for (const word of new Set(entries.map((entry) => entry.simplified))) {
        if (Array.from(word).length < 2) continue
        for (const char of new Set(word)) usage.set(char, (usage.get(char) ?? 0) + 1)
      }
      for (const entry of entries) {
        const key = numberedReading(entry.pinyin)
        if (!/^(?:[a-z]+[1-5])+$/u.test(key)) continue
        const previous = this.speechSpellings.get(key)
        const isolated = Array.from(entry.simplified).length === 1
        // A standalone sample needs a character with just one possible reading.
        if (
          previous &&
          (!isolated || (usage.get(previous) ?? 0) >= (usage.get(entry.simplified) ?? 0))
        )
          continue
        if (isolated) {
          const reading = pinyin(entry.simplified, { type: 'all' })[0]
          if (reading?.polyphonic.length !== 1) continue
          const pronunciation = convert(reading.pinyin, { format: 'symbolToNum' }).replaceAll(
            'ü',
            'v',
          )
          if (pronunciation !== key) continue
        }
        this.speechSpellings.set(key, entry.simplified)
      }

      for (const { pinyin: reading, simplified: word } of entries) {
        const key = numberedReading(reading)
        if (!/^(?:[a-z]+[1-5]){2,}$/u.test(key)) continue
        const syllables = key.match(/[a-z]+[1-5]/gu) ?? []
        if (/[一不]/u.test(word)) {
          const options = { type: 'array', toneType: 'num', v: true } as const
          const lexical = pinyin(word, { ...options, toneSandhi: false }).join('')
          if (lexical === key) {
            const spoken = pinyin(word, options).join('')
            if (spoken !== key && !this.spokenVariants.has(spoken))
              this.spokenVariants.set(spoken, word)
          }
        }
        // A two-syllable 3+3 word is also commonly entered with its spoken 2+3 tones.
        if (syllables.length === 2 && syllables.every((item) => item.endsWith('3'))) {
          const spoken = syllables[0]!.slice(0, -1) + '2' + syllables[1]
          if (!this.spokenVariants.has(spoken)) this.spokenVariants.set(spoken, word)
        }
      }
    }
    const lookup = (key: string) => this.speechSpellings?.get(key) ?? this.spokenVariants?.get(key)
    const syllables = numbered.split(',').map((part) => part.trim())
    if (segmented && syllables.length > 1) {
      // Keep the characters of the whole word when they still have the requested
      // reading in isolation. Sandhi may require a different sample for a single beat.
      const whole = lookup(syllables.join(''))
      const characters = whole ? Array.from(whole) : []
      if (
        characters.length === syllables.length &&
        characters.every(
          (char, index) => pinyin(char, { toneType: 'num', v: true }) === syllables[index],
        )
      ) {
        return characters.join('，')
      }
    }
    const parts = syllables.map((part) => {
      const exact = lookup(part)
      if (exact) return exact

      // Keep the same voice as the individual samples for an unlisted phrase,
      // but only if the joined characters retain every requested syllable and tone.
      const chunks = part.match(/[a-z]+[1-5]/gu) ?? []
      if (chunks.length < 2 || chunks.join('') !== part) return undefined
      const samples = chunks.map((chunk) => this.speechSpellings?.get(chunk))
      if (samples.some((sample) => !sample || Array.from(sample).length !== 1)) return undefined
      const joined = samples.join('')
      return pinyin(joined, { toneType: 'num', v: true, type: 'array' }).join('') === part
        ? joined
        : undefined
    })
    return parts.every(Boolean) ? parts.join('，') : undefined
  }
  search(query: string, limit = 20): DictionarySearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const roman = normalize(q)
    const ranked: { index: number; rank: number }[] = []
    this.all().forEach((entry, index) => {
      const hanzi = [entry.simplified, entry.traditional]
      const py = normalize(entry.pinyin)
      const rank = hanzi.includes(q)
        ? 0
        : roman && py === roman
          ? 1
          : hanzi.some((word) => word.startsWith(q))
            ? 2
            : roman && py.startsWith(roman)
              ? 3
              : entry.definitions.some((text) => text.toLowerCase().includes(q))
                ? 4
                : -1
      if (rank >= 0) ranked.push({ index, rank })
    })
    return ranked
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, limit)
      .map(({ index }) => ({
        id: CHINESE_ID_BASE + index,
        word: this.all()[index]!.simplified,
        traditional: this.all()[index]!.traditional,
        match: 'prefix',
      }))
  }
  word(id: number): DictionaryWord | null {
    const entry = this.all()[id - CHINESE_ID_BASE]
    if (!entry) return null
    return {
      id,
      word: entry.simplified,
      language: 'zh',
      traditional: entry.traditional,
      pinyin: convert(
        entry.pinyin.replace(/u:/gi, (spelling) => (spelling[0] === 'U' ? 'Ü' : 'ü')),
        { format: 'numToSymbol' },
      ),
      pronunciations: [],
      senses: entry.definitions.map((definition) => ({
        pos: '',
        definition,
        example: null,
        synonyms: [],
        antonyms: [],
      })),
      morphemes: [],
      etymology: null,
    }
  }
}

export function parseCedict(text: string): Entry[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/$/.exec(line)
    return match
      ? [
          {
            traditional: match[1]!,
            simplified: match[2]!,
            pinyin: match[3]!,
            definitions: match[4]!.split('/'),
          },
        ]
      : []
  })
}

export const readCedict = (path: string) => gunzipSync(readFileSync(path)).toString('utf8')
