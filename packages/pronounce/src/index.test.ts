import { expect, it } from 'vitest'
import { levenshtein } from './index'

it('computes edit distance', () => {
  expect(levenshtein(['k', 'ae', 't'], ['k', 'aa', 't'])).toBe(1)
  expect(levenshtein([], ['a'])).toBe(1)
})
