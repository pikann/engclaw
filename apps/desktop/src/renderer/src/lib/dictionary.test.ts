import { describe, expect, it } from 'vitest'
import { formatIpa, groupSenses, loadRecent, pushRecent, saveRecent } from './dictionary'

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
      { pos: 'v', definition: 'a', example: null },
      { pos: 'n', definition: 'b', example: null },
      { pos: 'v', definition: 'c', example: 'ex' },
    ]
    expect(groupSenses(senses).map((g) => [g.pos, g.senses.map((s) => s.definition)])).toEqual([
      ['v', ['a', 'c']],
      ['n', ['b']],
    ])
  })
})
