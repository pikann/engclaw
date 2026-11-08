import { describe, expect, it } from 'vitest'
import { parseHeaderLines } from './llm-provider-panel'

describe('parseHeaderLines', () => {
  it('parses Name: value lines, skipping blanks and keeping colons in values', () => {
    expect(parseHeaderLines('HTTP-Referer: https://x.com\n\nX-Title:  Engclaw ')).toEqual({
      headers: [
        { name: 'HTTP-Referer', value: 'https://x.com' },
        { name: 'X-Title', value: 'Engclaw' },
      ],
    })
  })
  it('reports the first malformed line', () => {
    expect(parseHeaderLines('A: b\nnocolon')).toEqual({ badLine: 2 })
    expect(parseHeaderLines(': empty-name')).toEqual({ badLine: 1 })
  })
  it('treats empty text as "no headers"', () => {
    expect(parseHeaderLines('')).toEqual({ headers: [] })
  })
})
