import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { convert } from 'pinyin-pro'
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

/** The bundled, unmodified CC-CEDICT archive is parsed lazily, entirely offline. */
export class ChineseDictionary {
  private entries: Entry[] | undefined
  constructor(private readonly source: () => string) {}
  private all() {
    if (!this.entries) this.entries = parseCedict(this.source())
    return this.entries
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
      senses: entry.definitions.map((definition) => ({ pos: '', definition, example: null })),
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
