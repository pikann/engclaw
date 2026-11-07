import { describe, expect, it } from 'vitest'
import type { RootEntry } from './morphemes'
import { buildFamilies, collectLineages, extractLineage, resolveSeeds } from './root-families'
import type { WiktextractEntry } from './wiktextract-etymology'

const entry = (
  word: string,
  templates: { name: string; args: Record<string, string> }[],
): WiktextractEntry => ({ word, lang_code: 'en', etymology_templates: templates })

const root = (rootField: string, examples: string[]): RootEntry => ({
  root: rootField,
  forms: [rootField],
  meaning: '',
  origins: [],
  examples,
  sourceUrl: '',
})

describe('extractLineage', () => {
  it('reads Latin terms from chain templates and strips macrons', () => {
    const l = extractLineage(
      entry('intercept', [{ name: 'der', args: { '1': 'en', '2': 'la', '3': 'interceptus' } }]),
    )
    expect([...l!.seeds]).toEqual(['interceptus'])
    expect(
      extractLineage(entry('x', [{ name: 'inh', args: { '2': 'la', '3': 'cāpere' } }]))!.seeds,
    ).toEqual(new Set(['capere']))
  })

  it('reads affix components, keeping English parents and collecting hyphenated affixes', () => {
    const affixes = new Set<string>()
    const l = extractLineage(
      entry('captivating', [
        { name: 'suffix', args: { '1': 'en', '2': 'captivate', '3': 'ing' } },
        { name: 'af', args: { '1': 'en', '2': 'la:in-', '3': 'la:cāpere' } },
      ]),
      affixes,
    )
    expect([...l!.parents]).toEqual(['captivate', 'ing'])
    expect([...l!.seeds]).toEqual(['capere'])
    expect([...affixes]).toEqual(['in'])
  })

  it('returns null without usable terms', () => {
    expect(extractLineage(entry('a', [{ name: 'm', args: { '1': 'en' } }]))).toBeNull()
  })
})

describe('resolveSeeds', () => {
  it('follows English parents and survives cycles', () => {
    const lineages = collectLineages([
      entry('captivate', [{ name: 'der', args: { '2': 'la', '3': 'captivus' } }]),
      entry('captivating', [{ name: 'suffix', args: { '1': 'en', '2': 'captivate', '3': 'ing' } }]),
      entry('loop', [{ name: 'suffix', args: { '1': 'en', '2': 'loop', '3': 'y' } }]),
    ])
    expect([...resolveSeeds('captivating', lineages)]).toEqual(['captivus'])
    expect([...resolveSeeds('loop', lineages)]).toEqual([])
  })
})

describe('buildFamilies', () => {
  const lineages = collectLineages([
    entry('capture', [{ name: 'der', args: { '2': 'la', '3': 'captura' } }]),
    entry('captive', [{ name: 'der', args: { '2': 'la', '3': 'captivus' } }]),
    entry('captivate', [{ name: 'der', args: { '2': 'la', '3': 'captivus' } }]),
    entry('captain', [{ name: 'der', args: { '2': 'la', '3': 'capitaneus' } }]),
    entry('capsule', [{ name: 'der', args: { '2': 'la', '3': 'captivus' } }]),
    entry('intercept', [{ name: 'der', args: { '2': 'la', '3': 'captivus' } }]),
  ])
  const allowed = new Set(['capture', 'captive', 'captivate', 'captain', 'capsule', 'intercept'])

  it('adds words that spell a root form and share a source term with its examples', () => {
    const [family] = buildFamilies([root('capt', ['captive'])], lineages, {
      allowed,
      affixTerms: new Set(),
    })
    // capsule shares the source term but does not spell "capt"; captain spells it but has another source
    expect(family!.words).toEqual(['captivate', 'captive'])
    expect(family!.seeds).toEqual(['captivus'])
  })

  it('keeps only the examples when no usable source term exists', () => {
    const [family] = buildFamilies([root('xyz', ['zzz'])], lineages, {
      allowed,
      affixTerms: new Set(),
    })
    expect(family!.words).toEqual(['zzz'])
  })

  it('ignores seeds that are known affixes', () => {
    const [family] = buildFamilies([root('capt', ['captive'])], lineages, {
      allowed,
      affixTerms: new Set(['captivus']),
    })
    expect(family!.words).toEqual(['captive'])
  })

  it('does not expand prefix-like roots with very short forms', () => {
    const [family] = buildFamilies([root('ca', ['captive'])], lineages, {
      allowed,
      affixTerms: new Set(),
    })
    expect(family!.words).toEqual(['captive'])
  })

  it('does not expand roots that are plain prefixes', () => {
    const [family] = buildFamilies([root('con', ['captive'])], lineages, {
      allowed,
      affixTerms: new Set(),
    })
    expect(family!.words).toEqual(['captive'])
  })

  it('links words through a shared Proto-Indo-European root', () => {
    const pie = (word: string) =>
      entry(word, [{ name: 'root', args: { '1': 'en', '2': 'ine-pro', '3': '*speḱ-' } }])
    const l = collectLineages([pie('inspect'), pie('suspect')])
    const [family] = buildFamilies([root('spect', ['suspect'])], l, {
      allowed: new Set(['inspect', 'suspect']),
      affixTerms: new Set(),
    })
    expect(family!.words).toEqual(['inspect', 'suspect'])
  })
})
