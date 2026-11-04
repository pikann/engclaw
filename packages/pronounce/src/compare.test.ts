import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  align,
  comparePhones,
  pronunciations,
  splitWords,
  wordReports,
  type PhoneRecognition,
} from './compare'
import { opcodes } from './levenshtein'

describe('opcodes', () => {
  it('groups edits like python-Levenshtein', () => {
    expect(opcodes(['a', 'b', 'c'], ['x', 'b', 'c', 'd'])).toEqual([
      ['replace', 0, 1, 0, 1],
      ['equal', 1, 3, 1, 3],
      ['insert', 3, 3, 3, 4],
    ])
  })
  it('breaks ties as rapidfuzz does', () => {
    expect(opcodes([...'ddbadad'], [...'adcbac'])).toEqual([
      ['insert', 0, 0, 0, 1],
      ['equal', 0, 1, 1, 2],
      ['replace', 1, 2, 2, 3],
      ['equal', 2, 4, 3, 5],
      ['replace', 4, 5, 5, 6],
      ['delete', 5, 7, 6, 6],
    ])
  })
})

describe('align', () => {
  it('attaches insertions to the previous expected phone and spreads replacements', () => {
    expect(align(['a', 'b'], ['a', 'b', 'x']).map((s) => [...s])).toEqual([[0], [1, 2]])
    expect(align(['a', 'b'], ['x', 'y', 'z']).map((s) => [...s])).toEqual([[0, 1], [2]])
  })
})

describe('pronunciations', () => {
  it('adds alternates and the cross-word merged form', () => {
    expect(pronunciations('the', ['ð', 'ə'])).toEqual([
      ['ð', 'ə'],
      ['ð', 'ə'],
      ['ð', 'i'],
      ['ð', 'ɪ'],
    ])
    expect(pronunciations('to', ['t', 'u'], 't')).toContainEqual(['u'])
  })
})

describe('comparePhones', () => {
  const run = (heard: string[], text: string, groups: string[][]) =>
    comparePhones(heard, splitWords(text), groups)

  it('reports nothing for a perfect reading', () => {
    const r = run(['k', 'æ', 't'], 'cat', [['k', 'æ', 't']])
    expect(r.errors).toEqual([])
    expect(r.phoneErrorRate).toBe(0)
  })

  it('charges a substitution fully and a near phone by half', () => {
    const wrong = wordReports(['æ', 'm'], ['at'], [['æ', 't']])
    expect(wrong[0]!.phones.map((p) => p.confidence)).toEqual([0, 1])
    const near = wordReports(['æ', 'd'], ['at'], [['æ', 't']])
    expect(near[0]!.phones.map((p) => p.confidence)).toEqual([0, 0.5])
    expect(run(['æ', 'm'], 'at', [['æ', 't']]).wordsWithErrors).toEqual(['at'])
  })

  it('accepts alternate pronunciations', () => {
    expect(run(['ð', 'i'], 'the', [['ð', 'ə']]).errors).toEqual([])
  })

  it('scales confidence down by the posterior of the expected phone', () => {
    const vocab = ['<pad>', 'æ', 't', 'm']
    const frame = (id: number, p: number) => {
      const row = new Array<number>(vocab.length).fill(Math.log(1e-6))
      row[id] = Math.log(p)
      return row
    }
    // frames: æ, then 'm' with 't' at posterior 0.03 (below the 0.05 plausibility ceiling)
    const rows = [frame(1, 0.99), [...frame(3, 0.9)].map((v, i) => (i === 2 ? Math.log(0.03) : v))]
    const rec: PhoneRecognition = {
      phones: ['æ', 'm'],
      confidences: [0.99, 0.9],
      spans: [
        [0, 1],
        [1, 2],
      ],
      logPosteriors: Float32Array.from(rows.flat()),
      frames: 2,
      vocab,
    }
    const r = wordReports(rec, ['at'], [['æ', 't']])
    expect(r[0]!.phones[1]!.confidence).toBeCloseTo(0.4, 3)
  })
})

describe('golden set', () => {
  const dir = resolve(__dirname, '../../../tests/golden/cases')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(resolve(dir, file), 'utf8'))
    const d = c.result.differences
    it(`matches ${c.id}`, () => {
      const r = comparePhones(d.heard_phones, splitWords(c.text), d.expected_phones)
      expect(r.expectedPhones).toEqual(d.expected_phones)
      expect(r.heardPhones).toEqual(d.heard_phones)
      expect(r.heardPhonesConfidence).toHaveLength(d.heard_phones_confidence.length)
      expect(r.phoneErrorRate).toBe(d.phoneme_error_rate)
      // Golden outputs were produced with frame posteriors, whose plausibility scaling can only lower
      // confidences (and so unflag words); without them ours are upper bounds and flag a superset.
      for (const g of d.errors) {
        const e = r.errors.find((x) => x.position === g.position)
        expect(e, `${g.word} flagged`).toBeDefined()
        expect([e!.word, e!.expected, e!.actual, e!.phoneDistance]).toEqual([
          g.word,
          g.expected,
          g.actual,
          g.phone_distance,
        ])
        expect(e!.phones.map((p) => [p.expected, p.heard])).toEqual(
          g.phones.map((p: { expected: string; heard: string }) => [p.expected, p.heard]),
        )
        expect(e!.confidence).toBeGreaterThanOrEqual(g.confidence)
        e!.phones.forEach((p, k) =>
          expect(p.confidence).toBeGreaterThanOrEqual(g.phones[k].confidence),
        )
      }
    })
  }
})
