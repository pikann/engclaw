import { describe, expect, it } from 'vitest'
import { expandForms, linkMorphemes, type RootEntry } from './morphemes'

const root = (rootField: string, examples: string[] = []): RootEntry => ({
  root: rootField,
  forms: [rootField],
  meaning: '',
  origins: [],
  examples,
  sourceUrl: '',
})

describe('expandForms', () => {
  it('expands slash-joined suffix letters into variants', () => {
    expect(expandForms('aer/o')).toEqual(['aer', 'aero'])
    expect(expandForms('a/c/d')).toEqual(['a', 'ac', 'ad'])
    expect(expandForms('agr/i/o')).toEqual(['agr', 'agri', 'agro'])
  })

  it('treats multi-letter slash parts as alternative forms', () => {
    expect(expandForms('ann/enn')).toEqual(['ann', 'enn'])
  })

  it('splits comma and space separated alternatives', () => {
    expect(expandForms('ambi, amphi')).toEqual(['ambi', 'amphi'])
    expect(expandForms('chrom/o chromat/o, chros')).toEqual([
      'chrom',
      'chromo',
      'chromat',
      'chromato',
      'chros',
    ])
  })
})

describe('linkMorphemes', () => {
  const roots = [root('a, ab/s'), root('duct'), root('cede, ceed, cess'), root('act'), root('re')]

  it('splits a word into prefix and root pieces ordered by position', () => {
    const links = linkMorphemes('abduct', [
      { index: 0, entry: roots[0]! },
      { index: 1, entry: roots[1]! },
    ])
    expect(links).toEqual([
      { position: 0, kind: 'prefix', form: 'ab', rootIndex: 0 },
      { position: 1, kind: 'root', form: 'duct', rootIndex: 1 },
    ])
  })

  it('prefers the longest form when several match the same spot', () => {
    const links = linkMorphemes('abscess', [{ index: 0, entry: root('a, ab/s, abs') }])
    expect(links[0]).toMatchObject({ form: 'abs', kind: 'prefix' })
  })

  it('ignores short forms that are not at the start of the word', () => {
    expect(linkMorphemes('bear', [{ index: 0, entry: root('a') }])).toEqual([])
  })

  it('links adjacent pieces without overlap', () => {
    const links = linkMorphemes('react', [
      { index: 0, entry: roots[3]! },
      { index: 1, entry: roots[4]! },
    ])
    expect(links.map((l) => l.form)).toEqual(['re', 'act'])
  })

  it('marks a trailing known suffix as suffix', () => {
    const links = linkMorphemes('astrology', [
      { index: 0, entry: root('astro') },
      { index: 1, entry: root('logy') },
    ])
    expect(links.map((l) => l.kind)).toEqual(['root', 'suffix'])
  })

  it('returns nothing when no form is found in the word', () => {
    expect(linkMorphemes('table', [{ index: 0, entry: roots[1]! }])).toEqual([])
  })
})
