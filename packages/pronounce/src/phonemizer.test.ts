import { describe, expect, it, vi } from 'vitest'
import { CachedPhonemizer, type PhonemizeBackend } from './phonemizer'

function fake(table: Record<string, string>) {
  const calls: string[][] = []
  const backend: PhonemizeBackend = {
    phonemize: vi.fn(async (lines: string[]) => {
      calls.push(lines)
      return lines.map((l) => table[l] ?? '')
    }),
  }
  return { backend, calls }
}

describe('CachedPhonemizer', () => {
  it('maps words to normalized phones, dropping stress and length marks', async () => {
    const { backend } = fake({ 'hello world': 'h_ə_l_ˈoʊ w_ˈɜː_l_d' })
    const p = new CachedPhonemizer(backend)
    expect(await p.getPhonemesWithWordMapping('Hello, world!')).toEqual([
      { word: 'hello', phones: ['h', 'ə', 'l', 'oʊ'] },
      { word: 'world', phones: ['w', 'ɚ', 'l', 'd'] },
    ])
    expect(await p.getExpectedPhones('Hello, world!')).toEqual([
      'h',
      'ə',
      'l',
      'oʊ',
      'w',
      'ɚ',
      'l',
      'd',
    ])
  })

  it('memoizes sentences', async () => {
    const { backend, calls } = fake({ 'hello world': 'h_ə_l_ˈoʊ w_ˈɜː_l_d' })
    const p = new CachedPhonemizer(backend)
    await p.getExpectedPhones('hello world')
    await p.getExpectedPhones('Hello,   WORLD!')
    expect(calls).toHaveLength(1)
  })

  it('does not let callers mutate cached results', async () => {
    const { backend } = fake({ hi: 'h_ˈaɪ' })
    const p = new CachedPhonemizer(backend)
    ;(await p.getPhonemesWithWordMapping('hi'))[0]!.phones.push('x')
    expect(await p.getExpectedPhones('hi')).toEqual(['h', 'aɪ'])
  })

  it('falls back to per-word phonemization when the word count differs', async () => {
    const { backend, calls } = fake({
      'a b': 'x', // espeak merged the words
      a: 'ɐ',
      b: 'b_ˈiː',
    })
    const p = new CachedPhonemizer(backend)
    expect(await p.getPhonemesWithWordMapping('a b')).toEqual([
      { word: 'a', phones: ['ə'] },
      { word: 'b', phones: ['b', 'i'] },
    ])
    expect(calls).toEqual([['a b'], ['a', 'b']])
  })

  it('merges multi-word espeak output into one slot on fallback and reuses the word cache', async () => {
    const { backend, calls } = fake({
      'x 1st': 'e_ks',
      x: 'ɛ_ks',
      '1st': 'f_ˈɜː_s_t tʃ',
    })
    const p = new CachedPhonemizer(backend)
    const r = await p.getPhonemesWithWordMapping('x 1st')
    expect(r[1]).toEqual({ word: '1st', phones: ['f', 'ɚ', 's', 't', 'tʃ'] })
    await p.getPhonemesWithWordMapping('1st')
    expect(calls).toHaveLength(2)
  })

  it('splits hyphenated words exactly as the comparison side does', async () => {
    const { backend } = fake({ 'well known': 'w_ˈɛ_l n_ˈoʊ_n' })
    const p = new CachedPhonemizer(backend)
    expect((await p.getPhonemesWithWordMapping('Well-known')).map((w) => w.word)).toEqual([
      'well',
      'known',
    ])
  })

  it('returns empty for text with no words without calling the backend', async () => {
    const { backend } = fake({})
    const p = new CachedPhonemizer(backend)
    expect(await p.getPhonemesWithWordMapping('?!')).toEqual([])
    expect(backend.phonemize).not.toHaveBeenCalled()
  })

  it('evicts oldest sentences beyond cacheSize', async () => {
    const { backend, calls } = fake({ a: 'ɐ', b: 'b', c: 'k' })
    const p = new CachedPhonemizer(backend, { cacheSize: 2 })
    for (const t of ['a', 'b', 'c', 'a']) await p.getExpectedPhones(t)
    expect(calls).toHaveLength(4)
  })
})
