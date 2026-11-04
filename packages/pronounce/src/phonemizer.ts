/**
 * Expected-phone service (port of OpenPronounce `get_expected_phones` / `get_phonemes_with_word_mapping`).
 * The espeak-ng process lives behind `PhonemizeBackend`, so its packaging/license can change (ENGC-11).
 */

import { splitWords } from './compare'
import { normalizePhones } from './normalize'

/** Raw espeak access: one input line -> one output line (`--ipa --sep=_`: `_` between phones, space between words). */
export interface PhonemizeBackend {
  phonemize(lines: string[]): Promise<string[]>
  dispose?(): void
}

export interface WordPhones {
  word: string
  /** Normalized expected phones for the word. */
  phones: string[]
}

export interface Phonemizer {
  getExpectedPhones(text: string): Promise<string[]>
  getPhonemesWithWordMapping(text: string): Promise<WordPhones[]>
  dispose(): void
}

/** Split one espeak output word into phone tokens; drops stress marks and empty tokens. */
function wordPhones(group: string): string[] {
  return group
    .split('_')
    .map((p) => p.replace(/[ˈˌ]/g, ''))
    .filter(Boolean)
}

function splitGroups(line: string): string[][] {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map(wordPhones)
    .filter((g) => g.length > 0)
}

export interface CachedPhonemizerOptions {
  /** Max memoized sentences and words each (default 2000). */
  cacheSize?: number
  lang?: string
}

export class CachedPhonemizer implements Phonemizer {
  private readonly sentences = new Map<string, WordPhones[]>()
  private readonly words = new Map<string, string[]>()
  private readonly cacheSize: number
  private readonly lang: string

  constructor(
    private readonly backend: PhonemizeBackend,
    options: CachedPhonemizerOptions = {},
  ) {
    this.cacheSize = options.cacheSize ?? 2000
    this.lang = options.lang ?? 'en'
  }

  async getExpectedPhones(text: string): Promise<string[]> {
    return (await this.getPhonemesWithWordMapping(text)).flatMap((w) => w.phones)
  }

  async getPhonemesWithWordMapping(text: string): Promise<WordPhones[]> {
    const words = splitWords(text)
    if (words.length === 0) return []
    const key = words.join(' ')
    const hit = this.sentences.get(key)
    if (hit) return hit.map(clone)

    const known = words.length === 1 ? this.words.get(key) : undefined
    if (known) return [{ word: key, phones: [...known] }]

    const [line] = await this.backend.phonemize([key])
    const groups = splitGroups(line ?? '')
    const result =
      groups.length === words.length
        ? words.map((word, i) => ({ word, phones: normalizePhones(groups[i]!, this.lang) }))
        : await this.perWord(words)
    remember(this.sentences, key, result, this.cacheSize)
    return result.map(clone)
  }

  dispose(): void {
    this.backend.dispose?.()
    this.sentences.clear()
    this.words.clear()
  }

  /** Fallback when espeak split or merged words differently from the input: phonemize each word alone. */
  private async perWord(words: string[]): Promise<WordPhones[]> {
    const known = new Map<string, string[]>()
    const missing: string[] = []
    for (const w of new Set(words)) {
      const cached = this.words.get(w)
      if (cached) known.set(w, cached)
      else missing.push(w)
    }
    if (missing.length > 0) {
      const lines = await this.backend.phonemize(missing)
      missing.forEach((word, i) => {
        // A word espeak speaks as several words still maps to one slot: merge its groups.
        const phones = normalizePhones(splitGroups(lines[i] ?? '').flat(), this.lang)
        known.set(word, phones)
        remember(this.words, word, phones, this.cacheSize)
      })
    }
    return words.map((word) => ({ word, phones: [...(known.get(word) ?? [])] }))
  }
}

function clone(w: WordPhones): WordPhones {
  return { word: w.word, phones: [...w.phones] }
}

function remember<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  if (map.size >= max) map.delete(map.keys().next().value as string)
  map.set(key, value)
}
