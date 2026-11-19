import { describe, expect, it } from 'vitest'
import {
  formatIpa,
  groupSenses,
  loadRecent,
  mergeRelated,
  pushRecent,
  saveRecent,
} from './dictionary'

describe('pushRecent', () => {
  it('puts the newest word first and drops an earlier copy', () => {
    const a = { id: 1, word: 'a' }
    const b = { id: 2, word: 'b' }
    expect(pushRecent([a, b], { id: 2, word: 'b' })).toEqual([b, a])
  })

  it('keeps at most `max` words', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ id: i, word: `w${i}` }))
    const next = pushRecent(list, { id: 99, word: 'new' }, 10)
    expect(next).toHaveLength(10)
    expect(next[0]!.id).toBe(99)
    expect(next.at(-1)!.id).toBe(8)
  })
})

describe('recent words storage', () => {
  const store = (initial?: string) => {
    const data = new Map<string, string>(
      initial === undefined ? [] : [['engclaw.recentWords', initial]],
    )
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it('round-trips', () => {
    const s = store()
    saveRecent(s, [{ id: 1, word: 'a' }])
    expect(loadRecent(s)).toEqual([{ id: 1, word: 'a' }])
  })

  it('ignores corrupt or malformed data', () => {
    expect(loadRecent(store('not json'))).toEqual([])
    expect(loadRecent(store('[{"id":"x"}]'))).toEqual([])
    expect(loadRecent(store())).toEqual([])
  })
})

describe('formatIpa', () => {
  it('wraps the symbols in slashes', () => {
    expect(formatIpa('ˌɪnˈspɛkt')).toBe('/ˌɪnˈspɛkt/')
  })
})

describe('groupSenses', () => {
  it('groups consecutive senses by part of speech, keeping order', () => {
    const senses = [
      { pos: 'v', definition: 'a', example: null, synonyms: [], antonyms: [] },
      { pos: 'n', definition: 'b', example: null, synonyms: [], antonyms: [] },
      { pos: 'v', definition: 'c', example: 'ex', synonyms: [], antonyms: [] },
    ]
    expect(groupSenses(senses).map((g) => [g.pos, g.senses.map((s) => s.definition)])).toEqual([
      ['v', ['a', 'c']],
      ['n', ['b']],
    ])
  })
})

describe('mergeRelated', () => {
  const sense = (synonyms: string[], antonyms: [string, boolean][] = []) => ({
    pos: 'a',
    definition: 'd',
    example: null,
    synonyms: synonyms.map((word, id) => ({ id, word })),
    antonyms: antonyms.map(([word, indirect], id) => ({ id, word, indirect })),
  })

  it('merges senses without duplicates, in order of first appearance', () => {
    const senses = [sense(['glad', 'merry']), sense(['merry', 'cheerful'])]
    expect(mergeRelated(senses, 'synonyms').map((s) => s.word)).toEqual([
      'glad',
      'merry',
      'cheerful',
    ])
  })

  it('prefers a direct antonym over an indirect one for the same word', () => {
    const senses = [sense([], [['cold', true]]), sense([], [['cold', false]])]
    expect(mergeRelated(senses, 'antonyms')).toEqual([{ id: 0, word: 'cold', indirect: false }])
  })

  it('returns nothing when no sense has relations', () => {
    expect(mergeRelated([sense([])], 'synonyms')).toEqual([])
  })
})
