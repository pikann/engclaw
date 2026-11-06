import { describe, expect, it } from 'vitest'
import {
  buildEtymology,
  kaikkiUrl,
  parseJsonl,
  validateEtymology,
  type WiktextractEntry,
} from './wiktextract-etymology'

const tpl = (name: string, args: Record<string, string>) => ({ name, args })

const abduct: WiktextractEntry = {
  word: 'abduct',
  lang_code: 'en',
  etymology_text: 'From Latin abductus, from abduco.',
  etymology_templates: [
    tpl('etymon', { '1': 'en', '2': ':der', '3': 'la:abductus' }),
    tpl('der', { '1': 'en', '2': 'la', '3': 'abductus' }),
    tpl('der', { '1': 'en', '2': 'la', '3': 'abduco' }),
    tpl('m', { '1': 'la', '2': 'ab' }),
  ],
  senses: [{ attestations: [{ date: 'Early 17ᵗʰ century.' }] }],
}

describe('buildEtymology', () => {
  it('builds an ordered origin chain with language names and a link-back', () => {
    const e = buildEtymology('abduct', [abduct])
    expect(e).toEqual({
      word: 'abduct',
      originChain: [
        { lang: 'Latin', langCode: 'la', term: 'abductus' },
        { lang: 'Latin', langCode: 'la', term: 'abduco' },
      ],
      firstUse: 'Early 17th century',
      sourceUrl: 'https://en.wiktionary.org/wiki/abduct#Etymology',
      etymonlineUrl: 'https://www.etymonline.com/word/abduct',
    })
  })

  it('extracts the PIE root from a root template, else from the chain', () => {
    const withRoot = buildEtymology('salt', [
      {
        word: 'salt',
        lang_code: 'en',
        etymology_templates: [
          tpl('inh', { '1': 'en', '2': 'enm', '3': 'salt' }),
          tpl('inh', { '1': 'en', '2': 'ine-pro', '3': '*sḗh₂l' }),
          tpl('root', { '1': 'en', '2': 'ine-pro', '3': '*sh₂el-' }),
        ],
      },
    ])
    expect(withRoot?.pieRoot).toBe('*sh₂el-')
    expect(withRoot?.originChain.map((s) => s.lang)).toEqual([
      'Middle English',
      'Proto-Indo-European',
    ])

    const fromChain = buildEtymology('salt', [
      {
        word: 'salt',
        lang_code: 'en',
        etymology_templates: [tpl('inh', { '1': 'en', '2': 'ine-pro', '3': '*sḗh₂l' })],
      },
    ])
    expect(fromChain?.pieRoot).toBe('*sḗh₂l')
  })

  it('uses a stated first-attestation year and does not invent dates', () => {
    const dated = buildEtymology('x', [
      {
        word: 'x',
        lang_code: 'en',
        etymology_text: 'From Latin x. First attested in 1782.',
        etymology_templates: [tpl('bor', { '1': 'en', '2': 'la', '3': 'x' })],
      },
    ])
    expect(dated?.firstUse).toBe('1782')
    const undated = buildEtymology('x', [
      {
        word: 'x',
        lang_code: 'en',
        etymology_templates: [tpl('bor', { '1': 'en', '2': 'la', '3': 'x' })],
      },
    ])
    expect(undated).not.toHaveProperty('firstUse')
    const noisy = buildEtymology('x', [
      {
        word: 'x',
        lang_code: 'en',
        etymology_templates: [tpl('bor', { '1': 'en', '2': 'la', '3': 'x' })],
        senses: [{ attestations: [{ date: 'First attested around 1350 to 1470' }] }],
      },
    ])
    expect(noisy).not.toHaveProperty('firstUse')
  })

  it('strips inline modifiers and skips placeholder terms', () => {
    const e = buildEtymology('telephone', [
      {
        word: 'telephone',
        lang_code: 'en',
        etymology_templates: [
          tpl('bor', { '1': 'en', '2': 'fr', '3': 'téléphone<id:device>' }),
          tpl('der', { '1': 'en', '2': 'grc', '3': '-' }),
        ],
      },
    ])
    expect(e?.originChain).toEqual([{ lang: 'French', langCode: 'fr', term: 'téléphone' }])
  })

  it('returns null when there is no English entry with an etymology (never invents one)', () => {
    expect(buildEtymology('foo', [])).toBeNull()
    expect(
      buildEtymology('foo', [{ word: 'foo', lang_code: 'en', etymology_templates: [] }]),
    ).toBeNull()
    expect(
      buildEtymology('foo', [
        {
          word: 'foo',
          lang_code: 'de',
          etymology_templates: [tpl('inh', { '2': 'la', '3': 'foo' })],
        },
      ]),
    ).toBeNull()
  })

  it('falls back to the language code for unknown languages', () => {
    const e = buildEtymology('y', [
      {
        word: 'y',
        lang_code: 'en',
        etymology_templates: [tpl('bor', { '1': 'en', '2': 'qqq', '3': 'y' })],
      },
    ])
    expect(e?.originChain[0]?.lang).toBe('qqq')
  })
})

describe('parseJsonl / kaikkiUrl / validateEtymology', () => {
  it('parses one entry per line, ignoring blanks', () => {
    expect(parseJsonl('{"word":"a"}\n\n{"word":"b"}\n').map((e) => e.word)).toEqual(['a', 'b'])
  })

  it('builds the per-word kaikki.org URL', () => {
    expect(kaikkiUrl('abduct')).toBe(
      'https://kaikki.org/dictionary/English/meaning/a/ab/abduct.jsonl',
    )
  })

  it('flags duplicates and bad urls', () => {
    const good = buildEtymology('abduct', [abduct])!
    expect(validateEtymology([good])).toEqual([])
    expect(validateEtymology([good, good])).toEqual(['duplicate word: abduct'])
    expect(validateEtymology([{ ...good, word: 'z', etymonlineUrl: 'http://x' }])).toEqual([
      'z: bad etymonlineUrl',
    ])
  })
})
