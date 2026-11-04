import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { splitWords } from './compare'
import { CachedPhonemizer, type PhonemizeBackend } from './phonemizer'

interface Golden {
  text: string
  /** Raw `espeak-ng -q -v en-us --ipa --sep=_` output for the punctuation-stripped sentence. */
  line: string
}
const data = JSON.parse(
  readFileSync(new URL('../test-data/espeak-golden.json', import.meta.url), 'utf8'),
) as { sentences: Golden[]; words: Record<string, string> }
const golden = data.sentences

/** Replays recorded espeak output (whole sentences and single words) so the test needs no binary. */
const replay: PhonemizeBackend = {
  phonemize: async (lines) =>
    lines.map(
      (l) => golden.find((g) => splitWords(g.text).join(' ') === l)?.line ?? data.words[l] ?? '',
    ),
}

describe('phonemizer golden corpus', () => {
  it('maps every word of every sentence (word count parity, no empty words)', async () => {
    const p = new CachedPhonemizer(replay)
    for (const g of golden) {
      const words = await p.getPhonemesWithWordMapping(g.text)
      expect(
        words.map((w) => w.word),
        g.text,
      ).toEqual(splitWords(g.text))
      for (const w of words) expect(w.phones.length, `${g.text} / ${w.word}`).toBeGreaterThan(0)
    }
  })

  it('never emits stress, length marks or separators in phones', async () => {
    const p = new CachedPhonemizer(replay)
    for (const g of golden)
      for (const ph of await p.getExpectedPhones(g.text)) expect(ph).not.toMatch(/[ˈˌː_\s]/)
  })

  it('uses the per-word fallback when espeak merges words (have been)', async () => {
    const p = new CachedPhonemizer(replay)
    const words = await p.getPhonemesWithWordMapping('I have been living here for three years.')
    expect(words.map((w) => w.word)).toContain('been')
    expect(words.find((w) => w.word === 'i')!.phones).toEqual(['aɪ'])
  })

  it('yields the reference phones for a known sentence', async () => {
    const p = new CachedPhonemizer(replay)
    expect((await p.getExpectedPhones('Hello, world!')).join(' ')).toBe('h ə l oʊ w ɚ l d')
  })
})
