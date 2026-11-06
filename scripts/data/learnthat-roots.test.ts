import { describe, expect, it } from 'vitest'
import { isAllowed, parseRobots, parseRoots, validateRoots } from './learnthat-roots'

const row = (root: string, meaning: string, origin: string, examples: string) =>
  `<tr><td><a href="word_lists/view/1">x</a></td><td><span><strong>${root}</strong></span></td><td><span>${meaning}</span></td><td>${origin}</td><td><span>${examples}</span></td></tr>`

const page = (rows: string) =>
  `<html><table class="root_meanings"><thead><tr><td>Link</td><td>Root word</td><td>Meanings</td><td>Origin</td><td>Examples</td></tr></thead><tbody>${rows}</tbody></table></html>`

describe('parseRoots', () => {
  it('extracts root, meaning, origin and example words only', () => {
    const [f] = parseRoots(
      page(
        row(
          'aer/o',
          'air',
          '<span style="color:#00f">Greek</span>',
          'aerate - to let air reach something; aerial - relating to the air',
        ),
      ),
    )
    expect(f).toEqual({
      root: 'aer/o',
      forms: ['aer/o'],
      meaning: 'air',
      origins: ['Greek'],
      examples: ['aerate', 'aerial'],
      sourceUrl: 'https://www.learnthat.org/pages/view/roots.html',
    })
  })

  it('never includes definition prose from the source', () => {
    const out = JSON.stringify(
      parseRoots(page(row('act', 'do', 'Latin', 'react - to do something in response'))),
    )
    expect(out).not.toContain('in response')
  })

  it('splits comma-separated forms and multiple origins, decodes entities', () => {
    const [f] = parseRoots(
      page(row('ambi, amphi', 'both &amp; around', 'Latin<br />Greek', 'ambiguous - two meanings')),
    )
    expect(f.forms).toEqual(['ambi', 'amphi'])
    expect(f.origins).toEqual(['Latin', 'Greek'])
    expect(f.meaning).toBe('both & around')
  })

  it('handles rows without dashes and with an empty origin', () => {
    const [f] = parseRoots(
      page(row('contra/o', 'against', '', 'contradict to argue against, Contraflow')),
    )
    expect(f.examples).toEqual(['contradict', 'contraflow'])
    expect(f.origins).toEqual([])
  })

  it('skips spacer and header rows', () => {
    const html = page('<tr><td></td><td></td></tr>' + row('act', 'do', 'Latin', 'react - respond'))
    expect(parseRoots(html).map((f) => f.root)).toEqual(['act'])
  })

  it('throws when the table is missing', () => {
    expect(() => parseRoots('<html></html>')).toThrow(/layout changed/)
  })
})

describe('validateRoots', () => {
  it('flags incomplete facts and too-small datasets', () => {
    const errors = validateRoots([
      { root: 'x', forms: ['x'], meaning: '', origins: [], examples: [], sourceUrl: '' },
    ])
    expect(errors.some((e) => /only 1 roots/.test(e))).toBe(true)
    expect(errors.some((e) => /empty meaning/.test(e))).toBe(true)
    expect(errors.some((e) => /no example words/.test(e))).toBe(true)
  })
})

describe('robots.txt', () => {
  const rules = parseRobots(
    'User-agent: bad\nDisallow: /\n\nUser-agent: *\nDisallow: /quiz/\nAllow: /\n',
  )
  it('applies only the * group', () => {
    expect(rules.disallow).toEqual(['/quiz/'])
  })
  it('blocks disallowed paths and allows the roots page', () => {
    expect(isAllowed(rules, '/quiz/start')).toBe(false)
    expect(isAllowed(rules, '/pages/view/roots.html')).toBe(true)
  })
})
